// Builders for the Components V2 messages (panel + verified confirmation).
// Returns { payload, files } where `files` only includes banner images that
// actually exist on disk, so a missing asset never breaks the message.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';
import { profileUrl } from '../services/roblox.js';

const IS_COMPONENTS_V2 = 1 << 15; // 32768

export const BUTTON_IDS = {
  verify: 'verify_start',
  help: 'verify_help',
};

/** Parse "<:name:id>" / "<a:name:id>" into a component emoji object. */
export function parseEmoji(str) {
  if (!str) return undefined;
  const m = /^<(a)?:([A-Za-z0-9_]+):(\d+)>$/.exec(str.trim());
  if (m) return { id: m[3], name: m[2], animated: Boolean(m[1]) };
  return { name: str.trim() }; // assume unicode emoji
}

function assetPath(filename) {
  return path.join(config.assetsDir, filename);
}
function assetExists(filename) {
  try { return fs.statSync(assetPath(filename)).isFile(); } catch { return false; }
}

/** Media-gallery banner component, or null if the file isn't present. */
function banner(filename, files) {
  if (!assetExists(filename)) return null;
  files.push({ name: filename, path: assetPath(filename) });
  return { type: 12, items: [{ media: { url: `attachment://${filename}` } }] };
}

const SEP = { type: 14, spacing: 2 };

// ----------------------------------------------------------------- panel
export function buildPanelPayload() {
  const files = [];
  const brand = config.emojiBrand;
  const inner = [
    banner(config.assets.banner, files),
    SEP,
    {
      type: 10,
      content:
        `# ${brand} ${config.serverName} - Verify\n` +
        `Hello, and welcome to **${brand} ${config.serverName}!** Before you can start ` +
        `your incredible roleplay journey you need to verify so you can use all of our awesome features!`,
    },
    SEP,
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1, // Primary (interactive) — generates a unique 10-min link per user
          label: 'Verify',
          emoji: parseEmoji(config.emojiBrand),
          custom_id: BUTTON_IDS.verify,
        },
        {
          type: 2,
          style: 2, // Secondary
          label: 'Help?',
          emoji: parseEmoji(config.emojiHelp),
          custom_id: BUTTON_IDS.help,
        },
      ],
    },
    SEP,
    banner(config.assets.footer, files),
  ].filter(Boolean);

  return {
    payload: { flags: IS_COMPONENTS_V2, components: [{ type: 17, components: inner }] },
    files,
  };
}

// -------------------------------------------------------------- verified
export function buildVerifiedPayload({ discordId, robloxUsername, robloxId, avatarUrl }) {
  const files = [];
  const brand = config.emojiBrand;
  const robloxLink = `[${robloxUsername}](${profileUrl(robloxId)})`;

  const section = {
    type: 9, // Section
    components: [
      {
        type: 10,
        content:
          `# ${brand} ${config.serverName} - Verified!\n` +
          `Hello <@${discordId}> thank you for verifying your account!\n` +
          `**Account:**\n` +
          `${robloxLink}\n` +
          `<@${discordId}>\n\n` +
          '-# Use the `/unlink` command to change accounts or unlink. Doing so will remove all account data.',
      },
    ],
  };
  // Thumbnail accessory = Roblox avatar (falls back to a Section without accessory).
  if (avatarUrl) {
    section.accessory = { type: 11, media: { url: avatarUrl } };
  }

  const inner = [
    banner(config.assets.banner, files),
    SEP,
    section,
    SEP,
    banner(config.assets.footer, files),
  ].filter(Boolean);

  return {
    payload: { flags: IS_COMPONENTS_V2, components: [{ type: 17, components: inner }] },
    files,
  };
}
