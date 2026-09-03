// JWT + middleware otorisasi. Token via header `Authorization: Bearer <token>`.
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-ganti-di-produksi';
const EXPIRES = process.env.JWT_EXPIRES_IN || '12h';

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function bearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function requireAuth(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
  try {
    const payload = verifyToken(token);
    // Cek status akun ke DB — token user nonaktif / password di-reset ditolak (vuln-0010).
    const { getRepo } = await import('./repo.mjs');
    const u = await getRepo().userById(payload.id);
    if (!u || !u.is_active) return res.status(401).json({ error: 'UNAUTHORIZED' });
    // Tanda tangan ulang versi fresh: role/status dari DB, bukan klaim token basi.
    req.user = { id: u.id, username: u.username, display_name: u.display_name, role: u.role };
    next();
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin yang dapat melakukan aksi ini.' });
    next();
  });
}
