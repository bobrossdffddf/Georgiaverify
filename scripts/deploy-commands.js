// Registers (overwrites) the guild slash commands. Run after changing commands
// or MOD_ROLE_ID:   npm run deploy-commands
import { REST, Routes } from 'discord.js';
import config from '../src/config.js';
import { commandData } from '../src/bot/commands/index.js';
import log from '../src/logger.js';

const rest = new REST({ version: '10' }).setToken(config.discordToken);

try {
  log.info(`Registering ${commandData.length} guild command(s) to guild ${config.guildId}...`);
  const res = await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commandData },
  );
  log.info(`Done. Registered: ${res.map((c) => '/' + c.name).join(', ')}`);
  process.exit(0);
} catch (err) {
  log.error('Failed to register commands:', err);
  process.exit(1);
}
