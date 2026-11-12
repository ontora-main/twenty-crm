import {
  defineHealthCheck,
  type ApplicationHealthCheckResult,
} from 'twenty-sdk/define';
import { createRequest } from '@ontora/attio-twenty-sync/src/api.ts';
import { inspectConnection } from '../connection';
import { IDENTIFIERS } from '../identifiers';

export const handler = async (): Promise<ApplicationHealthCheckResult> => {
  if (!process.env.ATTIO_API_TOKEN)
    return {
      status: 'WARNING',
      title: 'Attio token required',
      description: 'Add a read-only Attio token in Variables.',
    };
  try {
    const identity = await inspectConnection(
      createRequest('https://api.attio.com/v2', process.env.ATTIO_API_TOKEN),
    );
    if (identity.workspaceId !== process.env.ATTIO_WORKSPACE_ID)
      return {
        status: 'WARNING',
        title: 'Confirm the source workspace',
        description: `Expected workspace ID must be ${identity.workspaceId} for this token. Set it in Variables before importing.`,
      };
    return {
      status: 'WARNING',
      title: 'Connected; import runs on demand',
      description:
        'The token and workspace match. Run a preview, then import. Connection health does not establish that data has been imported.',
    };
  } catch {
    return {
      status: 'ERROR',
      title: 'Attio connection could not be verified',
      description:
        'Check the token, its read permissions and Attio availability.',
    };
  }
};

export default defineHealthCheck({
  universalIdentifier: IDENTIFIERS.health,
  name: 'attio-connection-health',
  description:
    'Checks source authentication and workspace identity without reading CRM records.',
  timeoutSeconds: 60,
  handler,
});
