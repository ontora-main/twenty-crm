import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
  row,
  rows,
  text,
  type Row,
  type Source,
  type Snapshot,
  COLLECTIONS,
  sourceId,
} from './data.ts';

export type Request = (
  path: string,
  method?: 'GET' | 'POST' | 'PATCH',
  body?: Row,
) => Promise<Row>;
export const createRequest = (
  base: string,
  token: string,
  minimumInterval = 650,
): Request => {
  const origin = new URL(base);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      'The API base must be an HTTPS URL without credentials or query parameters.',
    );
  }
  let previousRequest = 0;
  return async (path, method = 'GET', body) => {
    const address = new URL(
      `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`,
    );
    if (address.origin !== origin.origin)
      throw new Error('Cross-origin API request refused.');
    for (let attempt = 0; attempt < 5; attempt++) {
      await delay(
        Math.max(0, minimumInterval - (Date.now() - previousRequest)),
      );
      previousRequest = Date.now();
      const response = await fetch(address, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // Retrying an ambiguous write could create a duplicate; rerun after reconciling instead.
      if (
        (response.status === 429 ||
          (method === 'GET' && response.status >= 500)) &&
        attempt < 4
      ) {
        const retry = response.headers.get('retry-after');
        const seconds = retry === null ? NaN : Number(retry);
        const wait = Number.isFinite(seconds)
          ? seconds * 1000
          : Math.max(0, Date.parse(retry ?? '') - Date.now());
        await response.body?.cancel();
        if (wait > 60_000)
          throw new Error(
            'API requested a long rate-limit pause. Retry this run later.',
          );
        await delay(
          Number.isFinite(wait) && wait > 0 ? wait : 1000 * 2 ** attempt,
        );
        continue;
      }
      if (!response.ok)
        throw new Error(
          `API ${method} ${address.pathname}: HTTP ${response.status}. No response body logged.`,
        );
      return row(await response.json());
    }
    throw new Error('API retry limit reached.');
  };
};

export const attioPages = async (
  request: Request,
  path: string,
  queryRecords = false,
): Promise<Row[]> => {
  const result: Row[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = queryRecords
      ? await request(path, 'POST', {
          limit: 100,
          offset,
          sorts: [{ attribute: 'created_at', direction: 'asc' }],
        })
      : await request(`${path}?limit=100&offset=${offset}`);
    const page = rows(response.data);
    result.push(...page);
    if (page.length < 100) return result;
    if (offset > 1_000_000)
      throw new Error('Attio pagination exceeded safety bound.');
  }
};

export const twentyPages = async (
  request: Request,
  path: string,
  collection: string,
): Promise<Row[]> => {
  const result: Row[] = [];
  const cursors = new Set<string>();
  let cursor = '';
  for (;;) {
    const response = await request(
      `${path}?limit=100&depth=0${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`,
    );
    result.push(
      ...rows(
        Array.isArray(response.data)
          ? response.data
          : row(response.data)[collection],
      ),
    );
    const info = row(response.pageInfo);
    if (!z.boolean().parse(info.hasNextPage)) return result;
    cursor = text(info.endCursor);
    if (!cursor || cursors.has(cursor))
      throw new Error('Twenty returned a repeated pagination cursor.');
    cursors.add(cursor);
  }
};

export const readSource = async (request: Request): Promise<Source> => {
  const source: Source = {
    workspaceId: '',
    companies: [],
    people: [],
    deals: [],
    notes: [],
    tasks: [],
    members: rows((await request('/workspace_members')).data),
    objects: rows((await request('/objects')).data),
    stages: rows(
      (await request('/objects/deals/attributes/stage/statuses')).data,
    ),
  };
  for (const collection of ['companies', 'people', 'deals'] as const) {
    source[collection] = await attioPages(
      request,
      `/objects/${collection}/records/query`,
      true,
    );
  }
  source.notes = await attioPages(request, '/notes');
  source.tasks = await attioPages(request, '/tasks');
  const workspaceIds = new Set<string>();
  for (const [collection, kind] of [
    ['companies', 'record'],
    ['people', 'record'],
    ['deals', 'record'],
    ['notes', 'note'],
    ['tasks', 'task'],
  ] as const) {
    const identifiers = new Set<string>();
    for (const record of source[collection]) {
      const id = sourceId(record, kind);
      if (identifiers.has(id))
        throw new Error(
          `Attio pagination returned a duplicate ${collection} ID; rerun with source edits paused.`,
        );
      identifiers.add(id);
      workspaceIds.add(text(row(record.id).workspace_id));
    }
  }
  if (workspaceIds.size !== 1)
    throw new Error('Expected records from exactly one Attio workspace.');
  source.workspaceId = [...workspaceIds][0]!;
  return source;
};

export const readTarget = async (request: Request): Promise<Snapshot> => {
  const snapshot: Snapshot = {
    companies: [],
    people: [],
    opportunities: [],
    notes: [],
    tasks: [],
    workspaceMembers: [],
    noteTargets: [],
    taskTargets: [],
  };
  for (const collection of [
    ...COLLECTIONS,
    'workspaceMembers',
    'noteTargets',
    'taskTargets',
  ] as const) {
    snapshot[collection] = await twentyPages(
      request,
      `/rest/${collection}`,
      collection,
    );
  }
  return snapshot;
};
