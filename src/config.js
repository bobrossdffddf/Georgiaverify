// Central configuration. Reads .env and validates required values.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

function req(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required environment variable: ${name} (see .env.example)`);
  }
  return v.trim();
}

function opt(name, fallback = '') {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function bool(name, fallback = false) {
  const v = opt(name);
  if (v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(v);
}

export const config = {
  // Discord
  discordToken: req('DISCORD_TOKEN'),
  clientId: req('DISCORD_CLIENT_ID'),
  guildId: req('GUILD_ID'),
  verifiedRoleId: opt('VERIFIED_ROLE_ID', '1487127237777031183'),
  logChannelId: opt('LOG_CHANNEL_ID', '1505555570290069635'),
  modRoleId: opt('MOD_ROLE_ID', ''),
  verifiedDm: bool('VERIFIED_DM', true),

  // Roblox OAuth
  roblox: {
    clientId: req('ROBLOX_CLIENT_ID'),
    clientSecret: req('ROBLOX_CLIENT_SECRET'),
    authorizeUrl: 'https://apis.roblox.com/oauth/v1/authorize',
    tokenUrl: 'https://apis.roblox.com/oauth/v1/token',
    userInfoUrl: 'https://apis.roblox.com/oauth/v1/userinfo',
    scope: 'openid profile',
  },

  // Web
  baseUrl: opt('BASE_URL', 'http://localhost:3000').replace(/\/+$/, ''),
  port: parseInt(opt('PORT', '3000'), 10),
  get redirectUri() {
    return `${this.baseUrl}/auth/roblox/callback`;
  },

  // Tokens
  tokenSecret: req('TOKEN_SECRET'),
  tokenTtlSeconds: parseInt(opt('TOKEN_TTL_SECONDS', '600'), 10),

  // Branding
  serverName: opt('SERVER_NAME', 'Georgia State Roleplay'),
  discordInviteUrl: opt('DISCORD_INVITE_URL', 'https://discord.gg/'),
  emojiBrand: opt('EMOJI_BRAND', '<:unknown:1519043945290535102>'),
  emojiHelp: opt('EMOJI_HELP', '<:unknown:1492185664211386561>'),

  // Database
  databasePath: path.isAbsolute(opt('DATABASE_PATH', './data/verify.db'))
    ? opt('DATABASE_PATH', './data/verify.db')
    : path.join(ROOT_DIR, opt('DATABASE_PATH', './data/verify.db')),

  // Image assets attached to bot embeds (placed in /assets)
  assets: {
    banner: 'Copy_of_hcso_8.webp', // top banner
    footer: 'geo_1.png',           // bottom banner
  },
  assetsDir: path.join(ROOT_DIR, 'assets'),
};

if (config.tokenSecret === 'change-me-to-a-long-random-string') {
  console.warn('[config] WARNING: TOKEN_SECRET is still the default value. Set a strong secret in .env!');
}

export default config;
