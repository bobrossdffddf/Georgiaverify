# Georgia State Roleplay — Verification Bot + Website

A self-hosted Discord ↔ Roblox verification system. A member clicks **Verify**, gets a
personal 10-minute link, authorizes with Roblox (OAuth 2.0), and is automatically
linked, given the verified role, and sent a confirmation. The Discord ID ↔ Roblox ID
link is stored in SQLite so you can use it for in-game (ER:LC) integrations.

Bot + website run in **one Node.js process**, so the website can apply Discord roles directly.

---

## Features

- **`/panel`** (admins) — posts the Components V2 verification panel with **Verify** + **Help?** buttons.
- **`/verify`** — DMs the user a personal, single-use, 10-minute link.
- **`/unlink`** — deletes the user's stored data **and** removes the verified role.
- **`/fverify user roblox`** (mods) — force-link a member by Roblox username or ID when normal verification fails.
- **Verify button** → unique signed link → Roblox OAuth (PKCE) → role + confirmation embed.
- **Verified confirmation** is DMed to the user *and* copied to your log channel.
- **One Roblox account = one Discord account** (enforced; re-linking moves it cleanly).
- **Terms of Service + Privacy Policy** pages, written to match exactly what the bot stores — and the privacy promises (single-use links, no token storage, `/unlink` deletes data) are actually enforced in code.

---

## How verification works

```
User clicks Verify (or runs /verify)
        │
        ▼
Bot creates a signed JWT link  ──►  https://<your-site>/verify?token=…   (10 min, single use)
        │
        ▼
Website shows "Discord connected" (identity comes from the signed token)
        │  user clicks "Continue with Roblox"
        ▼
/auth/roblox  ──►  Roblox OAuth (openid profile, PKCE)
        │
        ▼
/auth/roblox/callback  ──►  exchange code, read public profile,
                            consume the link (single use), write Discord+Roblox to SQLite,
                            add verified role, DM confirmation + copy to log channel
        │
        ▼
Success page  →  "Return to Discord"
```

The Discord identity is carried inside the signed link, so no Discord OAuth is needed —
only Roblox OAuth. Links expire after 10 minutes and can be used only once.

---

## Prerequisites

- **Node.js 18.17+** (Node 20 recommended) on a Linux box, or Docker.
- A **Discord application + bot** (token, client ID).
- A **Roblox OAuth 2.0 app** (client ID + secret).
- A **public HTTPS URL** for the website (Roblox requires a valid OAuth redirect URI).
  A subdomain pointed at your Proxmox box behind nginx/Caddy works great.

---

## 1) Discord application setup

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → **Reset Token** → copy into `DISCORD_TOKEN`. (No privileged intents needed.)
3. **General Information** → copy **Application ID** into `DISCORD_CLIENT_ID`.
4. **Installation / OAuth2** → invite the bot to your server with the `bot` and
   `applications.commands` scopes and at least these permissions:
   **Manage Roles**, **Send Messages**, **Embed Links**, **Attach Files**, **Use Slash Commands**.
5. In **Server Settings → Roles**, drag the **bot's role above** the verified role
   (`VERIFIED_ROLE_ID`) — a bot can only assign roles below its own highest role.

## 2) Roblox OAuth setup

1. Go to <https://create.roblox.com/dashboard/credentials> → **OAuth 2.0 Apps** → **Create App**.
2. Set the **Redirect URI** to exactly: `https://YOUR_DOMAIN/auth/roblox/callback`
   (must match `BASE_URL` + `/auth/roblox/callback`).
3. **Scopes:** enable `openid` and `profile`.
4. Copy the **Client ID** → `ROBLOX_CLIENT_ID` and **Client Secret** → `ROBLOX_CLIENT_SECRET`.

## 3) Configure

```bash
cp .env.example .env
# Generate a strong token secret:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Fill in `.env` (see comments in `.env.example`). Defaults already include your
verified role (`1487127237777031183`) and log channel (`1505555570290069635`).
Put your banner images in `assets/` (`Copy_of_hcso_8.webp`, `geo_1.png`) — see `assets/README.md`.

## 4) Register slash commands & run

```bash
npm install
npm run deploy-commands   # registers /panel /verify /unlink /fverify to your guild
npm start
```

Then in Discord run **`/panel`** in your verification channel to post the panel.

---

## Self-hosting on Proxmox

You can run this in a **Proxmox LXC container** (lightest) or a small VM. An unprivileged
Debian 12 LXC with 1 vCPU / 512 MB RAM is plenty.

### Option A — LXC + systemd (recommended, lightest)

```bash
# On the Proxmox host: create a Debian 12 LXC (e.g. via the web UI or):
#   pct create 120 local:vztmpl/debian-12-standard_*.tar.zst \
#     --hostname gsrp-verify --cores 1 --memory 512 --net0 name=eth0,bridge=vmbr0,ip=dhcp
#   pct start 120 && pct enter 120

# Inside the container:
apt update && apt install -y curl git build-essential python3
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

