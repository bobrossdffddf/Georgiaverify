// /unlink — removes the caller's link: deletes data + strips the verified role.
import { MessageFlags } from 'discord.js';
import { getByDiscordId } from '../../db.js';
import { handleUnlink } from '../../services/verification.js';

export const data = {
  name: 'unlink',
  description: 'Unlink your Roblox account, remove your verified role and delete your data.',
  dm_permission: false,
};

export async function execute(interaction) {
  const existing = getByDiscordId(interaction.user.id);
  if (!existing) {
    await interaction.reply({
      content: "ℹ️ You don't have a linked account. Use `/verify` to link one.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await handleUnlink(interaction.user.id, interaction.guildId);
  await interaction.editReply(
    `✅ Unlinked **${existing.roblox_username}**. Your verified role and stored data have been removed.\n` +
    'Run `/verify` any time to link a new account.',
  );
}
