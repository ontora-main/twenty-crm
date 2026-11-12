import { defineConnectionProvider } from 'twenty-sdk/define';

import { PROXY_CONNECTION_PROVIDER_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineConnectionProvider({
  universalIdentifier: PROXY_CONNECTION_PROVIDER_UNIVERSAL_IDENTIFIER,
  name: 'personal_agent_proxy',
  displayName: 'Personal Agent Proxy',
  scope: 'WORKSPACE',
  type: 'oauth',
  oauth: {
    authorizationEndpoint: 'https://proxy.ontora.com/oauth/authorize',
    tokenEndpoint: 'https://proxy.ontora.com/oauth/token',
    scopes: ['mcp'],
    authorizationParams: {
      resource: 'https://proxy.ontora.com/mcp',
    },
    clientIdVariable: 'PROXY_OAUTH_CLIENT_ID',
    clientSecretVariable: 'PROXY_OAUTH_CLIENT_SECRET',
    tokenRequestContentType: 'form-urlencoded',
    usePkce: true,
  },
});
