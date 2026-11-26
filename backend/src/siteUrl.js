// oramara/backend/src/siteUrl.js
// The website address that report links, invites and password resets point at.
// PORTAL_URL wins, except that a localhost address is ignored once the backend is hosted
// (an easy slip when copying a local .env into Render). Then the address the request came from,
// if it is one of our sites, then the live site.

const LIVE_SITE = 'https://oramara.vercel.app';
const isHosted = () => process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
const isLocal = (u) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(u || '');
const tidy = (u) => String(u || '').trim().replace(/\/+$/, '');
const ourSite = (u) =>
  /^https:\/\/oramara(-[a-z0-9-]+)?(-fechinmitchells-projects)?\.vercel\.app$/i.test(u) || /^https:\/\/(www\.)?oramara\.ie$/i.test(u);

export function siteUrl(origin) {
  const configured = tidy(process.env.PORTAL_URL);
  if (configured && !(isHosted() && isLocal(configured))) return configured;
  const from = tidy(origin);
  if (from && (ourSite(from) || (!isHosted() && isLocal(from)))) return from;
  return isHosted() ? LIVE_SITE : 'http://localhost:5173';
}

// Report links saved before this fix may point at localhost: point them at the right site
export function fixLink(url) {
  if (!url || !isHosted() || !isLocal(url)) return url;
  return url.replace(/^https?:\/\/[^/]+/i, siteUrl());
}
