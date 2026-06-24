// /panel — admin-only. Posts the verification panel to a channel.
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { buildPanelPayload } from '../embeds.js';
import { sendComponentsV2 } from '../client.js';

export const data = {
  name: 'panel',
  description: 'Post the verification panel to a channel (admins only).',
  default_member_permissions: String(PermissionFlagsBits.Administrator),
  dm_permission: false,
  options: [
    {
      type: 7, // CHANNEL
      name: 'channel',
      description: 'Channel to post the panel in (defaults to this channel).',
      required: false,
      channel_types: [0, 5], // GuildText, GuildAnnouncement
    },
  ],
};

export async function execute(interaction) {
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const { payload, files } = buildPanelPayload();
  await sendComponentsV2(channel.id, payload, files);
  await interaction.reply({
    content: `✅ Verification panel posted in <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}
