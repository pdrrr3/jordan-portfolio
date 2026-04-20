# Admin Panel Audit (April 16, 2026)

## Scope
Audited the legacy admin implementation at `admin/index.html` and compared it against the desired CMS workflow:
- cloud-backed draft persistence
- staged vs live separation
- publish pipeline with rollback
- media upload and URL-based references
- stable operational behavior

## Findings

### Critical
1. **State is device-local, not shared**
- Data persists to `localStorage` (`portfolio-content`) and is not canonical across devices/users.
- Opening admin on another browser or machine can show stale or empty state.

2. **No draft/live model**
- Existing admin edits one local blob and exports JSON manually.
- No first-class concept of staged edits vs published content.

3. **No publish transaction**
- There is no atomic promote step from stage to live.
- No hook-triggered deploy built into the editor workflow.

4. **No rollback safety**
- Existing flow has import/export only; no release history or rolling backups.

### High
5. **Media management is not real storage**
- “Upload” scans a local folder and stores file paths in local storage.
- Files are not uploaded to durable object storage.

6. **No multi-session conflict handling**
- Two sessions can overwrite each other without detection.
- No version/hash checks during save/publish.

7. **No server-side validation boundary**
- Content shape enforcement is mostly client-side.
- Invalid JSON can propagate until runtime failures.

### Medium
8. **No deployment observability**
- No publish log with deploy-hook status in a durable backend record.

9. **No auth/access model**
- Admin entry has no authentication/authorization gate.

10. **No environment abstraction**
- No provider layer for local vs cloud backends.

## What Was Missing for a Real CMS
- Persistent canonical backend state
- Draft/live separation
- Atomic publish
- Backups and rollback
- True object storage-backed media upload
- API contract for admin actions
- Deployment hook integration

## Scaffold Added In This Branch
Implemented a new CMS scaffold with these pieces:
- `src/server/cms/*`: provider abstraction + local provider
- `/api/cms/state`: load live + stage + diff + assets
- `/api/cms/stage`: save staged JSON
- `/api/cms/reset-stage`: reset stage from live
- `/api/cms/upload`: upload file to storage provider (local now)
- `/api/cms/publish`: promote stage -> live, backup old live, trigger deploy hook
- `scripts/cms/*`: init, publish, test-flow
- `/admin`: new SPA shell wired to this API model

## Remaining Gaps Before Production
1. Add auth (e.g., Cloudflare Access, NextAuth, or signed admin token).
2. Add optimistic concurrency (save/publish requires expected stage version).
3. Add richer schema validation + migrations.
4. Add audit logs (who saved/published, diff, hook result).
5. Add provider implementation for Cloudflare/Vercel storage backends.
