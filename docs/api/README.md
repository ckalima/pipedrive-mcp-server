# Pipedrive OpenAPI specifications (vendored)

Upstream Pipedrive API specs, checked in for reference and version tracking. These are the
authoritative source of truth for request/response shapes during the v1 to v2 migration
([#51](https://github.com/ckalima/pipedrive-mcp-server/issues/51)) and the basis for the
planned OpenAPI contract tests ([#49](https://github.com/ckalima/pipedrive-mcp-server/issues/49)).

Do not hand-edit. To update, re-download from source and replace the file wholesale.

| File | API | Spec version | Server base | Source |
|---|---|---|---|---|
| `openapi-v2.yaml` | Pipedrive API v2 | 2.0.0 | `https://api.pipedrive.com/api/v2` | Pipedrive Developers (v2). Canonical download URL: TODO confirm. |
| `openapi-v1.yaml` | Pipedrive API v1 | 1.0.0 | `https://api.pipedrive.com/v1` | https://developers.pipedrive.com/docs/api/v1/openapi.yaml |

- Retrieved: 2026-06-08.
- v1 hard sunset: 2026-07-31 per `CLAUDE.md` (the live guide page no longer states a date;
  verify against Pipedrive's changelog, tracked in #49).
- Migration guide: https://pipedrive.readme.io/docs/pipedrive-api-v2-migration-guide
