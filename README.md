# Ledger — Options Trade Journal

A self-hosted options trading journal that replaces the spreadsheet: log trades
by pasting broker order text (auto-parsed) or entering fields manually, track
running cost basis per position, mark positions open/closed yourself, see
realized P/L and win rate, keep a notes/lessons log, and optionally pull
recent transactions straight from Schwab.

```
trade-journal/
  server/     Express + SQLite API, Schwab OAuth
  client/     React (Vite) frontend
```

## How it works

- You create a **position** for a symbol (e.g. TSLA) when you open a trade.
- You add **trades** (legs) to that position — either paste the order line
  the way you did in the sheet (`SOLD -2 1/2 BACKRATIO TSLA 100 21 AUG 26
  355/370 CALL @-.07`) and it's parsed automatically, or fill in the fields
  by hand.
- Net for each leg is `-100 × size × price`, running cost basis is the
  cumulative sum — same math the spreadsheet used.
- **You** mark a position closed when you're done with it (no auto-detection
  guesswork), which locks in its running total as realized P/L.
- Notes & Lessons is a free-form journal, replacing the old Lessons tab.

## 1. Local setup

Requires Node.js 18+ (check with `node -v`; a Raspberry Pi 4/5 running
64-bit Raspberry Pi OS handles this fine).

```bash
cd server
npm install
cp .env.example .env
```

Generate a password hash for logging into the app and put it in `.env` as
`APP_PASSWORD_HASH`:

```bash
node -e "console.log(require('bcryptjs').hashSync('your-password-here', 10))"
```

Also set `SESSION_SECRET` in `.env` to any long random string.

```bash
cd ../client
npm install
```

### Run in development

Two terminals:

```bash
# terminal 1
cd server && npm run dev

# terminal 2
cd client && npm run dev
```

Open http://localhost:5173 — the Vite dev server proxies `/api` to the
Express server on port 4000.

### Build for production

```bash
cd client && npm run build
cd ../server && npm start
```

The Express server serves the built frontend from `client/dist` and the API
from the same port (`PORT` in `.env`, default `4000`). One process, one port.

## 2. Connecting Schwab (optional, can be added later)

1. Create an account and register an app at
   [developer.schwab.com](https://developer.schwab.com), requesting the
   **Trader API - Individual** product.
2. Schwab requires an **HTTPS** callback URL — `http://` and bare IP
   addresses aren't accepted for production apps. Point it at:
   `https://your-domain.example/api/schwab/callback`
3. Put the app's client ID, client secret, and that exact redirect URI into
   `server/.env`:
   ```
   SCHWAB_CLIENT_ID=...
   SCHWAB_CLIENT_SECRET=...
   SCHWAB_REDIRECT_URI=https://your-domain.example/api/schwab/callback
   ```
4. Restart the server, go to **Settings** in the app, and click
   **Connect Schwab account**.
5. On the Settings page you can fetch recent transactions and import them
   into positions (a new one is created automatically if there's no open
   position yet for that symbol).

Schwab's app-approval process can take a day or two the first time. Until
it's connected you can still use the journal fully via paste/manual entry.

**Note on the transaction parser:** Schwab's transaction API returns
structured fields (underlying, strike, expiration, etc.), not a single text
description like thinkorswim's order confirmations. The importer builds a
readable "structure" string from Schwab's own `description` field per leg —
it won't always match your old sheet's exact strategy naming (vertical,
butterfly, backratio), but the size/price/net math is exact. You can edit
the structure text after import if you want it worded differently.

## 3. Putting this on your Raspberry Pi site

Since you already have a basic HTML site there, the cleanest approach is to
run this Node app on a different port and put it behind the same web server
(nginx/Apache) as a **reverse proxy**, so it lives at a path or subdomain of
your existing site — and, importantly, so it can get an HTTPS certificate
(Schwab requires it).

Example nginx config (adjust paths/domain):

```nginx
server {
    listen 443 ssl;
    server_name journal.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/journal.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/journal.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

If you don't have a domain pointed at the Pi yet, a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
is an easy way to get a free HTTPS hostname to it without opening ports on
your router — and Schwab's HTTPS requirement is otherwise the main blocker
to running this fully on a home Pi.

Once you have `https://journal.yourdomain.com` working and pointed at port
`4000`, set that as `SCHWAB_REDIRECT_URI` (with `/api/schwab/callback`
appended) both in Schwab's app settings and in `server/.env`.

Also set `cookie.secure = true` in `server/index.js`'s session config once
you're serving over HTTPS, so the login cookie is only sent encrypted.

### Keep it running: systemd service

Create `/etc/systemd/system/trade-journal.service`:

```ini
[Unit]
Description=Ledger trade journal
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/pi/trade-journal/server
ExecStart=/usr/bin/node index.js
Restart=on-failure
EnvironmentFile=/home/pi/trade-journal/server/.env
User=pi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now trade-journal
sudo systemctl status trade-journal
```

## 4. Backing up your data

Everything lives in one file: `server/data/journal.db` (SQLite). Copy it
somewhere periodically — that's your whole trade history and notes.

## Security notes

- The app is gated behind a single password (bcrypt-hashed, session
  cookie). This is meant for one person (you) — it's not multi-user.
- Your Schwab refresh token is stored in that same SQLite file. Treat
  backups of it like you'd treat brokerage credentials.
- Don't expose port 4000 directly to the internet without the HTTPS reverse
  proxy in front of it.
