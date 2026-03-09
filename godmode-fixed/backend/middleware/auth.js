import { timingSafeEqual } from 'crypto';

const AUTH_KEY = process.env.GODMODE_API_KEY || 'godmode-dev-key';

function safeCompare(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function requireAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || !safeCompare(key, AUTH_KEY)) {
    return res.status(401).json({ error: 'Unauthorized. Provide x-api-key header.' });
  }
  next();
}

export { AUTH_KEY };
