// Orchestrates the "make this person verified" workflow:
//   link in DB -> assign role -> send the verified Components V2 message
//   (DM the user + copy to the log channel). Plus unlink (role removal + data wipe).
import { Routes } from 'discord.js';
import config from '../config.js';
import log from '../logger.js';
import { client, sendComponentsV2, dmComponentsV2 } from '../bot/client.js';
import { linkAccount, unlinkByDiscordId } from '../db.js';
import { buildVerifiedPayload } from '../bot/embeds.js';
import { getAvatarHeadshot } from './roblox.js';

async function addRole(guildId, discordId, reason) {
  await client.rest.put(Routes.guildMemberRole(guildId, discordId, config.verifiedRoleId), { reason });
}
async function removeRole(guildId, discordId, reason) {
  await client.rest.delete(Routes.guildMemberRole(guildId, discordId, config.verifiedRoleId), { reason });
}

/**
 * Complete a verification (self-serve from the website, or moderator force-verify).
 *  roblox: { id, username }
 *  verifiedBy: null for self-verify, else the moderator's id.
 * Throws err.code === 'ROBLOX_TAKEN' if the Roblox account belongs to someone else.
 */
export async function completeVerification({ discordId, guildId, roblox, verifiedBy = null }) {
  // 1. Persist the link (throws ROBLOX_TAKEN on conflict).
  const { previous, current } = linkAccount({
    discordId,
    robloxId: roblox.id,
    robloxUsername: roblox.username,
    guildId,
    verifiedBy,
  });

  // 2. Assign the verified role (best-effort but logged).
  try {
    await addRole(guildId, discordId, `Verified as Roblox ${roblox.username} (${roblox.id})`);
  } catch (e) {
    log.error(`Failed to add verified role to ${discordId}:`, e.message);
  }

  // 3. Build the verified message (with Roblox avatar thumbnail).
  const avatarUrl = await getAvatarHeadshot(roblox.id);
  const { payload, files } = buildVerifiedPayload({
    discordId,
    robloxUsername: roblox.username,
    robloxId: roblox.id,
    avatarUrl,
  });

  // 4. DM the user (optional) ...
  let dmDelivered = false;
  if (config.verifiedDm) {
    try {
      await dmComponentsV2(discordId, payload, files);
      dmDelivered = true;
    } catch (e) {
      log.warn(`Could not DM verified message to ${discordId} (DMs closed?): ${e.message}`);
    }
  }

  // 5. ... and always post a copy to the log channel.
  if (config.logChannelId) {
    try {
      await sendComponentsV2(config.logChannelId, payload, files);
    } catch (e) {
      log.error(`Failed to post verified copy to log channel: ${e.message}`);
    }
  }

  log.info(
    `Verified discord=${discordId} <-> roblox=${roblox.username}(${roblox.id})` +
    `${verifiedBy ? ` [force by ${verifiedBy}]` : ''}${previous ? ' [re-link]' : ''}`,
  );

  return { previous, current, dmDelivered };
}

/** Remove a user's link: delete data + strip the verified role. */
export async function handleUnlink(discordId, guildId = config.guildId) {
  const previous = unlinkByDiscordId(discordId);
  try {
    await removeRole(guildId, discordId, 'User unlinked their account');
  } catch (e) {
    log.warn(`Could not remove role from ${discordId}: ${e.message}`);
  }
  if (previous) log.info(`Unlinked discord=${discordId} (was roblox ${previous.roblox_username}/${previous.roblox_id})`);
  return previous;
}
