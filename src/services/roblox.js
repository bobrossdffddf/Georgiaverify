// Roblox OAuth 2.0 (OpenID Connect) helpers + public API lookups.
// Docs: https://create.roblox.com/docs/cloud/auth/oauth2-overview
import config from '../config.js';
import log from '../logger.js';

const RBX = config.roblox;

function timeout(ms = 10000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function asJson(res, label) {
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    log.error(`${label} failed ${res.status}:`, text.slice(0, 500));
    const err = new Error(`${label} failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/** Build the URL we send the user to so they authorize with Roblox. */
export function buildAuthorizeUrl({ state, codeChallenge }) {
  const u = new URL(RBX.authorizeUrl);
  u.searchParams.set('client_id', RBX.clientId);
  u.searchParams.set('redirect_uri', config.redirectUri);
  u.searchParams.set('scope', RBX.scope);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

/** Exchange an authorization code (+ PKCE verifier) for tokens. */
export async function exchangeCode(code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: RBX.clientId,
    client_secret: RBX.clientSecret,
    code_verifier: codeVerifier,
  });
  const t = timeout();
  try {
    const res = await fetch(RBX.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: t.signal,
    });
    return await asJson(res, 'Roblox token exchange');
  } finally { t.done(); }
}

/** Fetch the authenticated user's profile via the OIDC userinfo endpoint. */
export async function fetchUserInfo(accessToken) {
  const t = timeout();
  try {
    const res = await fetch(RBX.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: t.signal,
    });
    const info = await asJson(res, 'Roblox userinfo');
    // `sub` is the Roblox user id; `preferred_username` is the @username; `name` is display name.
    return {
      id: String(info.sub),
      username: info.preferred_username || info.nickname || info.name || `user${info.sub}`,
      displayName: info.name || info.nickname || info.preferred_username,
      profile: info.profile || `https://www.roblox.com/users/${info.sub}/profile`,
      picture: info.picture || null,
    };
  } finally { t.done(); }
}

/** Headshot CDN url for embeds. Falls back gracefully on error. */
export async function getAvatarHeadshot(robloxId) {
  const t = timeout();
  try {
    const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=420x420&format=Png&isCircular=false`;
    const res = await fetch(url, { signal: t.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.imageUrl || null;
  } catch (e) {
    log.warn('getAvatarHeadshot failed:', e.message);
    return null;
  } finally { t.done(); }
}

/** Resolve a Roblox @username to { id, username, displayName }. Used by /fverify. */
export async function resolveUsername(username) {
  const t = timeout();
  try {
    const res = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
      signal: t.signal,
    });
    const data = await asJson(res, 'Roblox username lookup');
    const u = data?.data?.[0];
    if (!u) return null;
    return { id: String(u.id), username: u.name, displayName: u.displayName || u.name };
  } finally { t.done(); }
}

/** Look up a Roblox user by numeric id. Used by /fverify. */
export async function getUserById(id) {
  const t = timeout();
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(id)}`, { signal: t.signal });
    if (res.status === 404) return null;
    const u = await asJson(res, 'Roblox user lookup');
    return { id: String(u.id), username: u.name, displayName: u.displayName || u.name };
  } finally { t.done(); }
}

/** Accepts a numeric id OR a @username and returns the resolved user, or null. */
export async function resolveRobloxInput(input) {
  const cleaned = String(input).trim().replace(/^@/, '');
  if (/^\d+$/.test(cleaned)) {
    return await getUserById(cleaned);
  }
  return await resolveUsername(cleaned);
}

export function profileUrl(robloxId) {
  return `https://www.roblox.com/users/${robloxId}/profile`;
}
