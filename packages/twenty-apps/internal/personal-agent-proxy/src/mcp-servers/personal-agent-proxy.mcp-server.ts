import { defineMcpServer } from 'twenty-sdk/define';

import {
  PROXY_CONNECTION_PROVIDER_UNIVERSAL_IDENTIFIER,
  PROXY_MCP_SERVER_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineMcpServer({
  universalIdentifier: PROXY_MCP_SERVER_UNIVERSAL_IDENTIFIER,
  name: 'personal_agent_proxy',
  label: 'Personal Agent Proxy',
  url: 'https://proxy.ontora.com/mcp',
  connectionProvider: {
    universalIdentifier: PROXY_CONNECTION_PROVIDER_UNIVERSAL_IDENTIFIER,
  },
});
