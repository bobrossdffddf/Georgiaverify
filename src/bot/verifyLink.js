// Shared helper: reply (ephemerally) with a fresh, personal, 10-minute
// verification link. Used by both the /verify command and the panel button.
import { MessageFlags } from 'discord.js';
import config from '../config.js';
import { createVerifyToken } from '../services/tokens.js';
import { getByDiscordId } from '../db.js';
import { parseEmoji } from './embeds.js';

export async function sendVerifyLink(interaction) {
  const existing = getByDiscordId(interaction.user.id);
  const { url, expiresAt } = createVerifyToken(interaction.user.id, interaction.guildId);
  const expires = Math.floor(expiresAt / 1000);

  const intro = existing
    ? `You're currently verified as **${existing.roblox_username}**. Use this link to link a different Roblox account — it replaces your current link:`
    : 'Click the button below to link your Roblox account.';

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content:
      `${intro}\n\n` +
      `🔒 This link is **personal to you** and expires <t:${expires}:R>. Don't share it with anyone.`,
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: 'Verify with Roblox', url, emoji: parseEmoji(config.emojiBrand) },
        ],
      },
    ],
  });
}

export function helpText() {
  return (
    `## ${config.emojiHelp} Verification help\n` +
    `Having trouble verifying? Here's how it works:\n\n` +
    `**1.** Click **Verify** to get your personal link (valid for 10 minutes).\n` +
    `**2.** Open the link and press **Continue with Roblox**.\n` +
    `**3.** Authorize on Roblox's official page — you'll be sent back automatically and your role is applied.\n\n` +
    `**Common issues**\n` +
    `• *Link expired* — just press **Verify** again for a fresh one.\n` +
    `• *"Already linked to another Discord"* — that Roblox account is in use; have the other user run \`/unlink\` first.\n` +
    `• *Wrong account linked* — run \`/unlink\`, then verify again.\n\n` +
    `Still stuck? Contact a staff member and they can use \`/fverify\` to link you manually.`
  );
}
