// Offline self-test: token sign/verify, single-use enforcement, DB link/unlink,
// roblox-taken conflict, OAuth/PKCE state, and Components V2 embed shape.
// Runs without Discord/Roblox/network. Usage: npm test
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Provide dummy env so config.js validation passes.
process.env.DISCORD_TOKEN ||= 'test-token';
process.env.DISCORD_CLIENT_ID ||= '1000000000000000000';
process.env.GUILD_ID ||= '2000000000000000000';
process.env.ROBLOX_CLIENT_ID ||= 'rbx-client';
process.env.ROBLOX_CLIENT_SECRET ||= 'rbx-secret';
process.env.TOKEN_SECRET ||= crypto.randomBytes(32).toString('hex');
process.env.BASE_URL ||= 'https://verify.example.com';
process.env.DATABASE_PATH = path.join(os.tmpdir(), `gsrp-selftest-${Date.now()}.db`);

let passed = 0;
const ok = (name) => { console.log(`  ✓ ${name}`); passed++; };

const tokens = await import('../src/services/tokens.js');
const db = await import('../src/db.js');
const embeds = await import('../src/bot/embeds.js');

const DISCORD_A = '111111111111111111';
const DISCORD_B = '222222222222222222';
const GUILD = process.env.GUILD_ID;

// ---- tokens: sign / decode / single-use ----
{
  const { token, jti } = tokens.createVerifyToken(DISCORD_A, GUILD);
  const decoded = tokens.decodeVerifyToken(token);
  assert.equal(decoded.sub, DISCORD_A);
  assert.equal(decoded.jti, jti);
  ok('verify token signs & decodes with correct discord id');

  const consumed = tokens.consumeVerifyToken(token);
  assert.equal(consumed.discordId, DISCORD_A);
  ok('verify token consumes once');

  assert.throws(() => tokens.consumeVerifyToken(token), /expired|used/i);
  ok('verify token rejects reuse (single-use)');
}

// ---- tokens: tampering rejected ----
{
  const { token } = tokens.createVerifyToken(DISCORD_A, GUILD);
  const bad = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
  assert.throws(() => tokens.decodeVerifyToken(bad));
  ok('tampered token rejected');
}

// ---- PKCE + oauth state roundtrip ----
{
  const verifier = tokens.generateCodeVerifier();
  const challenge = tokens.codeChallengeFor(verifier);
  assert.ok(verifier.length > 20 && challenge.length > 20);
  const state = tokens.createOAuthState({ discordId: DISCORD_A, guildId: GUILD, jti: 'abc', codeVerifier: verifier });
  const st = tokens.verifyOAuthState(state);
  assert.equal(st.sub, DISCORD_A);
  assert.equal(st.cv, verifier);
  ok('oauth state carries discord id + pkce verifier');
}

// ---- DB: link / lookup / re-link ----
{
  db.linkAccount({ discordId: DISCORD_A, robloxId: '5500001', robloxUsername: 'AlphaRBX', guildId: GUILD });
  const byD = db.getByDiscordId(DISCORD_A);
  const byR = db.getByRobloxId('5500001');
  assert.equal(byD.roblox_id, '5500001');
  assert.equal(byR.discord_id, DISCORD_A);
  ok('linkAccount stores + looks up by discord and roblox id');

  // Re-link same discord to a different roblox account (account change).
  db.linkAccount({ discordId: DISCORD_A, robloxId: '5500002', robloxUsername: 'AlphaRBX2', guildId: GUILD });
  assert.equal(db.getByDiscordId(DISCORD_A).roblox_id, '5500002');
  assert.equal(db.getByRobloxId('5500001'), null);
  ok('re-linking updates the roblox account');
}

// ---- DB: roblox-taken conflict ----
{
  let threw = null;
  try {
    db.linkAccount({ discordId: DISCORD_B, robloxId: '5500002', robloxUsername: 'AlphaRBX2', guildId: GUILD });
  } catch (e) { threw = e; }
  assert.ok(threw && threw.code === 'ROBLOX_TAKEN', 'expected ROBLOX_TAKEN');
  assert.equal(threw.discordId, DISCORD_A);
  ok('one roblox account cannot link to two discord accounts');
}

// ---- DB: unlink ----
{
  const prev = db.unlinkByDiscordId(DISCORD_A);
  assert.equal(prev.roblox_id, '5500002');
  assert.equal(db.getByDiscordId(DISCORD_A), null);
  ok('unlink removes the record');
}

// ---- embeds: panel ----
{
  const { payload } = embeds.buildPanelPayload();
  assert.equal(payload.flags, 1 << 15, 'panel must set IS_COMPONENTS_V2');
  const container = payload.components[0];
  assert.equal(container.type, 17);
  const row = container.components.find((c) => c.type === 1);
  assert.ok(row, 'panel has an action row');
  const ids = row.components.map((b) => b.custom_id);
  assert.deepEqual(ids.sort(), ['verify_help', 'verify_start'].sort());
  ok('panel payload is Components V2 with Verify + Help buttons');
}

// ---- embeds: verified ----
{
  const { payload } = embeds.buildVerifiedPayload({
    discordId: DISCORD_A, robloxUsername: 'AlphaRBX', robloxId: '5500001',
    avatarUrl: 'https://tr.rbxcdn.com/avatar.png',
  });
  assert.equal(payload.flags, 1 << 15);
  const json = JSON.stringify(payload);
  assert.ok(json.includes(`<@${DISCORD_A}>`), 'mentions the user');
  assert.ok(json.includes('https://www.roblox.com/users/5500001/profile'), 'roblox profile hyperlink');
  assert.ok(json.includes('[AlphaRBX]'), 'roblox username hyperlink text');
  const section = payload.components[0].components.find((c) => c.type === 9);
  assert.ok(section && section.accessory && section.accessory.type === 11, 'has thumbnail accessory');
  ok('verified payload has mention, profile hyperlink and avatar thumbnail');
}

// ---- emoji parsing ----
{
  const e = embeds.parseEmoji('<:unknown:1519043945290535102>');
  assert.deepEqual(e, { id: '1519043945290535102', name: 'unknown', animated: false });
  ok('custom emoji parses to {id,name,animated}');
}

console.log(`\nAll ${passed} checks passed ✅`);
process.exit(0);
