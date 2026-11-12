import { defineApplication } from 'twenty-sdk/define';

export const APPLICATION_UNIVERSAL_IDENTIFIER =
  'cf45b8d7-7bd4-4e57-9d15-8a405f427e62';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Personal Agent Proxy',
  description:
    'Connect Twenty AI chat to approved tools through Ontora Personal Agent Proxy.',
  serverVariables: {
    PROXY_OAUTH_CLIENT_ID: {
      description:
        'OAuth client ID registered in Personal Agent Proxy for the Twenty callback URL.',
      isSecret: false,
      isRequired: true,
    },
    PROXY_OAUTH_CLIENT_SECRET: {
      description:
        'OAuth client secret registered in Personal Agent Proxy. Stored encrypted by Twenty.',
      isSecret: true,
      isRequired: true,
    },
  },
});
