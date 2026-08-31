// Pilih implementasi repo: PostgreSQL bila DATABASE_URL di-set, memori bila tidak.
import { createPool, migrate } from './db.mjs';
import pgFactory from './pg.mjs';
import * as mem from './memdb.mjs';

let repo = null;

export async function initRepo() {
  if (process.env.DATABASE_URL) {
    const pool = createPool();
    await migrate(pool);
    repo = pgFactory(pool);
  } else {
    console.log('[trader-track] DATABASE_URL tidak di-set — memakai repo memori (dev).');
    repo = mem;
  }
  return repo;
}

export function getRepo() {
  if (!repo) throw new Error('Repo belum diinisialisasi. Panggil initRepo() dulu.');
  return repo;
}
