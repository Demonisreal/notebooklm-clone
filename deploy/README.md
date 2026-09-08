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

If the demo is public, `DEMO_USER_EMAIL=demo@notebook.local` belongs in the `.env` afterwards and the `api` service has to be restarted. The demo login can then only read and chat; uploading, renaming and deleting are rejected by the API, and the example notebook survives for the next visitor.

Mind the order: `seed-demo.mjs` and `reembed-all.mjs` work through those blocked routes themselves. Both only run while `DEMO_USER_EMAIL` is **not** set — to top up the data, remove it, restart `api`, run the script, put it back.

## Checks

```bash
curl -I https://notebook.your-domain.com           # 200
curl -s https://api.notebook.your-domain.com/notebooks   # 401 without a token
docker compose logs -f api
```
