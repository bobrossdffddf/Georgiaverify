// Entry point: boots the SQLite DB, the discord.js bot, and the Express web
// server in a single process so the website can apply roles directly.
import { Events } from 'discord.js';
import config from './config.js';
import log from './logger.js';
import './db.js';
import { client } from './bot/client.js';
import { registerInteractionHandler } from './bot/interactions.js';
import { startWebServer } from './web/server.js';

process.on('unhandledRejection', (err) => log.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => log.error('Uncaught exception:', err));

client.once(Events.ClientReady, (c) => {
  log.info(`Bot logged in as ${c.user.tag} (serving guild ${config.guildId}).`);
});

registerInteractionHandler(client);

async function main() {
  await client.login(config.discordToken);
  await startWebServer();
  log.info('Georgia State Roleplay verification service is up.');
}

main().catch((err) => {
  log.error('Fatal startup error:', err);
  process.exit(1);
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info(`Received ${sig}, shutting down...`);
    client.destroy();
    process.exit(0);
  });
}
