// Bootstrap server ZProject — Express + Socket.IO + uploads + migrasi DB.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { initRepo } from './src/repo.mjs';
import { setupRoutes } from './src/routes.mjs';
import { verifyToken } from './src/auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

await initRepo();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
io.use(async (socket, next) => {
  try {
    const payload = verifyToken(socket.handshake.auth?.token);
    // Cek status akun ke DB — user nonaktif tidak boleh connect socket (vuln-0010).
    const { getRepo } = await import('./src/repo.mjs');
    const u = await getRepo().userById(payload.id);
    if (!u || !u.is_active) return next(new Error('unauthorized'));
    socket.user = { id: u.id, username: u.username, display_name: u.display_name, role: u.role };
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

setupRoutes(app, io, uploadsDir);

// Akses foto bukti — dilindungi JWT + object-level authorization: hanya pemilik
// order (trader) atau admin yang boleh mengunduh (vuln-0004).
app.get('/uploads/:name', async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token;
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  const p = path.join(uploadsDir, path.basename(req.params.name));
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'File tidak ditemukan' });
  // Hanya izinkan file dengan ekstensi gambar aman — file .html/.svg dsb
  // (sisa upload lama / hasil bypass) tidak pernah disajikan sebagai HTML.
  if (!/\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(p)) {
    return res.status(415).json({ error: 'Jenis berkas tidak diizinkan' });
  }
  const { getRepo } = await import('./src/repo.mjs');
  const owner = await getRepo().photoOwner(path.basename(p));
  const isAdmin = payload.role === 'admin';
  if (!owner || (owner.trader_id !== payload.id && !isAdmin)) {
    return res.status(403).json({ error: 'Hanya order milik Anda yang dapat diakses.' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline; filename="foto.jpg"');
  res.sendFile(p);
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => {
  console.log(`[zproject] API berjalan di http://localhost:${PORT}`);
  console.log(`[zproject] Repo: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'memori (dev)'} · Uploads: ${uploadsDir}`);
});
