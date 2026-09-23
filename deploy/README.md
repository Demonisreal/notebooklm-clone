# Deployment on your own server

Everything runs on one machine: self-hosted Supabase plus frontend, API and a Caddy in front that obtains the certificates itself.

**Requirements:** at least 4 GB RAM and 2 cores (8 GB / 4 cores recommended), 40 GB SSD, Docker with Compose, ports 80 and 443 open.

## 1. DNS

Three A records pointing at the server IP, Cloudflare proxy **off** (grey cloud) — otherwise Caddy never gets its certificates:

```
notebook        A   <server-ip>
api.notebook    A   <server-ip>
db.notebook     A   <server-ip>
```

## 2. Supabase

```bash
git clone --depth 1 https://github.com/supabase/supabase
cp -r supabase/docker ~/supabase-stack && cd ~/supabase-stack
cp .env.example .env
```

Replace every default in `.env` — the file ships insecure. Among others you need `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_PASSWORD`, `SECRET_KEY_BASE` and `VAULT_ENC_KEY`. Then the public addresses:

```
SUPABASE_PUBLIC_URL=https://db.notebook.your-domain.com
API_EXTERNAL_URL=https://db.notebook.your-domain.com
SITE_URL=https://notebook.your-domain.com
```

Studio and database must **not** be reachable from outside — drop the port mappings of `studio`, `db` and `analytics` in `docker-compose.yml`. Access goes through an SSH tunnel.

```bash
docker compose up -d
```

## 3. Migrations

```bash
supabase link --project-ref <ref>   # or straight through the tunnel with psql
psql "$DB_URL" -f supabase/migrations/20260804090000_init.sql
psql "$DB_URL" -f supabase/migrations/20260804090100_match_chunks.sql
psql "$DB_URL" -f supabase/migrations/20260810120000_audio_overviews.sql
psql "$DB_URL" -f supabase/migrations/20260915120000_login_lockout.sql
```

## 4. Application

```bash
git clone <repo> ~/notebooklm && cd ~/notebooklm/deploy
cp .env.example .env    # fill in domains, ANON_KEY, SERVICE_ROLE_KEY, GEMINI_API_KEY
docker compose up -d --build
```

`NEXT_PUBLIC_*` is baked into the frontend at build time — after a domain change `web` has to be rebuilt, restarting is not enough.

## 5. Demo login

```bash
SUPABASE_URL=https://db.notebook.your-domain.com \
SUPABASE_SECRET_KEY=<service-role-key> \
API_URL=https://api.notebook.your-domain.com \
DEMO_PASSWORD=<password> \
node scripts/seed-demo.mjs
```

If the demo is public, `DEMO_USER_EMAIL=demo@notebook.local` belongs in the `.env` afterwards and the `api` service has to be restarted. The demo login can then only read and chat; uploading, renaming and deleting are rejected by the API, and the example notebook survives for the next visitor. Its chats are not stored either, as long as `DEMO_USER_EMAIL` is set.

Mind the order: `seed-demo.mjs` and `reembed-all.mjs` work through those blocked routes themselves. Both only run while `DEMO_USER_EMAIL` is **not** set — to top up the data, remove it, restart `api`, run the script, put it back.

Chat and studio stay open for the demo login, and both cost Gemini quota. So they are limited for that account alone, other accounts are not affected:

| Variable               | Default | Counts                                                                |
| ---------------------- | ------- | --------------------------------------------------------------------- |
| `DEMO_CHAT_PER_HOUR`   | 10      | chat questions per visitor address in the last 60 minutes             |
| `DEMO_STUDIO_PER_HOUR` | 3       | studio generations (briefing, FAQ, study guide, mind map, audio)      |
| `DEMO_DAILY_CAP`       | 200     | both together, across all addresses; resets at midnight Europe/Berlin |

Beyond that the API answers `429` and the frontend says the demo limit has been reached. The hourly limits are a sliding window, the daily cap is a plain counter per calendar day — simpler than a rolling 24 hours and easy to reason about when checking the Gemini bill.

The counters live in the memory of the `api` container. That is enough because it runs exactly once; a restart resets them, which at worst hands out one extra daily budget. With a second container they would have to move to Postgres.

The visitor address comes from `X-Forwarded-For`, which Caddy sets. The API only believes that header from loopback and private addresses (`trust proxy` in `apps/api/src/main.ts`), and it publishes no port of its own — keep it that way, otherwise the header becomes spoofable.

## Sign-in hardening

The browser signs in straight against GoTrue, so everything that protects passwords has to sit in front of or inside GoTrue — a limit in the web app would be skipped by anyone calling `/auth/v1/token` directly.

**Per account:** the migration `20260915120000_login_lockout.sql` installs a password verification hook. After five failed attempts the account is locked for 15 minutes, even the right password gets the usual "Invalid login credentials" during that time, and until a day passes without a miss every further miss locks again. Accounts with `app_metadata.demo = true` are left alone, their password is public. A demo account created before this migration gets the flag when `seed-demo.mjs` runs again. A lock is lifted by deleting the row in `auth_login_attempts`. If the hook function is missing or broken, GoTrue answers every password sign-in with a 500 — run the migration before enabling the hook.

In `~/supabase-stack/docker-compose.yml`, service `auth`, below `GOTRUE_JWT_EXP` (which is replaced):

```yaml
GOTRUE_JWT_EXP: 1800
GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true'
GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: 10
GOTRUE_PASSWORD_MIN_LENGTH: 10
GOTRUE_HOOK_PASSWORD_VERIFICATION_ATTEMPT_ENABLED: 'true'
GOTRUE_HOOK_PASSWORD_VERIFICATION_ATTEMPT_URI: pg-functions://postgres/public/hook_password_verification_attempt
# without this header gotrue applies none of its per-address limits
GOTRUE_RATE_LIMIT_HEADER: X-Real-IP
GOTRUE_RATE_LIMIT_TOKEN_REFRESH: 150
GOTRUE_RATE_LIMIT_VERIFY: 30
GOTRUE_RATE_LIMIT_OTP: 30
GOTRUE_RATE_LIMIT_EMAIL_SENT: 30
```

**Per address:** Kong limits `/auth/v1/token` (10/min, 30/h; a JSON refresh 30/min, 300/h), `signup`, `recover`, `otp`, `resend`, `magiclink` (5/min, 20/h each) and `verify` (5/min, 30/h). Apply [`kong-auth-rate-limits.diff`](kong-auth-rate-limits.diff) to `volumes/api/kong.yml` and extend the `kong` service:

```yaml
KONG_PLUGINS: request-transformer,cors,key-auth,acl,basic-auth,request-termination,ip-restriction,post-function,rate-limiting
# caddy overwrites X-Forwarded-For, kong only has to believe it from the docker network
KONG_TRUSTED_IPS: 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
KONG_REAL_IP_HEADER: X-Forwarded-For
KONG_REAL_IP_RECURSIVE: 'on'
```

Without the trusted IPs every visitor counts as Caddy and the first ten sign-ins per minute lock out everyone else.

```bash
cd ~/supabase-stack
patch -p1 --dry-run < ~/notebooklm/deploy/kong-auth-rate-limits.diff && patch -p1 < ~/notebooklm/deploy/kong-auth-rate-limits.diff
docker compose up -d auth kong
```

## Checks

```bash
curl -I https://notebook.your-domain.com           # 200
curl -s https://api.notebook.your-domain.com/notebooks   # 401 without a token
docker compose logs -f api
```
