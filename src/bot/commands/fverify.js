// /fverify — moderator force-verify. Links a member to a Roblox account manually
// (used when normal verification fails). Gated by MOD_ROLE_ID or Manage Server.
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import config from '../../config.js';
import { resolveRobloxInput } from '../../services/roblox.js';
import { completeVerification } from '../../services/verification.js';

// If a custom mod role is configured we leave the command visible (the role check
// in execute() governs access). Otherwise we lock it to Manage Server at the
// Discord level. NOTE: changing MOD_ROLE_ID requires re-running deploy-commands.
export const data = {
  name: 'fverify',
  description: 'Force-verify a member with a Roblox account (moderators only).',
  dm_permission: false,
  ...(config.modRoleId ? {} : { default_member_permissions: String(PermissionFlagsBits.ManageGuild) }),
  options: [
    { type: 6, name: 'user', description: 'The Discord member to verify.', required: true },
    { type: 3, name: 'roblox', description: 'Roblox username or numeric user id.', required: true },
  ],
};

function isModerator(interaction) {
  if (config.modRoleId) {
    return Boolean(interaction.member?.roles?.cache?.has(config.modRoleId)) ||
      Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
  }
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

export async function execute(interaction) {
  if (!isModerator(interaction)) {
    await interaction.reply({
      content: '❌ You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user');
  const input = interaction.options.getString('roblox');

  if (target.bot) {
    await interaction.editReply('❌ You cannot verify a bot account.');
    return;
  }

  const roblox = await resolveRobloxInput(input).catch(() => null);
  if (!roblox) {
    await interaction.editReply(`❌ Could not find a Roblox user matching \`${input}\`. Use an exact username or numeric id.`);
    return;
  }

  try {
    const { previous } = await completeVerification({
      discordId: target.id,
      guildId: interaction.guildId,
      roblox,
      verifiedBy: interaction.user.id,
    });
    await interaction.editReply(
      `✅ Force-verified <@${target.id}> as **${roblox.username}** (\`${roblox.id}\`).` +
      (previous ? `\n↺ Replaced previous link: **${previous.roblox_username}**.` : ''),
    );
  } catch (e) {
    if (e.code === 'ROBLOX_TAKEN') {
      await interaction.editReply(
        `❌ Roblox account **${roblox.username}** is already linked to <@${e.discordId}>. ` +
        'Unlink them first (or have them run `/unlink`).',
      );
      return;
    }
    throw e;
  }
}
