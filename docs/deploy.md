# Deploy (home server)

- Push to `prod` triggers the self-hosted runner (label `home-server`), which runs `./deploy/start.sh`: `git pull --ff-only`, then `docker compose -f deploy/compose.prod.yaml up -d --build`.
- Container name is `guessdle-server`, port 8080. The Cloudflare tunnel service is `http://guessdle-server:8080` (public URL https://guessdle.niki.casa/).
- The container joins the external Docker network `immich_default`, the one `cloudflared` is on. The immich stack creates it, so immich must be up first.
- "Bad gateway" → run `docker inspect guessdle-server` and `docker inspect cloudflared_tunnel`; both must list the same network under `Networks`.
- GitHub Pages only serves `deploy/redirect.html` to the home server (ADR 0005).
