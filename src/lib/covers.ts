import { supabase, BOOKS_BUCKET } from './supabase';
import type { BookMeta } from './types';

export const COVER_MAX_BYTES = 8 * 1024 * 1024;
/** Long edge of the stored image. A shelf tile is ~128px wide, so this is
    already generous on a 2x display, and it keeps a 6MB phone photo from
    being stored — and re-downloaded — at full size forever. */
const COVER_MAX_EDGE = 900;
const SIGNED_URL_TTL = 60 * 60;

export class CoverError extends Error {}

/**
 * Re-encodes the picked image to a bounded JPEG in the browser. Returns the
 * original blob untouched if anything about the decode fails — a slightly
 * large cover beats refusing the upload.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, COVER_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 400_000) {
      bitmap.close();
      return file;
    }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Uploads a cover and points the row at it. The filename carries a timestamp
 * so a replacement lands on a new path — a signed URL for the old one may
 * still be in flight, and overwriting in place would leave the shelf showing
 * a stale image from cache.
 */
export async function uploadCover(book: BookMeta, file: File, userId: string): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new CoverError('That file is not an image.');
  }
  if (file.size > COVER_MAX_BYTES) {
    throw new CoverError('That image is too large — 8MB at most.');
  }

  const body = await shrink(file);
  const ext = body.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'img');
  const path = `${userId}/${book.id}/cover-${Date.now()}.${ext}`;

  const up = await supabase.storage.from(BOOKS_BUCKET).upload(path, body, {
    contentType: body.type || 'image/jpeg',
    upsert: false,
  });
  if (up.error) throw up.error;

  const { error } = await supabase.from('books').update({ cover_path: path }).eq('id', book.id);
  if (error) {
    await supabase.storage.from(BOOKS_BUCKET).remove([path]);
    throw error;
  }

  // Best-effort: the row is already correct, so a failure here only leaves an
  // unreferenced file behind rather than a broken cover.
  if (book.cover_path) {
    await supabase.storage.from(BOOKS_BUCKET).remove([book.cover_path]);
  }
  return path;
}

export async function removeCover(book: BookMeta): Promise<void> {
  const { error } = await supabase.from('books').update({ cover_path: null }).eq('id', book.id);
  if (error) throw error;
  if (book.cover_path) {
    await supabase.storage.from(BOOKS_BUCKET).remove([book.cover_path]);
  }
}

/**
 * Signed URLs for a whole shelf in one request. The bucket is private, so
 * covers cannot simply be linked by path.
 */
export async function signCovers(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;

  const { data, error } = await supabase.storage
    .from(BOOKS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) throw error;

  for (const row of data ?? []) {
    if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
  }
  return out;
}
