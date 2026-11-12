import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectConnection } from './connection.ts';

test('connection status returns only workspace identity, never token metadata', async () => {
  const result = await inspectConnection(async (path) => {
    assert.equal(path, '/self');
    return {
      active: true,
      workspace_id: '00000000-0000-4000-8000-000000000001',
      workspace_name: 'Synthetic',
      client_id: 'private-metadata',
    };
  });
  assert.deepEqual(Object.keys(result).sort(), [
    'workspaceId',
    'workspaceName',
    'workspaceSlug',
  ]);
});

test('revoked tokens and missing workspace identifiers are rejected', async () => {
  await assert.rejects(
    inspectConnection(async () => ({ active: false })),
    /inactive/,
  );
  await assert.rejects(
    inspectConnection(async () => ({ active: true })),
    /workspace identity/,
  );
});
