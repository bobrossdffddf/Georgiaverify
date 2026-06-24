// SQLite data layer (better-sqlite3). Stores Discord<->Roblox links and
// short-lived pending verification tokens.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';
import log from './logger.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS verifications (
    discord_id      TEXT PRIMARY KEY,
    roblox_id       TEXT NOT NULL,
    roblox_username TEXT NOT NULL,
    guild_id        TEXT NOT NULL,
    verified_by     TEXT,                -- NULL = self-verify, else moderator id (force verify)
    verified_at     INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );
  -- One Roblox account may only be linked to one Discord account at a time.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_verifications_roblox ON verifications(roblox_id);

  CREATE TABLE IF NOT EXISTS pending_tokens (
    jti         TEXT PRIMARY KEY,
    discord_id  TEXT NOT NULL,
    guild_id    TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    consumed_at INTEGER            -- NULL until the link is used (single use)
  );
  CREATE INDEX IF NOT EXISTS idx_pending_discord ON pending_tokens(discord_id);
`);

const now = () => Date.now();

// ---------------------------------------------------------------- links
const stmtGetByDiscord = db.prepare('SELECT * FROM verifications WHERE discord_id = ?');
const stmtGetByRoblox = db.prepare('SELECT * FROM verifications WHERE roblox_id = ?');
const stmtUpsert = db.prepare(`
  INSERT INTO verifications (discord_id, roblox_id, roblox_username, guild_id, verified_by, verified_at, updated_at)
  VALUES (@discord_id, @roblox_id, @roblox_username, @guild_id, @verified_by, @verified_at, @updated_at)
  ON CONFLICT(discord_id) DO UPDATE SET
    roblox_id       = excluded.roblox_id,
    roblox_username = excluded.roblox_username,
    guild_id        = excluded.guild_id,
    verified_by     = excluded.verified_by,
    updated_at      = excluded.updated_at
`);
const stmtDelete = db.prepare('DELETE FROM verifications WHERE discord_id = ?');

export function getByDiscordId(discordId) {
  return stmtGetByDiscord.get(String(discordId)) || null;
}
export function getByRobloxId(robloxId) {
  return stmtGetByRoblox.get(String(robloxId)) || null;
}

/**
 * Link (or re-link) a Discord account to a Roblox account.
 * Throws { code: 'ROBLOX_TAKEN', discordId } if the Roblox id already belongs to someone else.
 */
export function linkAccount({ discordId, robloxId, robloxUsername, guildId, verifiedBy = null }) {
  discordId = String(discordId);
  robloxId = String(robloxId);

  const existingOwner = getByRobloxId(robloxId);
  if (existingOwner && existingOwner.discord_id !== discordId) {
    const err = new Error('This Roblox account is already linked to another Discord user.');
    err.code = 'ROBLOX_TAKEN';
    err.discordId = existingOwner.discord_id;
    throw err;
  }

  const prev = getByDiscordId(discordId);
  const t = now();
  stmtUpsert.run({
    discord_id: discordId,
    roblox_id: robloxId,
    roblox_username: robloxUsername,
    guild_id: String(guildId),
    verified_by: verifiedBy ? String(verifiedBy) : null,
    verified_at: prev ? prev.verified_at : t,
    updated_at: t,
  });
  return { previous: prev, current: getByDiscordId(discordId) };
}

/** Remove a link. Returns the deleted row (or null if none existed). */
export function unlinkByDiscordId(discordId) {
  const prev = getByDiscordId(discordId);
  stmtDelete.run(String(discordId));
  return prev;
}

// ------------------------------------------------------------- tokens
const stmtCreateToken = db.prepare(`
  INSERT INTO pending_tokens (jti, discord_id, guild_id, created_at, expires_at, consumed_at)
  VALUES (?, ?, ?, ?, ?, NULL)
`);
const stmtGetToken = db.prepare('SELECT * FROM pending_tokens WHERE jti = ?');
const stmtConsumeToken = db.prepare('UPDATE pending_tokens SET consumed_at = ? WHERE jti = ? AND consumed_at IS NULL');
const stmtDeleteUserTokens = db.prepare('DELETE FROM pending_tokens WHERE discord_id = ?');
const stmtCleanup = db.prepare('DELETE FROM pending_tokens WHERE expires_at < ?');

export function createPendingToken({ jti, discordId, guildId, expiresAt }) {
  // Invalidate any earlier outstanding links for this user so only the newest works.
  stmtDeleteUserTokens.run(String(discordId));
  stmtCreateToken.run(jti, String(discordId), String(guildId), now(), expiresAt);
}

export function getPendingToken(jti) {
  return stmtGetToken.get(jti) || null;
}

/**
 * Atomically mark a token consumed. Returns the token row if it was valid
 * (existed, not expired, not already consumed); otherwise returns null.
 */
export function consumePendingToken(jti) {
  const row = stmtGetToken.get(jti);
  if (!row) return null;
  if (row.consumed_at) return null;
  if (row.expires_at < now()) return null;
  const res = stmtConsumeToken.run(now(), jti);
  if (res.changes !== 1) return null; // lost a race
  return row;
}

export function cleanupExpiredTokens() {
  const res = stmtCleanup.run(now());
  if (res.changes) log.debug(`Cleaned up ${res.changes} expired token(s).`);
  return res.changes;
}

export function stats() {
  const verified = db.prepare('SELECT COUNT(*) c FROM verifications').get().c;
  const pending = db.prepare('SELECT COUNT(*) c FROM pending_tokens WHERE consumed_at IS NULL AND expires_at > ?').get(now()).c;
  return { verified, pending };
}

// Periodically purge expired tokens.
setInterval(() => cleanupExpiredTokens(), 5 * 60 * 1000).unref?.();

export default db;
