/** ~2200 chars per page, split on paragraph boundaries only. */
export function paginate(txt: string, size = 2200): string[] {
  const paras = txt
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const pages: string[] = [];
  let buf = '';
  for (const p of paras) {
    if (buf.length + p.length > size && buf) {
      pages.push(buf.trim());
      buf = '';
    }
    buf += p + '\n\n';
  }
  if (buf.trim()) pages.push(buf.trim());
  return pages;
}
