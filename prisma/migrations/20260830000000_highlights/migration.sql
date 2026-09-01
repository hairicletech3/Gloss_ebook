-- Highlights and notes.
--
-- Same split as the init migration: the CreateTable / CreateIndex / AddForeignKey
-- blocks match what `prisma migrate diff` generates from schema.prisma;
-- everything after the "BEYOND PRISMA" banner is hand-written because RLS and
-- the auth.users foreign key cannot be expressed in the Prisma schema language.

-- CreateTable
CREATE TABLE "highlights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "page" INTEGER NOT NULL,
    "para_index" INTEGER NOT NULL,
    "start_off" INTEGER NOT NULL,
    "end_off" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "highlights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "highlights_book_page" ON "highlights"("user_id", "book_id", "page");

-- AddForeignKey
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════
-- BEYOND PRISMA — not expressible in schema.prisma
-- ════════════════════════════════════════════════════════════════════

-- ── ownership ───────────────────────────────────────────────────────
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── constraints Prisma cannot express ───────────────────────────────
-- A zero-width or reversed anchor would render as an invisible highlight
-- that can never be clicked to remove.
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_range_check"
  CHECK ("start_off" >= 0 AND "end_off" > "start_off");

-- Keep the palette honest: lib/highlights.ts is the source of truth and the
-- renderer falls back to yellow for anything it does not recognise, but there
-- is no reason to let an unknown value into the table in the first place.
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_color_check"
  CHECK ("color" IN ('yellow', 'blue', 'green', 'pink'));

-- ── row level security ──────────────────────────────────────────────
ALTER TABLE "highlights" ENABLE ROW LEVEL SECURITY;

CREATE POLICY highlights_own ON "highlights"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