adduser --system --group gsrp
git clone <your-repo-or-copy-files> /opt/gsrp-verify   # or scp the folder here
cd /opt/gsrp-verify
cp .env.example .env && nano .env                       # fill in your values
npm install
npm run deploy-commands
chown -R gsrp:gsrp /opt/gsrp-verify

# Install the service:
cp deploy/gsrp-verify.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gsrp-verify
journalctl -u gsrp-verify -f                            # watch logs
```

### Option B — Docker (LXC must allow nesting, or use a VM)

```bash
cp .env.example .env && nano .env
docker compose up -d --build
docker compose logs -f
# After the container is up once, register commands:
docker compose exec gsrp-verify npm run deploy-commands
```

> If using Docker inside an LXC, enable nesting on the container
> (Proxmox → container → Options → Features → **Nesting = yes**).

### HTTPS / reverse proxy

Roblox OAuth needs a real HTTPS redirect URI. Put nginx (or Caddy) in front:

```bash
apt install -y nginx certbot python3-certbot-nginx
cp deploy/nginx.conf.example /etc/nginx/sites-available/gsrp-verify
# edit server_name, then:
ln -s /etc/nginx/sites-available/gsrp-verify /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d verify.your-domain.com
```

Set `BASE_URL=https://verify.your-domain.com` in `.env`, make sure the Roblox app's
redirect URI matches `https://verify.your-domain.com/auth/roblox/callback`, then restart.

### Local testing without a domain

Set `BASE_URL=http://YOUR_LXC_IP:3000` and add that same callback URL to the Roblox app.
For OAuth from outside your LAN you'll need a tunnel (e.g. `cloudflared tunnel` or `ngrok http 3000`)
and use the tunnel URL as `BASE_URL` + redirect URI.

---

## Commands reference

| Command | Who | What it does |
|---------|-----|--------------|
| `/panel [channel]` | Administrators | Posts the verification panel (Verify + Help buttons). |
| `/verify` | Anyone | Sends you a personal 10-minute verification link. |
| `/unlink` | Anyone | Deletes your link + removes the verified role. |
| `/fverify user roblox` | Mods (see below) | Manually links a member to a Roblox account. |

**`/fverify` permissions:** if `MOD_ROLE_ID` is set, that role (or anyone with *Manage Server*)
can use it, and the command stays visible to members (access is enforced on use). If
`MOD_ROLE_ID` is blank, the command is locked to *Manage Server* at the Discord level.
**Re-run `npm run deploy-commands` after changing `MOD_ROLE_ID`.**

---

## Data stored (SQLite, `data/verify.db`)

`verifications`: `discord_id`, `roblox_id`, `roblox_username`, `guild_id`, `verified_by`
(null = self-verify, else the mod who force-verified), `verified_at`, `updated_at`.

`pending_tokens`: short-lived single-use link records (`jti`, `discord_id`, expiry, consumed flag).

**Using the link in-game (ER:LC):** query `verifications` by `roblox_id` or `discord_id`.
Back the DB up by copying `data/verify.db` (and the `-wal`/`-shm` files) while stopped,
or use `sqlite3 data/verify.db ".backup backup.db"` live.

---

## Project layout

```
src/
  index.js              start bot + web in one process
  config.js             env config + validation
  db.js                 SQLite schema + queries
  logger.js
  services/
    tokens.js           signed 10-min single-use links + OAuth/PKCE state
    roblox.js           Roblox OAuth + profile / avatar / username lookups
    verification.js     link → role → DM + log copy; unlink → role removal + wipe
  bot/
    client.js           discord.js client + Components V2 senders (raw REST)
    embeds.js           panel + verified Components V2 builders
    interactions.js     command + button router
    verifyLink.js       shared "here's your link" reply + help text
    commands/           panel / verify / unlink / fverify
  web/
    server.js           Express routes (verify, OAuth, legal, health)
    render.js           tiny templating
    views/              verify.html, success.html, terms.html, privacy.html
    public/             css, js, extracted design images
scripts/
  deploy-commands.js    register slash commands
  selftest.js           offline tests (npm test)
deploy/                  systemd unit + nginx example
Dockerfile, docker-compose.yml, ecosystem.config.cjs
```

## Troubleshooting

- **Slash commands don't appear** → run `npm run deploy-commands`; they register to `GUILD_ID` instantly.
- **"Missing Permissions" assigning the role** → move the bot's role above the verified role.
- **Roblox redirect error** → the app's redirect URI must equal `BASE_URL` + `/auth/roblox/callback`, exactly (scheme + host + path).
- **DM not received** → the user has DMs off; the copy still lands in the log channel.
- **better-sqlite3 build fails** → install build tools (`build-essential python3`) and reinstall.

## Tests

```bash
npm run check   # node --check every .js file
npm test        # offline logic tests (tokens, single-use, DB, conflicts, embeds)
```

---

*Not affiliated with Discord Inc. or Roblox Corporation. The Terms/Privacy pages are templates, not legal advice.*
# Georgiaverify
