# Deployment auf einem eigenen Server

Alles läuft auf einer Maschine: Supabase selbst gehostet, dazu Frontend, API und ein Caddy davor, der die Zertifikate selbst besorgt.

**Voraussetzungen:** Mindestens 4 GB RAM und 2 Kerne (empfohlen 8 GB / 4 Kerne), 40 GB SSD, Docker mit Compose, Ports 80 und 443 offen.

## 1. DNS

Drei A-Einträge auf die Server-IP, Proxy in Cloudflare **aus** (graue Wolke) — Caddy holt sich die Zertifikate sonst nicht:

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

Alle Standardwerte in `.env` ersetzen — die Datei ist ab Werk unsicher. Nötig sind unter anderem `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_PASSWORD`, `SECRET_KEY_BASE` und `VAULT_ENC_KEY`. Dazu die öffentlichen Adressen:

```
SUPABASE_PUBLIC_URL=https://db.notebook.deine-domain.de
API_EXTERNAL_URL=https://db.notebook.deine-domain.de
SITE_URL=https://notebook.deine-domain.de
```

Studio und Datenbank sollen **nicht** von außen erreichbar sein — in `docker-compose.yml` die Portfreigaben von `studio`, `db` und `analytics` entfernen. Der Zugriff läuft über einen SSH-Tunnel.

```bash
docker compose up -d
```

## 3. Migrationen

```bash
supabase link --project-ref <ref>   # oder direkt per psql über den Tunnel
psql "$DB_URL" -f supabase/migrations/20260804090000_init.sql
psql "$DB_URL" -f supabase/migrations/20260804090100_match_chunks.sql
psql "$DB_URL" -f supabase/migrations/20260810120000_audio_overviews.sql
```

## 4. Anwendung

```bash
git clone <repo> ~/notebooklm && cd ~/notebooklm/deploy
cp .env.example .env    # domains, ANON_KEY, SERVICE_ROLE_KEY, GEMINI_API_KEY eintragen
docker compose up -d --build
```

`NEXT_PUBLIC_*` wird zur Bauzeit in das Frontend eingebacken — nach einer Domain-Änderung muss `web` neu gebaut werden, ein Neustart genügt nicht.

## 5. Demo-Zugang

```bash
SUPABASE_URL=https://db.notebook.deine-domain.de \
SUPABASE_SECRET_KEY=<service-role-key> \
API_URL=https://api.notebook.deine-domain.de \
DEMO_PASSWORD=<passwort> \
node scripts/seed-demo.mjs
```

Steht die Demo öffentlich, gehört danach `DEMO_USER_EMAIL=demo@notebook.local` in die `.env` und der `api`-Dienst neu gestartet. Der Demo-Zugang kann dann nur noch lesen und chatten; Hochladen, Umbenennen und Löschen lehnt die API ab, das Beispiel-Notizbuch bleibt für den nächsten Besucher stehen.

Reihenfolge beachten: `seed-demo.mjs` und `reembed-all.mjs` arbeiten selbst über diese gesperrten Routen. Beide laufen nur, solange `DEMO_USER_EMAIL` **nicht** gesetzt ist — zum Nachziehen also erst herausnehmen, `api` neu starten, Skript laufen lassen, wieder eintragen.

## Prüfen

```bash
curl -I https://notebook.deine-domain.de           # 200
curl -s https://api.notebook.deine-domain.de/notebooks   # 401 ohne Token
docker compose logs -f api
```
