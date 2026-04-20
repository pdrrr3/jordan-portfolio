# Cloudflare CMS Pipeline (D1 + R2 + Worker)

## Resources
- Worker: `jordan-portfolio-cms-hook`
- Worker URL: `https://jordan-portfolio-cms-hook.timur-23f.workers.dev`
- D1: `jordan-portfolio-cms`
- R2: `jordan-portfolio-media`

## What Is Wired
- `GET /health`: validates worker and D1 connection.
- `GET /assets/:key`: serves uploaded media from R2.
- `POST /publish-hook`: records a release row in D1 and optionally relays to a downstream deploy hook.
- `GET /api/cms/state`
- `GET /api/cms/assets`
- `PUT /api/cms/stage`
- `POST /api/cms/reset-stage`
- `POST /api/cms/publish`
- `POST /api/cms/upload`

## Seed Current Portfolio Content
Uploads all local media referenced by `content.json` and writes cloud-ready `live` and `stage` docs into D1.

```bash
npm run cms:cf:seed
```

Optional environment overrides:
- `CMS_CF_D1_DB` (default `jordan-portfolio-cms`)
- `CMS_CF_R2_BUCKET` (default `jordan-portfolio-media`)
- `CMS_CF_WORKER_URL` (default worker URL above)
- `CMS_CF_CONTENT_PATH` (default `content.json`)
- `CMS_CF_R2_PREFIX` (optional key prefix under bucket)

## Smoke Test Pipeline
Checks worker health, confirms `live/stage` docs exist, calls `/publish-hook`, and verifies release row was written.

```bash
npm run cms:cf:test
```

## Optional Downstream Deploy Hook
If you want publish events to trigger a real build/redeploy, configure a secret and redeploy worker:

```bash
wrangler secret put DOWNSTREAM_DEPLOY_HOOK_URL
wrangler secret put DOWNSTREAM_DEPLOY_HOOK_BEARER
npm run cms:cf:deploy
```

## Frontend Static Export (Next.js)
`next export` is removed in Next 14; this repo uses `output: export` under a dedicated build mode.

```bash
npm run build:frontend
```

This generates static files in `out/`.
The build script temporarily removes `src/app/api` during export and restores it after build, so CMS APIs still work in normal server mode.

`/admin` in Pages calls Worker APIs directly (cross-origin) by default.
Optional override: set `NEXT_PUBLIC_CMS_API_BASE` at build time.

## Frontend Pages Deploy
Project: `jordan-portfolio-frontend`

```bash
npm run deploy:frontend
```

Current URLs:
- `https://jordan-portfolio-frontend.pages.dev`
- Per-deploy preview URL: `https://<deployment-id>.jordan-portfolio-frontend.pages.dev`
