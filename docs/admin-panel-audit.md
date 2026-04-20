# Admin Panel Audit

## Current State (Legacy `admin/index.html`)

The current admin panel is functionally a local editing utility, not a cloud CMS:

- Persistence is browser-local (`localStorage`), so drafts are tied to one device/browser profile.
- `content.json` is only a fallback seed, not a true live source-of-truth contract.
- Media management relies on selecting a local folder from the user's machine (`webkitdirectory`) and storing file paths, not uploading/hosting assets.
- Publishing is manual export/import JSON, without stage/live separation, release promotion, rollback, or deploy hook orchestration.
- No access control, environment separation, or server-side validation.
- No release metadata, no audit log, and no immutable backup snapshots.

## Missing CMS Capabilities

- Cloud-hosted draft persistence.
- Atomic publish from stage to live.
- Rolling backup snapshots with rollback target.
- Media upload to object storage with canonical URLs.
- Deterministic publish trigger and deploy hook integration.
- Preview/diff semantics between stage and live.
- Operational observability (release history, hook result status).

## Immediate Recommendation

Use a staged JSON workflow with server-side state:

- `live.json` = production content.
- `stage.json` = editable draft.
- `publish` action promotes stage to live atomically.
- On publish:
  - snapshot previous live to backups.
  - keep latest N backups (N=3).
  - append release metadata.
  - trigger deploy hook.
- Media uploads are stored immediately and referenced by URL in stage JSON.

