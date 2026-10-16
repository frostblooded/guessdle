# Deploy (home server)

- Push to `prod` triggers the self-hosted runner (label `home-server`), which runs `./deploy/start.sh`: `git pull --ff-only`, then `docker compose -f deploy/compose.prod.yaml up -d --build`.
- Three compose services: `web` (nginx, container `guessdle-server`, port 8080), `api` (Express, port 3000, internal only) and `db` (Postgres 17, named volume `db-data`, no published port). nginx proxies `/api/` to `api`. The Cloudflare tunnel service is `http://guessdle-server:8080` (public URL https://guessdle.niki.casa/).
- Only `web` joins the external Docker network `immich_default`, the one `cloudflared` is on. The immich stack creates it, so immich must be up first. `api` and `db` sit on the private `internal` network.
- Secrets: untracked `deploy/.env` on the server (copy `deploy/.env.example`). Required keys: `POSTGRES_PASSWORD`. The API gets `DATABASE_URL` from compose; `api` runs pending migrations (`db/migrations/*.sql`) at startup.
- Health: `curl http://localhost:3000/api/health` inside the api container, or `/api/health` through the site; 503 means the API cannot reach Postgres.
- "Bad gateway" → run `docker inspect guessdle-server` and `docker inspect cloudflared_tunnel`; both must list the same network under `Networks`.
- GitHub Pages only serves `deploy/redirect.html` to the home server (ADR 0005).

## Local development

- `docker compose -f deploy/compose.yaml up -d db`, copy `.env.example` to `.env`, then `npm run build && npm start`: one Node process serves the page and `/api`. Without `DATABASE_URL` only static files are served.
- `npm run test:integration` needs Docker (Testcontainers starts Postgres itself).
