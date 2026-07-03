# CMS Scaffold Architecture

## Current Provider (Local)

### Storage Layout
- `.cms/live.json`: published live content
- `.cms/stage.json`: staged draft content
- `.cms/releases/*.json`: rolling backup snapshots of old live versions
- `public/uploads/*`: uploaded assets (URL-addressable)
- `content.json`: source-of-truth file used by site build/import

### Core Flow
1. Admin loads `/api/cms/state`.
2. Edits are saved to stage via `/api/cms/stage`.
3. Asset uploads go through `/api/cms/upload` and return durable URLs.
4. Publish via `/api/cms/publish`:
- diff live vs stage
- backup old live (`releaseKeepCount` rolling)
- promote stage -> live
- write new live to `content.json`
- trigger deploy hook if configured

## API Surface
- `GET /api/cms/state`
- `PUT /api/cms/stage`
- `POST /api/cms/reset-stage`
- `POST /api/cms/upload` (multipart: `file`, optional `folder`)
- `GET /api/cms/assets`
- `POST /api/cms/publish`

## Environment Variables
- `CMS_PROVIDER` (default: `local`)
- `CMS_STATE_DIR` (default: `.cms`)
- `CMS_RELEASE_KEEP_COUNT` (default: `3`)
- `CMS_LIVE_CONTENT_PATH` (default: `content.json`)
- `CMS_UPLOADS_DIR` (default: `public/uploads`)
- `CMS_UPLOADS_BASE_URL` (default: `/uploads`)
- `CMS_DEPLOY_HOOK_URL` (optional)
- `CMS_DEPLOY_HOOK_TOKEN` (optional bearer token)

## Scripts
- `npm run cms:init`
- `npm run cms:publish -- --reason "manual"`
- `npm run cms:test-flow`

## Cloud Provider Next Step
Keep the same `CmsProvider` interface and add:
- `cloudflare` provider (R2 + D1/KV metadata)
- or `vercel` provider (Blob + KV/Postgres metadata)

That keeps admin/API behavior stable while swapping persistence backend.

## Cloudflare Scaffold (Current)
- `wrangler.toml` binds:
- D1: `jordan-portfolio-cms` as `CMS_DB`
- R2: `jordan-portfolio-media` as `CMS_MEDIA`
- Worker routes:
- `GET /health`
- `GET /assets/:key`
- `POST /publish-hook`
- `GET /api/cms/state`
- `GET /api/cms/assets`
- `PUT /api/cms/stage`
- `POST /api/cms/reset-stage`
- `POST /api/cms/publish`
- `POST /api/cms/upload`
- Scripts:
- `npm run cms:cf:deploy`
- `npm run cms:cf:seed` (uploads media refs from `content.json` to R2 and writes cloud `live/stage` docs)
- `npm run cms:cf:test` (worker + D1 + publish-hook smoke test)
