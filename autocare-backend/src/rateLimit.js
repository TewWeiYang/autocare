import { HttpError } from './errors.js';

// A small in-memory limiter: at most `max` requests per client address in `windowMs`.
// It resets when the server restarts, which is fine for a single server.
export function rateLimit({ max, windowMs }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
    recent.push(now);
    hits.set(req.ip, recent);
    // Forget addresses that have been quiet, so the map cannot grow forever.
    if (hits.size > 5000) {
      for (const [ip, times] of hits) if (!times.some((t) => now - t < windowMs)) hits.delete(ip);
    }
    next();
  };
}
