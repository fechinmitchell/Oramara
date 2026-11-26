// oramara/backend/src/rateLimit.js
// A small in memory limiter for login forms. Counts failed tries per IP address and per email,
// and locks that key out for a while once it has too many. Enough for one server on Render.

const buckets = new Map();

function bucket(key, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  return b;
}

// Drop old entries now and then so the map never grows without end
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}, 10 * 60 * 1000).unref();

export function createLimiter({ name, max, windowMs }) {
  const keyFor = (kind, value) => `${name}:${kind}:${String(value || '').toLowerCase()}`;

  const keys = (req) => {
    const list = [keyFor('ip', req.ip)];
    const email = req.body?.email;
    if (email) list.push(keyFor('email', String(email).trim()));
    return list;
  };

  return {
    // Express middleware: stops the request when any of its keys is locked
    check(req, res, next) {
      for (const key of keys(req)) {
        const b = bucket(key, windowMs);
        if (b.count >= max) {
          const minutes = Math.max(1, Math.ceil((b.resetAt - Date.now()) / 60000));
          res.set('Retry-After', String(minutes * 60));
          return res.status(429).json({ error: `Too many tries. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.` });
        }
      }
      next();
    },
    fail(req) {
      for (const key of keys(req)) bucket(key, windowMs).count += 1;
    },
    // A good login clears the count for that email and address
    clear(req) {
      for (const key of keys(req)) buckets.delete(key);
    }
  };
}

// Simple limiter by IP only, counting every request (used for portal logins and invites)
export function limitByIp({ name, max, windowMs }) {
  return (req, res, next) => {
    const b = bucket(`${name}:ip:${req.ip}`, windowMs);
    b.count += 1;
    if (b.count > max) {
      const minutes = Math.max(1, Math.ceil((b.resetAt - Date.now()) / 60000));
      res.set('Retry-After', String(minutes * 60));
      return res.status(429).json({ error: `Too many tries. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.` });
    }
    next();
  };
}
