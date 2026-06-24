// The discord.js client + helpers for sending Components V2 messages.
// V2 messages are sent through the raw REST route so the exact JSON payload
// (containers, sections, media galleries, attachment:// refs) is preserved.
import fs from 'node:fs';
import { Client, GatewayIntentBits, Partials, Routes } from 'discord.js';
import config from '../config.js';
import log from '../logger.js';

export const client = new Client({
  // Single-member fetches + role management work via REST with just the Guilds
  // intent — no privileged intents required.
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel], // allow DM channel resolution
});

/** Turn embeds.js { name, path } file specs into REST upload objects. */
function readFiles(files = []) {
  return files
    .map((f) => {
      if (f.data) return { name: f.name, data: f.data };
      try { return { name: f.name, data: fs.readFileSync(f.path) }; }
      catch (e) { log.warn(`Could not read attachment ${f.name}: ${e.message}`); return null; }
    })
    .filter(Boolean);
}

/** Send a Components V2 message to a channel id. Returns the created message. */
export async function sendComponentsV2(channelId, payload, files = []) {
  return client.rest.post(Routes.channelMessages(channelId), {
    body: payload,
    files: readFiles(files),
  });
}

/** Open (or reuse) a DM channel with a user and send a Components V2 message. */
export async function dmComponentsV2(userId, payload, files = []) {
  const dm = await client.rest.post(Routes.userChannels(), { body: { recipient_id: String(userId) } });
  return sendComponentsV2(dm.id, payload, files);
}

export default client;
