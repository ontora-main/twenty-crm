import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineLogicFunction } from 'twenty-sdk/define';
import {
  jsonSchemaToInputSchema,
  type InputJsonSchema,
} from 'twenty-sdk/logic-function';
import { createRequest } from '@ontora/attio-twenty-sync/src/api.ts';
import { row } from '@ontora/attio-twenty-sync/src/data.ts';
import { inspectConnection } from '../connection';
import { z } from 'zod';
import { IDENTIFIERS } from '../identifiers';
import { runImport } from '../run-import';

export const handler = async (input: unknown) => {
  if (!process.env.ATTIO_API_TOKEN)
    throw new Error(
      'Configure the Attio token and expected workspace in this app first.',
    );
  const deadline = Date.now() + 780_000;
  const source = createRequest(
    'https://api.attio.com/v2',
    process.env.ATTIO_API_TOKEN,
  );
  const operation = z
    .object({ operation: z.string().optional() })
    .strict()
    .parse(input).operation;
  const identity = await inspectConnection(source);
  if (operation === 'connection') return identity;
  if (identity.workspaceId !== process.env.ATTIO_WORKSPACE_ID)
    throw new Error(
      'Configure the matching Attio workspace ID before importing.',
    );
  const target = new RestApiClient({ runAs: 'application' });
  return runImport({
    input,
    sourceRequest: async (...argumentsList) => {
      if (Date.now() >= deadline)
        throw new Error(
          'Source scan reached its time limit. No further requests will be made.',
        );
      return source(...argumentsList);
    },
    targetRequest: async (path, method = 'GET', body) => {
      if (!path.startsWith('/rest/'))
        throw new Error('Only the CRM REST API is supported.');
      if (Date.now() >= deadline)
        throw new Error(
          'Import reached its time limit. Review progress before retrying.',
        );
      try {
        return row(
          await target.request(method, path, {
            body,
            signal: AbortSignal.timeout(30_000),
          }),
        );
      } catch {
        throw new Error(
          `CRM ${method} request failed. Check permissions, connectivity and active import locks.`,
        );
      }
    },
    expectedWorkspaceId: identity.workspaceId,
    mappingJson: process.env.ATTIO_MAPPING_JSON,
  });
};

const TOOL_INPUT: InputJsonSchema = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      enum: ['connection', 'preview-setup', 'setup', 'preview', 'import'],
    },
  },
  additionalProperties: false,
};

export default defineLogicFunction({
  universalIdentifier: IDENTIFIERS.function,
  name: 'attio-import',
  description:
    'Preview or import Attio companies, people, deals, notes and tasks. First run preview-setup then setup. Preview detects conflicts; import rejects them and never deletes records. Failed runs retain an exclusive lock for operator review.',
  timeoutSeconds: 900,
  handler,
  toolTriggerSettings: { inputSchema: TOOL_INPUT },
  workflowActionTriggerSettings: {
    label: 'Import from Attio',
    inputSchema: jsonSchemaToInputSchema(TOOL_INPUT),
    outputSchema: [
      {
        type: 'object',
        properties: {
          operation: { type: 'string' },
          completed: { type: 'number' },
        },
      },
    ],
  },
});
