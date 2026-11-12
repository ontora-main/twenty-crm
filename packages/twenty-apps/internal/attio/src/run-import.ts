import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  readSource,
  readTarget,
  type Request,
} from '@ontora/attio-twenty-sync/src/api.ts';
import { applyPlan } from '@ontora/attio-twenty-sync/src/apply.ts';
import { canonical } from '@ontora/attio-twenty-sync/src/data.ts';
import { planSync } from '@ontora/attio-twenty-sync/src/planner.ts';
import { planSchema } from '@ontora/attio-twenty-sync/src/schema.ts';

export const INPUT_SCHEMA = z
  .object({
    operation: z
      .enum(['preview-setup', 'setup', 'preview', 'import'])
      .default('preview'),
  })
  .strict();
export const MAPPING_SCHEMA = z
  .object({
    records: z.record(z.string(), z.uuid()).optional(),
    members: z.record(z.uuid(), z.uuid()).optional(),
    primaryReferences: z.record(z.string(), z.uuid()).optional(),
  })
  .strict();

export const runImport = async ({
  input,
  sourceRequest,
  targetRequest,
  expectedWorkspaceId,
  mappingJson,
}: {
  input: unknown;
  sourceRequest: Request;
  targetRequest: Request;
  expectedWorkspaceId: string;
  mappingJson?: string;
}) => {
  const { operation } = INPUT_SCHEMA.parse(input);
  const workspaceId = z.uuid().parse(expectedWorkspaceId);
  const mapping = MAPPING_SCHEMA.parse(
    mappingJson ? JSON.parse(mappingJson) : {},
  );
  const writes = operation === 'setup' || operation === 'import';
  const runId = randomUUID();
  let completed = 0;
  const source = await readSource(sourceRequest);
  if (source.workspaceId !== workspaceId)
    throw new Error('Attio workspace does not match configuration.');
  if (writes) {
    // The unique key serializes imports across workers; a killed run stays locked for review.
    await targetRequest('/rest/attioSyncRuns', 'POST', {
      id: runId,
      name: `Attio ${operation} ${new Date().toISOString()}`,
      lockKey: 'attio-import',
      status: 'running',
      summary: { completed: 0 },
    });
  }
  try {
    const schema = await planSchema(targetRequest, source);
    if (operation === 'preview-setup' || operation === 'setup') {
      if (operation === 'setup') {
        for (const action of schema) {
          await targetRequest(action.path, action.method, action.body);
          completed++;
        }
      }
      const result = {
        operation,
        schemaChanges: schema.length,
        ...(operation === 'preview-setup' ? { changes: schema } : {}),
        completed,
      };
      if (writes)
        await targetRequest(`/rest/attioSyncRuns/${runId}`, 'PATCH', {
          lockKey: null,
          status: 'succeeded',
          summary: result,
        });
      return result;
    }
    if (schema.length)
      throw new Error(
        'Schema setup required. Run preview-setup, then setup before importing.',
      );
    const target = await readTarget(targetRequest);
    const plan = planSync(source, target, mapping);
    if (operation === 'preview')
      return {
        operation,
        creates: plan.actions.filter((action) => !action.before).length,
        updates: plan.actions.filter((action) => action.before).length,
        unchanged: plan.unchanged,
        conflicts: plan.conflicts,
      };
    if (plan.conflicts.length)
      throw new Error(
        `${plan.conflicts.length} conflicts block import. Run preview and resolve the mappings first.`,
      );
    const latest = await readTarget(targetRequest);
    if (canonical(planSync(source, latest, mapping)) !== canonical(plan))
      throw new Error('Target changed after planning. Run preview again.');
    await applyPlan(targetRequest, plan, latest, async () => {
      completed++;
      await targetRequest(`/rest/attioSyncRuns/${runId}`, 'PATCH', {
        summary: { completed },
      });
    });
    const result = { operation, completed, unchanged: plan.unchanged };
    await targetRequest(`/rest/attioSyncRuns/${runId}`, 'PATCH', {
      lockKey: null,
      status: 'succeeded',
      summary: result,
    });
    return result;
  } catch (error) {
    if (writes) {
      // Keep the lock after an ambiguous failure until an operator reviews the partial run.
      await targetRequest(`/rest/attioSyncRuns/${runId}`, 'PATCH', {
        status: 'needs-review',
        summary: {
          completed,
          instruction:
            'Review this partial run before clearing its lockKey and retrying.',
        },
      }).catch(() => undefined);
    }
    throw error;
  }
};
