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
io.use((socket, next) => {
  try {
    socket.user = verifyToken(socket.handshake.auth?.token);
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

setupRoutes(app, io, uploadsDir);

// Akses foto bukti — dilindungi JWT (Authorization header atau ?token= utk native).
app.get('/uploads/:name', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token;
  try {
    verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  const p = path.join(uploadsDir, path.basename(req.params.name));
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'File tidak ditemukan' });
  res.sendFile(p);
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => {
  console.log(`[zproject] API berjalan di http://localhost:${PORT}`);
  console.log(`[zproject] Repo: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'memori (dev)'} · Uploads: ${uploadsDir}`);
});
