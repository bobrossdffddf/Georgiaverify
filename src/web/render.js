// Minimal HTML templating: read a view file and substitute %%KEY%% tokens
// plus inject a window.__DATA blob. No template-engine dependency.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS_DIR = path.join(__dirname, 'views');
const cache = new Map();

function load(name) {
  if (process.env.NODE_ENV !== 'production') {
    return fs.readFileSync(path.join(VIEWS_DIR, name), 'utf8');
  }
  if (!cache.has(name)) cache.set(name, fs.readFileSync(path.join(VIEWS_DIR, name), 'utf8'));
  return cache.get(name);
}

function escapeJsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/**
 * Render a view. `vars` are substituted for %%KEY%% tokens (HTML-escaped is the
 * caller's responsibility for raw HTML); `data` is injected as window.__DATA.
 */
export function render(name, { vars = {}, data = null } = {}) {
  let html = load(name);
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`%%${k}%%`).join(String(v ?? ''));
  }
  const dataScript = data
    ? `<script>window.__DATA = ${escapeJsonForScript(data)};</script>`
    : '';
  html = html.split('%%DATA%%').join(dataScript);
  return html;
}
