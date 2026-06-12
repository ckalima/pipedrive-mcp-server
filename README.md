# Pipedrive MCP Server

An MCP (Model Context Protocol) server for Pipedrive CRM integration with Claude Code and Claude Desktop. Query, create, and update CRM data directly from your AI assistant.

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

### 3. Start Using

Once configured, Claude can access your Pipedrive data:

- "Show me open deals worth more than $10,000"
- "Create a deal called 'Acme Contract' with value $50,000"
- "Find all contacts at TechCorp"
- "List recent email threads in my inbox"
- "What custom fields are defined for deals?"

## Available Tools

### Core CRM Operations (Tier 1)

| Tool | Description |
|------|-------------|
| `pipedrive_list_deals` | List deals with filtering (owner, person, org, pipeline, stage, status) |
| `pipedrive_get_deal` | Get deal details by ID |
| `pipedrive_create_deal` | Create new deal |
| `pipedrive_update_deal` | Update existing deal |
| `pipedrive_search_deals` | Search deals by text |
| `pipedrive_list_persons` | List persons with filtering |
| `pipedrive_get_person` | Get person details |
| `pipedrive_create_person` | Create new person |
| `pipedrive_update_person` | Update existing person |
| `pipedrive_search_persons` | Search persons by name/email/phone |
| `pipedrive_list_activities` | List activities with filtering |
| `pipedrive_create_activity` | Create new activity |
| `pipedrive_update_activity` | Update/complete activity |

### Email/Mail Tools (Tier 2)

| Tool | Description |
|------|-------------|
| `pipedrive_get_person_emails` | Get mail messages for a person |
| `pipedrive_get_deal_emails` | Get mail messages for a deal |
| `pipedrive_list_mail_threads` | List mail threads by folder |
| `pipedrive_get_mail_thread` | Get thread with messages |
| `pipedrive_get_mail_message` | Get full message body |

### Field Metadata (Tier 3)

| Tool | Description |
|------|-------------|
| `pipedrive_list_organization_fields` | All org field definitions |
| `pipedrive_list_deal_fields` | All deal field definitions |
| `pipedrive_list_person_fields` | All person field definitions |
| `pipedrive_get_field` | Get field by key |

### Supporting Resources (Tier 4)

| Tool | Description |
|------|-------------|
| `pipedrive_list_organizations` | List organizations |
| `pipedrive_get_organization` | Get organization details |
| `pipedrive_create_organization` | Create organization |
| `pipedrive_search_organizations` | Search organizations |
| `pipedrive_list_pipelines` | List all pipelines |
| `pipedrive_list_stages` | List stages in pipeline |
| `pipedrive_list_users` | List users |
| `pipedrive_get_user` | Get user details |
| `pipedrive_get_current_user` | Get API key owner |

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

This server uses both Pipedrive API versions:
- **v2** (`/api/v2`): Deals, Persons, Organizations, Activities
- **v1** (`/v1`): Mail, Fields, Pipelines, Stages, Users

The client automatically routes to the correct version.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE)

## Links

- [Pipedrive API Documentation](https://developers.pipedrive.com/docs/api/v1)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [Report Issues](https://github.com/ckalima/pipedrive-mcp-server/issues)
