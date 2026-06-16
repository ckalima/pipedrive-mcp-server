# Pipedrive MCP Server

[![npm version](https://img.shields.io/npm/v/@ckalima/pipedrive-mcp-server?logo=npm)](https://www.npmjs.com/package/@ckalima/pipedrive-mcp-server)
[![CI](https://github.com/ckalima/pipedrive-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/ckalima/pipedrive-mcp-server/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-1%2C700%2B%20passing-brightgreen)](https://github.com/ckalima/pipedrive-mcp-server/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

An MCP (Model Context Protocol) server for Pipedrive CRM integration with Claude Code and Claude Desktop. Query, create, and update CRM data directly from your AI assistant.

## Why this server

- **API v2-first.** Every entity uses Pipedrive's v2 REST API where it exists; v1 is used only for the capabilities that have no v2 equivalent (notes, mail, users, and leads CRUD). See [API Versioning](#api-versioning).
- **Contract-tested against the real OpenAPI spec.** Request params, request bodies, and response shapes are checked against the vendored Pipedrive OpenAPI v2 definition (`docs/api/openapi-v2.yaml`) in `tests/contract/`, so the v2 tools can't silently drift from the documented API.
- **Live-smoke verified.** The tool surface is broadly exercised against a real Pipedrive account (`scripts/smoke-coverage.ts`), with only API-unseedable surfaces (e.g. mail threads, project templates) left to manual checks. Coverage includes plan-gated endpoints such as Growth+ deal installments (`scripts/smoke-installments.ts`). Key write smokes (e.g. the task `is_done` flag) assert the field value actually changed on the wire, not just a 200.
- **Server-enforced capability modes.** `PIPEDRIVE_MODE` picks a safety tier — `read-only`, `safe-write` (the default: reads + non-destructive writes), or `full` — and out-of-mode tools are both hidden from `tools/list` and refused if called directly. Deletes, conversions, and other irreversible writes (🔒 in the tool table) require `full`, so the server is read-and-create only out of the box. Every tool also carries MCP annotations (`readOnlyHint`/`destructiveHint`/`idempotentHint`) so policy-aware clients can tell reads from writes from deletes. See [Capability modes](#capability-modes).
- **MIT licensed**, published with npm build provenance.

**Honest limitations.** Transport is STDIO only today (a Streamable HTTP flag is planned), and auth is via a Pipedrive API key, which matches the local/self-hosted tier this server targets. There is no hosted OAuth offering yet.

## Features

- **Full CRM Operations**: Deals, persons, organizations, activities
- **Email Analysis**: Access mail threads and messages for engagement analysis
- **Field Discovery**: Map custom field hash codes to human-readable names
- **Pipeline Management**: List pipelines, stages, and users
- **Pagination Support**: Cursor-based pagination for large datasets
- **Error Handling**: Clear, actionable error messages

## Quick Start

### 1. Get Your Pipedrive API Key

1. Log into Pipedrive
2. Go to **Settings** > **Personal preferences** > **API**
3. Copy your API key (40 characters)

### 2. Configure Claude Code

Add to your `.mcp.json` file:

```json
{
  "mcpServers": {
    "pipedrive": {
      "command": "npx",
      "args": ["-y", "@ckalima/pipedrive-mcp-server"],
      "env": {
        "PIPEDRIVE_API_KEY": "your-40-character-api-key"
      }
    }
  }
}
```

> **Package name:** the supported package is the scoped **`@ckalima/pipedrive-mcp-server`**. If you arrived from an older snippet that referenced the unscoped `pipedrive-mcp-server`, update your config to the scoped name above — the unscoped name is a different, unrelated package.

You can also start it directly to verify your setup:

```bash
npx -y @ckalima/pipedrive-mcp-server
```

Or set the environment variable:

```bash
export PIPEDRIVE_API_KEY="your-40-character-api-key"
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PIPEDRIVE_API_KEY` | Yes | - | Your 40-character Pipedrive API token. |
| `PIPEDRIVE_MODE` | No | `safe-write` | Server-enforced capability tier: `read-only` (reads only), `safe-write` (reads + non-destructive writes), or `full` (all tools, including destructive). Out-of-mode tools are hidden from `tools/list` and refused if called directly. Authoritative when set to a recognized value; a blank value is treated as unset (the default applies), an unrecognized value falls back to `read-only`. See [Capability modes](#capability-modes). |
| `PIPEDRIVE_ENABLE_DESTRUCTIVE` | No | `false` | Legacy flag, superseded by `PIPEDRIVE_MODE`. When `PIPEDRIVE_MODE` is unset, `true` is treated as `full` and anything else as `safe-write`. Still honored for back-compat; prefer `PIPEDRIVE_MODE=full`. |
| `PIPEDRIVE_IMAGE_BASE_DIR` | No | (unset) | Allowlisted directory the server may read product images from when `file_path` is passed to the image-upload tools. Filesystem reads are **disabled** unless this is set, and a `file_path` must resolve within it. Leave unset and pass `base64_data` if the caller cannot share the server's filesystem. See [SECURITY.md](SECURITY.md#operator-best-practices). |

To enable destructive tools, set `PIPEDRIVE_MODE=full` (or, for back-compat, `PIPEDRIVE_ENABLE_DESTRUCTIVE=true`) in the `env` block of your `.mcp.json` alongside `PIPEDRIVE_API_KEY`. Below `full`, every 🔒 tool returns a `DESTRUCTIVE_DISABLED` error instead of acting, and tools above the active tier return a `MODE_RESTRICTED` error.

### Capability modes

`PIPEDRIVE_MODE` sets a server-enforced safety tier. The tier is enforced two ways: out-of-mode tools are filtered out of `tools/list` (so the agent never sees them) and the dispatcher refuses any out-of-mode call by name before its handler runs, so the tier is a real guarantee rather than a UI hint.

| Mode | What's available | Tools | Destructive ops |
|------|------------------|------:|-----------------|
| `read-only` | read verbs only (`list`/`get`/`search`) | 69 | no |
| `safe-write` | reads + non-destructive writes | 124 | no |
| `full` | all tools | 155 | yes |

**Recommended for first-time setup and agent evaluation: `read-only`.** Let the agent look before it can touch anything, then widen the tier as you build trust.

**Backward compatibility.** `PIPEDRIVE_MODE` is authoritative when set. When it is unset, the mode is derived from the legacy `PIPEDRIVE_ENABLE_DESTRUCTIVE` flag (`true` → `full`, otherwise `safe-write`), so existing installs keep their *execution* behavior on upgrade: every tool that ran before still runs, and every tool gated before is still gated. The one observable change at the unset default (`safe-write`) is that the 31 destructive tools — already refused at execution unless enabled — are now also hidden from `tools/list` rather than listed-then-refused (so the listed surface is 124, not 155). An unrecognized `PIPEDRIVE_MODE` value falls back to `read-only`.

### 3. Start Using

Once configured, Claude can access your Pipedrive data:

- "Show me open deals worth more than $10,000"
- "Create a deal called 'Acme Contract' with value $50,000"
- "Find all contacts at TechCorp"
- "List recent email threads in my inbox"
- "What custom fields are defined for deals?"

## Available Tools

<!-- BEGIN GENERATED TOOLS -->

**155 tools.** 🔒 destructive (require `PIPEDRIVE_MODE=full`, off by default) · ⭑ requires a Growth+ plan. The active [capability mode](#capability-modes) governs which tools are listed.

<sub>This section is generated by `npm run gen:docs` from the live tool registry. Do not edit by hand - CI fails on drift.</sub>

### Deals

| Tool | Description |
|------|-------------|
| `pipedrive_list_deals` | List deals from Pipedrive with optional filtering by owner, person, organization, pipeline, stage, or status. Returns paginated results. |
| `pipedrive_get_deal` | Get detailed information about a specific deal by ID, including all standard and custom fields. |
| `pipedrive_create_deal` | Create a new deal in Pipedrive. Only title is required; all other fields are optional. |
| `pipedrive_update_deal` | Update an existing deal in Pipedrive. Specify the deal ID and any fields to update. |
| `pipedrive_search_deals` | Search for deals by text in title. Supports fuzzy matching by default. |
| `pipedrive_delete_deal` 🔒 | Delete a deal. The deal will be marked as deleted and permanently removed after 30 days. |
| `pipedrive_list_deal_followers` | List all followers for a deal. |
| `pipedrive_add_deal_follower` | Add a follower to a deal. |
| `pipedrive_delete_deal_follower` 🔒 | Remove a follower from a deal. |
| `pipedrive_get_deal_followers_changelog` | Get the followers changelog for a deal. |
| `pipedrive_list_deal_products` | List line-item products attached to a deal. Returns paginated results. |
| `pipedrive_add_deal_product` | Attach a single product as a line item to a deal. |
| `pipedrive_update_deal_product` | Update a line-item product attached to a deal. All body fields optional. |
| `pipedrive_delete_deal_product` 🔒 | Remove a line-item product from a deal. |
| `pipedrive_bulk_add_deal_products` | Bulk-add up to 100 line-item products to a deal in one request. |
| `pipedrive_list_deal_discounts` | List all additional discounts applied to a deal. |
| `pipedrive_add_deal_discount` | Add an additional discount to a deal. |
| `pipedrive_update_deal_discount` | Update an additional discount on a deal. All fields except IDs are optional. |
| `pipedrive_delete_deal_discount` 🔒 | Delete an additional discount from a deal. |
| `pipedrive_list_deal_installments` ⭑ | List installments across one or more deals. Requires deal_ids. Growth+ plan required. |
| `pipedrive_add_deal_installment` ⭑ | Add an installment (payment schedule entry) to a deal. Growth+ plan required; the deal must have at least one one-time product and no recurring products. |
| `pipedrive_update_deal_installment` ⭑ | Update an installment on a deal. Growth+ plan required; all body fields optional. |
| `pipedrive_delete_deal_installment` 🔒 ⭑ | Delete an installment from a deal. Growth+ plan required. |
| `pipedrive_list_archived_deals` | List archived deals with the same filtering as the active deals list (owner, person, organization, pipeline, stage, status). Returns paginated results. |
| `pipedrive_convert_deal_to_lead` 🔒 | Convert a deal to a lead (async job). DESTRUCTIVE: a successful conversion marks the source deal as deleted. Returns a conversion_id; the conversion runs asynchronously, so you MUST poll pipedrive_get_deal_conversion_status with the conversion_id until a terminal status. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |
| `pipedrive_get_deal_conversion_status` | Get the status of a deal-to-lead conversion job. Status contract: 'completed' (terminal, carries lead_id), 'failed'/'rejected' (terminal, stop polling, no lead produced), 'not_started'/'running' (in-progress, re-poll). Only 'completed' carries lead_id, and conversion status is purged after a few days, so a 404 returned after a prior valid status means the status was purged (terminal stop-polling signal, not a transient error). Use a bounded poll budget (e.g. up to ~6 attempts with short backoff), not an unbounded loop. |

### Persons

| Tool | Description |
|------|-------------|
| `pipedrive_list_persons` | List persons (contacts) from Pipedrive with optional filtering by owner, organization, or first letter of name. |
| `pipedrive_get_person` | Get detailed information about a specific person by ID. |
| `pipedrive_create_person` | Create a new person (contact) in Pipedrive. Only name is required. |
| `pipedrive_update_person` | Update an existing person in Pipedrive. |
| `pipedrive_search_persons` | Search for persons by name, email, or phone number. |
| `pipedrive_delete_person` 🔒 | Delete a person. The person will be marked as deleted and permanently removed after 30 days. |
| `pipedrive_list_person_followers` | List all followers for a person. |
| `pipedrive_add_person_follower` | Add a follower to a person. |
| `pipedrive_delete_person_follower` 🔒 | Remove a follower from a person. |
| `pipedrive_get_person_followers_changelog` | Get the followers changelog for a person. |
| `pipedrive_get_person_picture` | Get the picture for a person (read-only; returns picture metadata and sized image URLs). Returns an error if the person has no picture. |

### Organizations

| Tool | Description |
|------|-------------|
| `pipedrive_list_organizations` | List organizations from Pipedrive with optional filtering by owner or first letter of name. |
| `pipedrive_get_organization` | Get detailed information about a specific organization by ID. |
| `pipedrive_create_organization` | Create a new organization in Pipedrive. Only name is required. |
| `pipedrive_update_organization` | Update an existing organization in Pipedrive. |
| `pipedrive_search_organizations` | Search for organizations by name or address. |
| `pipedrive_delete_organization` 🔒 | Delete an organization. The organization will be marked as deleted and permanently removed after 30 days. |
| `pipedrive_list_organization_followers` | List all followers for an organization. |
| `pipedrive_add_organization_follower` | Add a follower to an organization. |
| `pipedrive_delete_organization_follower` 🔒 | Remove a follower from an organization. |
| `pipedrive_get_organization_followers_changelog` | Get the followers changelog for an organization. |

### Activities

| Tool | Description |
|------|-------------|
| `pipedrive_list_activities` | List activities from Pipedrive with optional filtering by owner, deal, person, organization, type, or completion status. |
| `pipedrive_get_activity` | Get detailed information about a specific activity by ID. |
| `pipedrive_create_activity` | Create a new activity in Pipedrive. Subject and type are required. |
| `pipedrive_update_activity` | Update an existing activity in Pipedrive. Use this to mark activities as done. |
| `pipedrive_delete_activity` 🔒 | Delete an activity. |

### Notes

| Tool | Description |
|------|-------------|
| `pipedrive_list_notes` | List notes from Pipedrive with optional filtering by deal, person, organization, or lead. |
| `pipedrive_get_note` | Get detailed information about a specific note by ID. |
| `pipedrive_create_note` | Create a new note in Pipedrive. Content is required. Link to a deal, person, organization, or lead. |
| `pipedrive_update_note` | Update an existing note in Pipedrive. |
| `pipedrive_delete_note` 🔒 | Delete a note. |

### Leads

| Tool | Description |
|------|-------------|
| `pipedrive_list_leads` | List active (non-archived) leads from Pipedrive with optional filtering by owner, person, or organization. |
| `pipedrive_list_archived_leads` | List archived leads from Pipedrive with optional filtering by owner, person, or organization. |
| `pipedrive_get_lead` | Get detailed information about a specific lead by UUID. |
| `pipedrive_create_lead` | Create a new lead in Pipedrive. Title is required; link to at least one of person_id or organization_id. |
| `pipedrive_update_lead` | Update an existing lead in Pipedrive. |
| `pipedrive_search_leads` | Search for leads in Pipedrive by title or associated contacts. |
| `pipedrive_delete_lead` 🔒 | Delete a lead. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |
| `pipedrive_convert_lead_to_deal` | Convert a lead into a deal (Pipedrive v2). The conversion runs asynchronously; this tool polls until it completes (typically under 5s) and returns the new deal ID. If it is still running after ~30s, it returns the conversion_id and status for manual follow-up. |
| `pipedrive_get_lead_conversion_status` | Get the status of an async lead-to-deal conversion by conversion ID (Pipedrive v2 GET /leads/{id}/convert/status/{conversion_id}). |

### Projects

| Tool | Description |
|------|-------------|
| `pipedrive_list_projects` | List projects from Pipedrive with optional filtering by board, phase, or status. Returns paginated results. (Requires the Projects add-on; Projects API is in public beta.) |
| `pipedrive_get_project` | Get detailed information about a specific project by ID. (Requires the Projects add-on; Projects API is in public beta.) |
| `pipedrive_create_project` | Create a new project in Pipedrive. Requires title, board_id, and phase_id. (Requires the Projects add-on; Projects API is in public beta.) |
| `pipedrive_update_project` | Update an existing project in Pipedrive. (Requires the Projects add-on; Projects API is in public beta.) |
| `pipedrive_delete_project` 🔒 | Delete a project. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). (Requires the Projects add-on; Projects API is in public beta.) |
| `pipedrive_search_projects` | Search for projects in Pipedrive by title. (Requires the Projects add-on; Projects API is in public beta.) |
| `pipedrive_archive_project` | Archive a project by setting its status to archived. (Requires the Projects add-on; Projects API is in public beta.) |
| `pipedrive_list_project_tasks` | List tasks for a project you already have the ID for — pass only `id` (the project ID). For broader task queries use pipedrive_list_tasks. (Projects add-on; Projects API in public beta.) |
| `pipedrive_list_project_templates` | List all project templates available in Pipedrive. Returns paginated results. |
| `pipedrive_get_project_template` | Get detailed information about a specific project template by ID. |
| `pipedrive_list_archived_projects` | List archived projects from Pipedrive with optional filtering by filter, phase, or status. (Projects add-on; Projects API in public beta.) |
| `pipedrive_get_project_permitted_users` | Get the list of user IDs that have permission to access a project. Returns an array of integer user IDs. (Projects add-on; Projects API in public beta.) |
| `pipedrive_get_project_changelog` | Get the changelog for a project, showing what changed, when, and by whom. Returns paginated entries with actor_user_id, new_values, and old_values. (Projects add-on; Projects API in public beta.) |

### Products

| Tool | Description |
|------|-------------|
| `pipedrive_list_products` | List products from Pipedrive with optional filtering by owner, IDs, or filter. |
| `pipedrive_get_product` | Get detailed information about a specific product by ID. |
| `pipedrive_search_products` | Search for products by name, code, or custom fields. |
| `pipedrive_create_product` | Create a new product in Pipedrive. Only name is required. |
| `pipedrive_update_product` | Update an existing product in Pipedrive. |
| `pipedrive_delete_product` 🔒 | Delete a product. The product will be marked as deleted and permanently removed after 30 days. |
| `pipedrive_list_product_variations` | List all variations for a product. |
| `pipedrive_add_product_variation` | Add a variation to a product. |
| `pipedrive_update_product_variation` | Update an existing product variation. |
| `pipedrive_delete_product_variation` 🔒 | Delete a product variation. |
| `pipedrive_list_product_followers` | List all followers for a product. |
| `pipedrive_add_product_follower` | Add a follower to a product. |
| `pipedrive_delete_product_follower` 🔒 | Remove a follower from a product. |
| `pipedrive_get_product_followers_changelog` | Get the followers changelog for a product. |
| `pipedrive_get_product_image` | Get the image of a product (returns a single image with a public URL valid for 7 days). |
| `pipedrive_delete_product_image` 🔒 | Delete the image of a product. |
| `pipedrive_upload_product_image` | Upload an image for a product. Provide the image via EITHER file_path OR base64_data (exactly one required). Supports png, jpeg, gif, and webp. Note: file_path is read by the SERVER process via the filesystem and is disabled by default; the operator must set PIPEDRIVE_IMAGE_BASE_DIR and the path must resolve within it; otherwise use base64_data, which is transport-safe. |
| `pipedrive_update_product_image` | Update (replace) the image of a product. Provide the image via EITHER file_path OR base64_data (exactly one required). Supports png, jpeg, gif, and webp. Note: file_path is read by the SERVER process via the filesystem and is disabled by default; the operator must set PIPEDRIVE_IMAGE_BASE_DIR and the path must resolve within it; otherwise use base64_data, which is transport-safe. |

### Tasks

| Tool | Description |
|------|-------------|
| `pipedrive_list_tasks` | General task query across all projects, with optional project_id, assignee_id, done/milestone, and parent filters. Use for anything beyond a single project's full task list. (Projects add-on; Projects API in public beta.) |
| `pipedrive_get_task` | Get detailed information about a specific task by ID. (Projects add-on; Projects API in public beta.) |
| `pipedrive_create_task` | Create a new task in a project. title and project_id are required. Use boolean is_done/is_milestone (same field names as the GET response); a milestone task must have a due_date. (Projects add-on; Projects API in public beta.) |
| `pipedrive_update_task` | Update an existing task. Only id is required; all other fields are optional. Use boolean is_done/is_milestone (same field names as the GET response); a milestone task must have a due_date. (Projects add-on; Projects API in public beta.) |
| `pipedrive_delete_task` 🔒 | Delete a task. If the task has subtasks, those will also be deleted. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). (Projects add-on; Projects API in public beta.) |

### Boards & Phases

| Tool | Description |
|------|-------------|
| `pipedrive_list_boards` | List all project boards. Returns the complete list (no pagination — the boards endpoint returns all records at once). (Projects add-on; Projects API in public beta.) |
| `pipedrive_get_board` | Get detailed information about a specific project board by ID. (Projects add-on; Projects API in public beta.) |
| `pipedrive_create_board` | Create a new project board. name is required. (Projects add-on; Projects API in public beta.) |
| `pipedrive_update_board` | Update an existing project board. Only id is required; all other fields are optional. (Projects add-on; Projects API in public beta.) |
| `pipedrive_delete_board` 🔒 | Delete a project board. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). (Projects add-on; Projects API in public beta.) |
| `pipedrive_list_phases` | List all phases for a project board. board_id is required. Returns the complete list (no pagination — the phases endpoint returns all records for a board at once). (Projects add-on; Projects API in public beta.) |
| `pipedrive_get_phase` | Get detailed information about a specific project phase by ID. (Projects add-on; Projects API in public beta.) |
| `pipedrive_create_phase` | Create a new project phase. name and board_id are required. (Projects add-on; Projects API in public beta.) |
| `pipedrive_update_phase` | Update an existing project phase. Only id is required; all other fields are optional. Set board_id to move this phase to a different board. (Projects add-on; Projects API in public beta.) |
| `pipedrive_delete_phase` 🔒 | Delete a project phase. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). (Projects add-on; Projects API in public beta.) |

### Mail

| Tool | Description |
|------|-------------|
| `pipedrive_get_person_emails` | Get email messages linked to a person (company-wide, all users' emails). Returns metadata for emails from any user's mailbox that are linked to this person. Note: To get full message body, use pipedrive_get_mail_message, but only for emails in YOUR mailbox. |
| `pipedrive_get_deal_emails` | Get email messages linked to a deal (company-wide, all users' emails). Returns metadata for emails from any user's mailbox that are linked to this deal. Note: To get full message body, use pipedrive_get_mail_message, but only for emails in YOUR mailbox. |
| `pipedrive_list_mail_threads` | List mail threads from YOUR mailbox only (authenticated user). Other users' threads are not accessible. Use folder parameter to filter by inbox, drafts, sent, or archive. |
| `pipedrive_get_mail_thread` | Get a mail thread with messages. Access depends on visibility settings - threads visible within deals/persons you can access should work. Returns 404 if the thread isn't accessible to you. |
| `pipedrive_get_mail_message` | Get full email message with body. Access depends on visibility settings - messages linked to deals/persons you can access should work, even if sent by other users. |

### Fields

| Tool | Description |
|------|-------------|
| `pipedrive_list_organization_fields` | List all organization field definitions, including custom fields. Use this to map 40-character field keys to human-readable names. |
| `pipedrive_list_deal_fields` | List all deal field definitions, including custom fields. Essential for understanding deal data structure. |
| `pipedrive_list_person_fields` | List all person field definitions, including custom fields. Use to understand contact data structure. |
| `pipedrive_list_product_fields` | List all product field definitions, including custom fields. |
| `pipedrive_list_project_fields` | List all project field definitions, including custom fields. (Projects add-on; Projects API in public beta.) |
| `pipedrive_get_field` | Get details of a specific field by its key. Useful for looking up what a 40-character hash field key means. |
| `pipedrive_create_deal_field` | Create a deal custom field. field_name and field_type are required. For enum/set types, options is required. The response data.field_code is the 40-char hash you must keep to update or delete the field later. |
| `pipedrive_update_deal_field` | Update a deal custom field by field_code. field_type and field_code cannot be changed. |
| `pipedrive_delete_deal_field` 🔒 | Delete a deal custom field by field_code. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |
| `pipedrive_update_deal_field_options` | Bulk-update option labels of a deal enum/set field. Atomic: the whole request fails if any option ID does not exist. |
| `pipedrive_delete_deal_field_options` 🔒 | Bulk-delete options of a deal enum/set field. Atomic: fails if any ID does not exist. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |
| `pipedrive_create_person_field` | Create a person custom field. field_name and field_type are required. For enum/set types, options is required. The response data.field_code is the 40-char hash to keep for later updates. |
| `pipedrive_update_person_field` | Update a person custom field by field_code. field_type and field_code cannot be changed. |
| `pipedrive_delete_person_field` 🔒 | Delete a person custom field by field_code. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |
| `pipedrive_update_person_field_options` | Bulk-update option labels of a person enum/set field. Atomic: the whole request fails if any option ID does not exist. |
| `pipedrive_delete_person_field_options` 🔒 | Bulk-delete options of a person enum/set field. Atomic: fails if any ID does not exist. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |
| `pipedrive_create_organization_field` | Create an organization custom field. field_name and field_type are required. For enum/set types, options is required. The response data.field_code is the 40-char hash to keep for later updates. |
| `pipedrive_update_organization_field` | Update an organization custom field by field_code. field_type and field_code cannot be changed. |
| `pipedrive_delete_organization_field` 🔒 | Delete an organization custom field by field_code. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |
| `pipedrive_update_organization_field_options` | Bulk-update option labels of an organization enum/set field. Atomic: the whole request fails if any option ID does not exist. |
| `pipedrive_delete_organization_field_options` 🔒 | Bulk-delete options of an organization enum/set field. Atomic: fails if any ID does not exist. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |
| `pipedrive_create_product_field` | Create a product custom field. field_name and field_type are required. For enum/set types, options is required. Product fields use a simpler model: no description, important_fields, or required_fields. The response data.field_code is the 40-char hash to keep for later updates. |
| `pipedrive_update_product_field` | Update a product custom field by field_code. Only field_name and ui_visibility can be changed (product fields have no description/important_fields/required_fields). |
| `pipedrive_delete_product_field` 🔒 | Delete a product custom field by field_code. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |
| `pipedrive_update_product_field_options` | Bulk-update option labels of a product enum/set field. Atomic: the whole request fails if any option ID does not exist. |
| `pipedrive_delete_product_field_options` 🔒 | Bulk-delete options of a product enum/set field. Atomic: fails if any ID does not exist. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |

### Pipelines & Stages

| Tool | Description |
|------|-------------|
| `pipedrive_list_pipelines` | List sales pipelines in Pipedrive with cursor pagination. Pipelines contain stages that deals move through. |
| `pipedrive_list_stages` | List stages with cursor pagination, optionally filtered by pipeline. Stages represent steps in the sales process. |
| `pipedrive_get_stage` | Get details of a specific stage by ID. |
| `pipedrive_create_pipeline` | Create a new sales pipeline. Only name is required. Set is_deal_probability_enabled to turn on weighted deal probability for the pipeline. |
| `pipedrive_update_pipeline` | Update an existing pipeline. Provide the pipeline id and any fields to change. |
| `pipedrive_delete_pipeline` 🔒 | Delete a pipeline. Marks the pipeline as deleted. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |
| `pipedrive_create_stage` | Create a new stage in a pipeline. name and pipeline_id are required. Use is_deal_rot_enabled and days_to_rotten to configure deal rotting. |
| `pipedrive_update_stage` | Update an existing stage. Provide the stage id and any fields to change. Set pipeline_id to move the stage to another pipeline. |
| `pipedrive_delete_stage` 🔒 | Delete a stage. Marks the stage as deleted. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). |

### Users

| Tool | Description |
|------|-------------|
| `pipedrive_list_users` | List all users in the Pipedrive account. Useful for finding owner IDs when creating or filtering records. |
| `pipedrive_get_user` | Get details of a specific user by ID. |
| `pipedrive_get_current_user` | Get details of the current user (API key owner). Useful for verifying connection and getting your user ID. |

<!-- END GENERATED TOOLS -->

## Example Workflows

### Analyze Deal Pipeline

```
"Show me all open deals in the Sales pipeline, sorted by value"
"Get details for deal 12345 including custom fields"
"Move deal 12345 to the Proposal stage"
```

### Customer Research

```
"Find contacts at Acme Corp"
"Get emails for person 456 to analyze their engagement"
"What custom fields do we have for persons?"
```

### Activity Management

```
"List my overdue activities"
"Create a follow-up call with John Smith for tomorrow at 2pm"
"Mark activity 789 as done"
```

### Field Discovery

```
"List all custom fields for deals"
"What does field '8a4d7f...' mean?" (40-char hash)
```

## Development

### Local Setup

```bash
git clone https://github.com/ckalima/pipedrive-mcp-server.git
cd pipedrive-mcp-server
npm install
cp .env.example .env
# Edit .env with your API key
```

### Build & Run

```bash
npm run build
npm run start
```

### Development Mode

```bash
npm run dev
```

### Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## API Versioning

This server uses both Pipedrive API versions, routing each call to the correct one automatically:
- **v2** (`/api/v2`): Deals, Persons, Organizations, Activities, Products, Projects, Tasks, Boards & Phases, Fields, Pipelines & Stages, and Leads search
- **v1** (`/v1`): Mail, Notes, Users, and Leads CRUD

Pipedrive is sunsetting v1. Selected v1 endpoints that have v2 equivalents reach end-of-life on 2025-12-31, with full v1 sunset expected around 2026-07-31; the v1 surfaces above (Mail, Notes, Users, Leads CRUD) have no v2 replacement yet. See `docs/v1-only-capabilities.md` for details.

## Error Handling

Errors are returned with actionable suggestions:

```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "API key is invalid or expired",
    "suggestion": "Verify your API key at Pipedrive Settings > Personal preferences > API"
  }
}
```

Common error codes:
- `MISSING_API_KEY` - Set PIPEDRIVE_API_KEY environment variable
- `INVALID_API_KEY` - Check your API key in Pipedrive settings
- `NOT_FOUND` - The requested resource doesn't exist
- `RATE_LIMITED` - Wait 60 seconds before retrying
- `VALIDATION_ERROR` - Check your request parameters

## Security

See [SECURITY.md](SECURITY.md) for the threat model (data flows, credential handling,
prompt-injection honesty, the AI/agent attack-surface catalog, operator best practices, and
known limitations) and how to report a vulnerability privately. In short: STDIO-only with no
network listener, the API token is read from the environment and never logged, destructive
operations are gated off by default, and CRM tool output is structurally labeled as
untrusted (an advisory mitigation, not a guarantee, see the residual-risk note).

For least-privilege deployment, mint the token from a dedicated, restricted Pipedrive user,
keep destructive ops disabled unless needed, and isolate the agent's context so a prompt
injection in CRM data has no exfiltration channel. See
[Operator best practices](SECURITY.md#operator-best-practices).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE)

## Links

- [Pipedrive API Documentation](https://developers.pipedrive.com/docs/api/v1)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [Security Policy](SECURITY.md)
- [Report Issues](https://github.com/ckalima/pipedrive-mcp-server/issues)
