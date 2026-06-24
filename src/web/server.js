// Express web server: verification landing + Roblox OAuth + legal pages.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import log from '../logger.js';
import { render } from './render.js';
import {
  decodeVerifyToken,
  createOAuthState,
  verifyOAuthState,
  generateCodeVerifier,
  codeChallengeFor,
} from '../services/tokens.js';
import { getPendingToken, consumePendingToken } from '../db.js';
import { buildAuthorizeUrl, exchangeCode, fetchUserInfo, profileUrl } from '../services/roblox.js';
import { completeVerification } from '../services/verification.js';
import { client } from '../bot/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commonVars = () => ({
  SERVER_NAME: config.serverName,
  DISCORD_URL: config.discordInviteUrl,
  TERMS_URL: `${config.baseUrl}/terms`,
  PRIVACY_URL: `${config.baseUrl}/privacy`,
  YEAR: new Date().getFullYear(),
});

// Best-effort Discord profile lookup so the page can greet the right person.
async function getDiscordProfile(discordId) {
  try {
    const user = await client.users.fetch(discordId);
    return {
      id: user.id,
      username: user.globalName || user.username,
      handle: user.username,
      avatar: user.displayAvatarURL({ size: 128, extension: 'png' }),
    };
  } catch {
    return { id: discordId, username: 'Discord user', handle: null, avatar: null };
  }
}

export function createWebServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind a reverse proxy (nginx/caddy on the LXC)

  app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

  // ---- Health check ------------------------------------------------
  app.get('/healthz', (_req, res) => res.json({ ok: true, bot: client.isReady() }));

  // ---- Landing (no token) -----------------------------------------
  app.get('/', (_req, res) => {
    res.status(200).send(render('verify.html', {
      vars: commonVars(),
      data: { state: 'notoken', serverName: config.serverName, discordUrl: config.discordInviteUrl },
    }));
  });

  // ---- Verify landing (token) -------------------------------------
  app.get('/verify', async (req, res) => {
    const token = String(req.query.token || '');
    if (!token) {
      return res.redirect('/');
    }
    let payload;
    try {
      payload = decodeVerifyToken(token);
    } catch {
      return res.status(400).send(render('verify.html', {
        vars: commonVars(),
        data: { state: 'expired', serverName: config.serverName, discordUrl: config.discordInviteUrl },
      }));
    }
    const pending = getPendingToken(payload.jti);
    const valid = pending && !pending.consumed_at && pending.expires_at > Date.now();
    if (!valid) {
      return res.status(410).send(render('verify.html', {
        vars: commonVars(),
        data: { state: 'expired', serverName: config.serverName, discordUrl: config.discordInviteUrl },
      }));
    }

    const discord = await getDiscordProfile(payload.sub);
    res.send(render('verify.html', {
      vars: commonVars(),
      data: {
        state: 'ready',
        serverName: config.serverName,
        discordUrl: config.discordInviteUrl,
        discord,
        robloxStartUrl: `${config.baseUrl}/auth/roblox?token=${encodeURIComponent(token)}`,
        expiresAt: pending.expires_at,
      },
    }));
  });

  // ---- Start Roblox OAuth -----------------------------------------
  app.get('/auth/roblox', (req, res) => {
    const token = String(req.query.token || '');
    let payload;
    try {
      payload = decodeVerifyToken(token);
    } catch {
      return res.status(400).send(render('verify.html', {
        vars: commonVars(),
        data: { state: 'expired', serverName: config.serverName, discordUrl: config.discordInviteUrl },
      }));
    }
    const pending = getPendingToken(payload.jti);
    if (!pending || pending.consumed_at || pending.expires_at <= Date.now()) {
      return res.status(410).send(render('verify.html', {
        vars: commonVars(),
        data: { state: 'expired', serverName: config.serverName, discordUrl: config.discordInviteUrl },
      }));
    }

    const codeVerifier = generateCodeVerifier();
    const state = createOAuthState({
      discordId: payload.sub,
      guildId: payload.gid,
      jti: payload.jti,
      codeVerifier,
    });
    const url = buildAuthorizeUrl({ state, codeChallenge: codeChallengeFor(codeVerifier) });
    res.redirect(url);
  });

  // ---- Roblox OAuth callback --------------------------------------
  app.get('/auth/roblox/callback', async (req, res) => {
    const errorPage = (title, message) =>
      res.status(400).send(render('verify.html', {
        vars: commonVars(),
        data: { state: 'error', title, message, serverName: config.serverName, discordUrl: config.discordInviteUrl },
      }));

    if (req.query.error) {
      return errorPage('Authorization cancelled', 'You cancelled the Roblox authorization. You can close this tab and try again from Discord.');
    }

    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!code || !state) return errorPage('Invalid request', 'Missing authorization details. Please start again from Discord.');

    let st;
    try {
      st = verifyOAuthState(state);
    } catch {
      return errorPage('Session expired', 'This verification session has expired. Please request a new link with /verify in Discord.');
    }

    let roblox;
    try {
      const tokens = await exchangeCode(code, st.cv);
      roblox = await fetchUserInfo(tokens.access_token);
    } catch (e) {
      log.error('Roblox OAuth exchange failed:', e.message);
      return errorPage('Roblox sign-in failed', 'We could not confirm your Roblox account. Please try again from Discord.');
    }

    // Single-use: consume the token now (after Roblox confirmed ownership).
    const consumed = consumePendingToken(st.jti);
    if (!consumed) {
      return errorPage('Link already used', 'This verification link has expired or was already used. Request a new one with /verify.');
    }

    try {
      await completeVerification({
        discordId: st.sub,
        guildId: st.gid,
        roblox: { id: roblox.id, username: roblox.username },
      });
    } catch (e) {
      if (e.code === 'ROBLOX_TAKEN') {
        return errorPage(
          'Roblox account in use',
          `The Roblox account "${roblox.username}" is already linked to a different Discord user. ` +
          'Ask them to run /unlink, or contact staff for help.',
        );
      }
      log.error('completeVerification failed:', e);
      return errorPage('Something went wrong', 'Your Roblox account was confirmed but we hit an error applying your role. Please contact staff.');
    }

    res.send(render('success.html', {
      vars: commonVars(),
      data: {
        state: 'success',
        serverName: config.serverName,
        discordUrl: config.discordInviteUrl,
        roblox: { id: roblox.id, username: roblox.username, profile: profileUrl(roblox.id) },
      },
    }));
  });

  // ---- Legal pages -------------------------------------------------
  app.get('/terms', (_req, res) => res.send(render('terms.html', { vars: commonVars() })));
  app.get('/privacy', (_req, res) => res.send(render('privacy.html', { vars: commonVars() })));

  // ---- 404 ---------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).send(render('verify.html', {
      vars: commonVars(),
      data: { state: 'error', title: 'Page not found', message: 'That page does not exist.', serverName: config.serverName, discordUrl: config.discordInviteUrl },
    }));
  });

  return app;
}

export function startWebServer() {
  const app = createWebServer();
  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      log.info(`Web server listening on port ${config.port} (public: ${config.baseUrl})`);
      resolve(server);
    });
  });
}
