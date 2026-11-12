# Personal Agent Proxy for Twenty

This app registers `https://proxy.ontora.com/mcp` as an external MCP server so
Twenty AI chat can call the tools granted to its Personal Agent Proxy agent.
The connection is workspace-scoped. Limit it to the `Twenty CRM` agent in Proxy
and enable only the approved read tools for the Company Brain connection.
The Twenty instance must be on version 2.56 or later and have the
`IS_MCP_SERVERS_ENABLED` feature flag enabled for those tools to appear in AI
chat.

## OAuth setup

Twenty requires OAuth client credentials on the app registration. Register a
confidential client in Personal Agent Proxy using the callback URL for this
Twenty instance:

```json
{
  "client_name": "Twenty CRM",
  "redirect_uris": ["https://crm.ontora.com/auth/apps/callback"],
  "token_endpoint_auth_method": "client_secret_post",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"]
}
```

Send that JSON as a POST to `https://proxy.ontora.com/oauth/register` with a
`Content-Type: application/json` header. Store the returned `client_id` and
`client_secret` in the app registration variables `PROXY_OAUTH_CLIENT_ID` and
`PROXY_OAUTH_CLIENT_SECRET`; never put either value in this repository.

Install and sync the app with the Twenty CLI, then connect **Personal Agent
Proxy** from the workspace connection settings. During Proxy consent, select
the `Twenty CRM` agent. Proxy keeps its per-tool permissions and activity log;
the app requests only the `mcp` scope. The Company Brain connection currently
has read-only tools, so this app does not enable CRM-to-Brain write-back.
