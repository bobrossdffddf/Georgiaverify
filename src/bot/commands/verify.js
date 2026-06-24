// /verify — DMs/replies with the user's personal verification link.
import { sendVerifyLink } from '../verifyLink.js';

export const data = {
  name: 'verify',
  description: 'Get your personal link to verify your Roblox account.',
  dm_permission: false,
};

export async function execute(interaction) {
  await sendVerifyLink(interaction);
}
