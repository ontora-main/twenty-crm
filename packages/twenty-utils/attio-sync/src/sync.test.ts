import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPlan } from './apply.ts';
import { attioPages, twentyPages, type Request } from './api.ts';
import { planSync } from './planner.ts';
import { planSchema } from './schema.ts';
import {
  COLLECTIONS,
  stableId,
  type Row,
  type Snapshot,
  type Source,
} from './data.ts';
const id = (name: string) => stableId(name);
const record = (name: string, values: Row, kind = 'record'): Row => ({
  id: { workspace_id: id('workspace'), [`${kind}_id`]: id(name) },
  values,
  created_at: '2026-01-01T00:00:00Z',
});
const fixture = (): { source: Source; target: Snapshot } => ({
  source: {
    workspaceId: id('workspace'),
    objects: [],
    stages: [{ id: { status_id: id('stage') }, title: 'Won' }],
    members: [
      {
        id: { workspace_member_id: id('owner') },
        email_address: 'owner@example.com',
      },
    ],
    companies: [
      record('company', {
        name: [{ value: 'Acme' }],
        domains: [{ domain: 'acme.example' }],
      }),
    ],
    people: [
      record('person', {
        name: [{ first_name: 'Jane', last_name: 'Doe' }],
        email_addresses: [{ email_address: 'jane@acme.example' }],
        company: [{ target_record_id: id('company') }],
      }),
    ],
    deals: [
      record('deal', {
        name: [{ value: 'Pilot' }],
        stage: [{ status: { id: { status_id: id('stage') } } }],
        value: [{ currency_value: 123.45, currency_code: 'EUR' }],
        owner: [{ referenced_actor_id: id('owner') }],
        associated_company: [{ target_record_id: id('company') }],
        associated_people: [{ target_record_id: id('person') }],
      }),
    ],
    notes: [
      {
        ...record('note', {}, 'note'),
        title: 'Meeting',
        content_markdown: 'Next steps',
        parent_object: 'people',
        parent_record_id: id('person'),
      },
    ],
    tasks: [
      {
        ...record('task', {}, 'task'),
        content_plaintext: 'Follow up',
        is_completed: true,
        deadline_at: '2026-01-02',
        assignees: [{ referenced_actor_id: id('owner') }],
        linked_records: [
          { target_object_id: 'deals', target_record_id: id('deal') },
        ],
      },
    ],
  },
  target: {
    companies: [],
    people: [],
    opportunities: [],
    notes: [],
    tasks: [],
    noteTargets: [],
    taskTargets: [],
    workspaceMembers: [
      { id: id('twenty-owner'), userEmail: 'OWNER@example.com' },
    ],
  },
});
test('imports all five objects with relationships, then reruns without writes', async () => {
  const { source, target } = fixture();
  const plan = planSync(source, target);
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.actions.length, 7);
  const request: Request = async (path, method, body) => {
    assert.equal(method, 'POST');
    const collection = path.split('/')[2] as keyof Snapshot;
    target[collection].push({
      ...body,
      ...(body?.bodyV2
        ? { bodyV2: { ...(body.bodyV2 as Row), blocknote: null } }
        : {}),
    });
    return { data: body };
  };
  await applyPlan(request, plan, target, async () => {});
  assert.equal(target.tasks[0]?.status, 'DONE');
  assert.equal(target.opportunities[0]?.ownerId, id('twenty-owner'));
  assert.equal(
    (target.opportunities[0]?.amount as Row).amountMicros,
    123450000,
  );
  assert.equal(target.noteTargets[0]?.targetPersonId, target.people[0]?.id);
  assert.equal(planSync(source, target).actions.length, 0);
});
test('adopts exact domain/email matches and blocks ambiguous or claimed matches', () => {
  const { source, target } = fixture();
  target.companies.push({
    id: id('existing'),
    domainName: { primaryLinkUrl: 'https://www.acme.example/' },
  });
  const plan = planSync(source, target);
  assert.equal(plan.actions[0]?.id, id('existing'));
  assert.ok(plan.actions[0]?.before);
  target.companies.push({
    id: id('duplicate'),
    domainName: { primaryLinkUrl: 'https://acme.example' },
  });
  assert.ok(planSync(source, target).conflicts.length);
  target.companies.pop();
  target.companies[0]!.attioId = id('other');
  assert.ok(planSync(source, target).conflicts.length);
});
test('unresolved members, relationships and multiple assignees block all writes', async () => {
  const { source, target } = fixture();
  target.workspaceMembers = [];
  const plan = planSync(source, target);
  let writes = 0;
  await assert.rejects(
    applyPlan(
      async () => {
        writes++;
        return {};
      },
      plan,
      target,
      async () => {},
    ),
    /conflicts/,
  );
  assert.equal(writes, 0);
});
test('rejects cross-workspace adoption and target drift before writing', async () => {
  const { source, target } = fixture();
  target.companies.push({
    id: id('existing'),
    attioId: id('company'),
    attioSourceData: { workspaceId: id('other') },
  });
  assert.ok(planSync(source, target).conflicts.length);
  target.companies = [
    { id: id('existing'), attioId: id('company'), name: 'Before' },
  ];
  const plan = planSync(source, target);
  target.companies[0]!.name = 'Concurrent edit';
  await assert.rejects(
    applyPlan(
      async () => {
        throw new Error('Unexpected write');
      },
      plan,
      target,
      async () => {},
    ),
    /changed since planning/,
  );
});
test('partial import can be resumed without recreating completed records', async () => {
  const { source, target } = fixture();
  let calls = 0;
  await assert.rejects(
    applyPlan(
      async (_path, _method, body) => {
        if (++calls === 2) throw new Error('Connection lost');
        target.companies.push({ ...body });
        return { data: body };
      },
      planSync(source, target),
      target,
      async () => {},
    ),
    /Connection lost/,
  );
  const resumed = planSync(source, target);
  assert.equal(
    resumed.actions.filter((action) => action.collection === 'companies')
      .length,
    0,
  );
  assert.equal(resumed.actions.length, 6);
});
test('source deletions never generate deletion actions', () => {
  const { source, target } = fixture();
  target.companies.push({ id: id('orphan'), attioId: id('deleted') });
  assert.ok(
    !planSync(source, target).actions.some(
      (action) => action.id === id('orphan'),
    ),
  );
});
test('pagination follows offsets and cursors and rejects stuck cursors', async () => {
  const offsets: unknown[] = [];
  const records = await attioPages(
    async (_path, _method, body) => {
      offsets.push(body?.offset);
      return {
        data:
          body?.offset === 0 ? Array.from({ length: 100 }, () => ({})) : [{}],
      };
    },
    '/query',
    true,
  );
  assert.equal(records.length, 101);
  assert.deepEqual(offsets, [0, 100]);
  await assert.rejects(
    twentyPages(
      async () => ({
        data: { people: [] },
        pageInfo: { hasNextPage: true, endCursor: 'same' },
      }),
      '/people',
      'people',
    ),
    /repeated/,
  );
});
test('schema setup preserves existing stages and requests unique Attio IDs', async () => {
  const { source } = fixture();
  const objects = COLLECTIONS.map((namePlural) => ({
    id: id(namePlural),
    namePlural,
  }));
  const option = {
    id: id('original'),
    value: 'NEW',
    label: 'New',
    color: 'blue',
    position: 0,
  };
  const actions = await planSchema(
    async (path) => ({
      data: path.includes('/objects')
        ? objects
        : [
            {
              id: id('stage-field'),
              objectMetadataId: id('opportunities'),
              name: 'stage',
              type: 'SELECT',
              options: [option],
            },
          ],
      pageInfo: { hasNextPage: false },
    }),
    source,
  );
  assert.equal(
    actions.filter(
      (action) =>
        action.body.name === 'attioId' && action.body.isUnique === true,
    ).length,
    5,
  );
  assert.deepEqual(
    (
      actions.find((action) => action.method === 'PATCH')?.body.options as Row[]
    )[0],
    option,
  );
});

test('requires an explicit primary for multiple assignees and validates its membership', () => {
  const { source, target } = fixture();
  source.tasks[0]!.assignees = [
    { referenced_actor_id: id('owner') },
    { referenced_actor_id: id('other-owner') },
  ];
  assert.ok(planSync(source, target).conflicts.length);
  assert.deepEqual(
    planSync(source, target, {
      primaryReferences: { [`tasks:${id('task')}`]: id('owner') },
    }).conflicts,
    [],
  );
  assert.ok(
    planSync(source, target, {
      primaryReferences: { [`tasks:${id('task')}`]: id('stranger') },
    }).conflicts.length,
  );
});

test('blocks duplicate identities within the source before creating new records', () => {
  const { source, target } = fixture();
  source.companies.push(
    record('duplicate-company', {
      name: [{ value: 'Duplicate' }],
      domains: [{ domain: 'www.acme.example' }],
    }),
  );
  assert.ok(
    planSync(source, target).conflicts.some((message) =>
      message.includes('source shares'),
    ),
  );
});
