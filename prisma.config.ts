import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Vite reads .env.local, so Prisma reads it too — one env file, not two.
// (Prisma 7 does not auto-load dotenv files.)
loadEnv({ path: '.env.local', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations must run over the SESSION-mode pooler (port 5432). The
    // transaction-mode pooler (6543) cannot hold the advisory locks and
    // prepared statements Prisma Migrate needs.
    //
    // Prisma is a schema tool here and nothing more: the app never connects
    // this way. It talks to Supabase over PostgREST so that RLS
    // (`user_id = auth.uid()`) is enforced on every read and write. This URL
    // carries the database password and bypasses RLS entirely — keep it out
    // of git and never give it a VITE_ prefix.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
