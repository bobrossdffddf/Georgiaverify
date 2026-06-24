// Signed, single-use, time-limited verification links + stateless OAuth state.
//
//  * Verify token  -> handed to a user (panel button or /verify). 10 min TTL,
//                     single use (tracked in the DB). Encodes the Discord id.
//  * OAuth state   -> carried through the Roblox OAuth round-trip. Encodes the
//                     Discord id + the PKCE code_verifier. Stateless (signed JWT).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { createPendingToken, consumePendingToken } from '../db.js';

const SECRET = config.tokenSecret;

// ----------------------------------------------------------- verify token
export function createVerifyToken(discordId, guildId) {
  const jti = crypto.randomUUID();
  const ttl = config.tokenTtlSeconds;
  const expiresAt = Date.now() + ttl * 1000;

  createPendingToken({ jti, discordId: String(discordId), guildId: String(guildId), expiresAt });

  const token = jwt.sign(
    { sub: String(discordId), gid: String(guildId), typ: 'verify' },
    SECRET,
    { algorithm: 'HS256', expiresIn: ttl, jwtid: jti },
  );
  const url = `${config.baseUrl}/verify?token=${encodeURIComponent(token)}`;
  return { token, url, jti, expiresAt };
}

/** Validate the JWT only (signature + expiry). Returns payload or throws. */
export function decodeVerifyToken(token) {
  const payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  if (payload.typ !== 'verify') throw new Error('Wrong token type');
  return payload;
}

/**
 * Validate + atomically consume the token (single use).
 * Returns { discordId, guildId, jti }. Throws on invalid/expired/used.
 */
export function consumeVerifyToken(token) {
  const payload = decodeVerifyToken(token);
  const row = consumePendingToken(payload.jti);
  if (!row) {
    const err = new Error('This verification link has expired or has already been used.');
    err.code = 'TOKEN_SPENT';
    throw err;
  }
  return { discordId: row.discord_id, guildId: row.guild_id, jti: payload.jti };
}

// --------------------------------------------------------------- PKCE
export function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}
export function codeChallengeFor(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ------------------------------------------------------------ OAuth state
// Short-lived signed blob carried in the `state` query param. Stateless.
export function createOAuthState({ discordId, guildId, jti, codeVerifier }) {
  return jwt.sign(
    { sub: String(discordId), gid: String(guildId), jti, cv: codeVerifier, typ: 'oauth' },
    SECRET,
    { algorithm: 'HS256', expiresIn: 600 },
  );
}
export function verifyOAuthState(state) {
  const payload = jwt.verify(state, SECRET, { algorithms: ['HS256'] });
  if (payload.typ !== 'oauth') throw new Error('Wrong state type');
  return payload;
}
