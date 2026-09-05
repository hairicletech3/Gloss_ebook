-- Book covers.
--
-- Only the storage path is kept. The bucket is private, so the image is
-- fetched through a signed URL at display time rather than being addressable
-- by anyone who guesses the path — same handling as the book file itself.
--
-- No RLS work is needed: `books` already carries the highlights/words policy
-- (`user_id = auth.uid()`), and this is a column on that table, not a new one.

-- AlterTable
ALTER TABLE "books" ADD COLUMN "cover_path" TEXT;
