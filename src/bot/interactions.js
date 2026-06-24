// Routes Discord interactions: slash commands + the panel's Verify/Help buttons.
import { MessageFlags } from 'discord.js';
import log from '../logger.js';
import { commandMap } from './commands/index.js';
import { BUTTON_IDS } from './embeds.js';
import { sendVerifyLink, helpText } from './verifyLink.js';

export function registerInteractionHandler(client) {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = commandMap.get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
        return;
      }

      if (interaction.isButton()) {
        if (interaction.customId === BUTTON_IDS.verify) {
          await sendVerifyLink(interaction);
          return;
        }
        if (interaction.customId === BUTTON_IDS.help) {
          await interaction.reply({ content: helpText(), flags: MessageFlags.Ephemeral });
          return;
        }
      }
    } catch (err) {
      log.error('Interaction handler error:', err);
      const msg = {
        content: '⚠️ Something went wrong. Please try again in a moment, or contact a staff member.',
        flags: MessageFlags.Ephemeral,
      };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply(msg);
      } catch { /* interaction may have expired */ }
    }
  });
}
