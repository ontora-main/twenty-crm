import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ROW_SCHEMA = z.record(z.string(), z.unknown());
export type Row = z.infer<typeof ROW_SCHEMA>;
export const COLLECTIONS = [
  'companies',
  'people',
  'opportunities',
  'notes',
  'tasks',
] as const;
export type Collection = (typeof COLLECTIONS)[number];
export type Snapshot = Record<Collection, Row[]> & {
  workspaceMembers: Row[];
  noteTargets: Row[];
  taskTargets: Row[];
};
export type Source = {
  workspaceId: string;
  companies: Row[];
  people: Row[];
  deals: Row[];
  notes: Row[];
  tasks: Row[];
  members: Row[];
  objects: Row[];
  stages: Row[];
};
export const rows = (value: unknown): Row[] => z.array(ROW_SCHEMA).parse(value);
export const row = (value: unknown): Row => ROW_SCHEMA.parse(value);
export const text = (value: unknown): string => z.string().parse(value);
export const optionalText = (value: unknown): string | undefined =>
  z.string().nullish().parse(value) ?? undefined;
export const values = (record: Row, field: string): Row[] =>
  rows(row(record.values)[field] ?? []);
export const first = (record: Row, field: string): Row =>
  values(record, field)[0] ?? {};
export const sourceId = (record: Row, kind = 'record'): string =>
  z.uuid().parse(row(record.id)[`${kind}_id`]);
export const stableId = (...parts: string[]): string => {
  const hash = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
export const canonical = (value: unknown): string =>
  JSON.stringify(normalize(value));
const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  const parsed = ROW_SCHEMA.safeParse(value);
  if (!parsed.success) return value;
  return Object.fromEntries(
    Object.entries(parsed.data)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalize(entry)]),
  );
};
export const domain = (value: string): string => {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  return url.hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
};
export const email = (value: string): string => value.trim().toLowerCase();
export const stageValue = (id: string): string =>
  `ATTIO_${z.uuid().parse(id).replaceAll('-', '').toUpperCase()}`;
