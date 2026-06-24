// Aggregates all slash commands.
import * as panel from './panel.js';
import * as verify from './verify.js';
import * as unlink from './unlink.js';
import * as fverify from './fverify.js';

export const commands = [panel, verify, unlink, fverify];
export const commandMap = new Map(commands.map((c) => [c.data.name, c]));
export const commandData = commands.map((c) => c.data);
