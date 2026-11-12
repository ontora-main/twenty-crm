import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runImport } from './run-import.ts';
import {
  COLLECTIONS,
  stableId,
  type Row,
} from '../../../../twenty-utils/attio-sync/src/data.ts';
import { type Request } from '../../../../twenty-utils/attio-sync/src/api.ts';

const workspaceId = stableId('test-workspace');
const makeFixture = () => {
  const writes: { path: string; body?: Row }[] = [];
  const company = {
    id: { workspace_id: workspaceId, record_id: stableId('source-company') },
    values: {
      name: [{ value: 'Example' }],
      domains: [{ domain: 'example.test' }],
    },
  };
  const records: Row[] = [];
  let locked = false;
  const sourceRequest: Request = async (path) => ({
    data: path === '/objects/companies/records/query' ? [company] : [],
  });
  const objects = COLLECTIONS.map((namePlural) => ({
    id: stableId(namePlural),
    namePlural,
  }));
  const fields = objects.flatMap((object) => [
    {
      objectMetadataId: object.id,
      name: 'attioId',
      type: 'TEXT',
      isUnique: true,
    },
    { objectMetadataId: object.id, name: 'attioSourceData', type: 'RAW_JSON' },
    ...(object.namePlural === 'opportunities'
      ? [
          {
            objectMetadataId: object.id,
            name: 'stage',
            type: 'SELECT',
            options: [],
          },
        ]
      : []),
  ]);
  const targetRequest: Request = async (path, method = 'GET', body) => {
    if (method !== 'GET') {
      if (path === '/rest/attioSyncRuns') {
        if (locked) throw new Error('unique lock conflict');
        locked = true;
      }
      if (path.startsWith('/rest/attioSyncRuns/') && body?.lockKey === null)
        locked = false;
      writes.push({ path, body });
      if (path === '/rest/companies' && body) records.push(body);
      return {};
    }
    const data = path.startsWith('/rest/metadata/objects?')
      ? objects
      : path.startsWith('/rest/metadata/fields?')
        ? fields
        : path.startsWith('/rest/companies?')
          ? records
          : [];
    return { data, pageInfo: { hasNextPage: false } };
  };
  return {
    writes,
    sourceRequest,
    targetRequest,
    records,
    expectedWorkspaceId: workspaceId,
    isLocked: () => locked,
  };
};

test('preview reads source and target without a lock or CRM writes', async () => {
  const fixture = makeFixture();
  const result = await runImport({
    ...fixture,
    input: { operation: 'preview' },
  });
  assert.equal('creates' in result && result.creates, 1);
  assert.deepEqual(fixture.writes, []);
});

test('wrong source workspace aborts before every CRM write', async () => {
  const fixture = makeFixture();
  await assert.rejects(
    runImport({
      ...fixture,
      expectedWorkspaceId: stableId('other'),
      input: { operation: 'import' },
    }),
    /workspace does not match/,
  );
  assert.deepEqual(fixture.writes, []);
});

test('successful import records progress, releases lock and rerun does not duplicate', async () => {
  const fixture = makeFixture();
  await runImport({ ...fixture, input: { operation: 'import' } });
  assert.equal(fixture.records.length, 1);
  assert.equal(fixture.isLocked(), false);
  const second = await runImport({
    ...fixture,
    input: { operation: 'import' },
  });
  assert.equal('completed' in second && second.completed, 0);
  assert.equal(fixture.records.length, 1);
});

test('ambiguous write failure retains a reviewable lock and blocks a second import', async () => {
  const fixture = makeFixture();
  const failing: Request = async (path, method, body) => {
    if (path === '/rest/companies' && method === 'POST')
      throw new Error('network loss');
    return fixture.targetRequest(path, method, body);
  };
  await assert.rejects(
    runImport({
      ...fixture,
      targetRequest: failing,
      input: { operation: 'import' },
    }),
    /network loss/,
  );
  assert.equal(fixture.isLocked(), true);
  assert.equal(fixture.writes.at(-1)?.body?.status, 'needs-review');
  await assert.rejects(
    runImport({ ...fixture, input: { operation: 'import' } }),
    /unique lock/,
  );
});

test('unknown operations and malformed mappings never contact providers', async () => {
  const fixture = makeFixture();
  let calls = 0;
  const sourceRequest: Request = async () => {
    calls++;
    return {};
  };
  await assert.rejects(
    runImport({ ...fixture, sourceRequest, input: { operation: 'delete' } }),
  );
  await assert.rejects(
    runImport({
      ...fixture,
      sourceRequest,
      input: {},
      mappingJson: '{"unexpected":true}',
    }),
  );
  assert.equal(calls, 0);
});
