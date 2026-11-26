# Primary-Source & Agentic Web Micro-API (Cloudflare Worker)

Zero-dependency Cloudflare Worker REST API built for **RapidAPI Hub** monetization (`$0` hosting on Cloudflare Workers free 100k req/day tier).

## Endpoints

- `GET /v1/health` — Service health & catalog
- `GET /v1/fred?series=ICSA&limit=10` — Federal Reserve Economic Data CSV parsed to clean JSON with latest delta
- `GET /v1/defillama?protocol=aave` — DeFi protocol TVL & chain breakdown
- `GET /v1/github/releases?repo=oven-sh/bun&limit=5` — Latest GitHub releases & timestamps
- `GET /v1/agentic-audit?url=https://...` — Open Agentic Web MVP 0.3 conformance grader (`0-100`, `A+` to `F`)

## Local Verification & Deploy

```bash
node --test test/worker.test.mjs
npx wrangler deploy
# Optional: protect origin for RapidAPI Hub
npx wrangler secret put RAPIDAPI_PROXY_SECRET
```
