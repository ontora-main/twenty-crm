import { z } from 'zod';
import {
  canonical,
  COLLECTIONS,
  domain,
  email,
  first,
  optionalText,
  row,
  rows,
  sourceId,
  stableId,
  stageValue,
  text,
  values,
  type Collection,
  type Row,
  type Snapshot,
  type Source,
} from './data.ts';

export type Action = {
  collection: string;
  id: string;
  body: Row;
  before?: Row;
};
export type Plan = {
  actions: Action[];
  conflicts: string[];
  unchanged: number;
};
export type Mapping = {
  records?: Record<string, string>;
  members?: Record<string, string>;
  primaryReferences?: Record<string, string>;
};
export const projection = (record: Row, desired: Row): Row =>
  Object.fromEntries(
    Object.keys(desired).map((key) => [
      key,
      key === 'bodyV2' && record[key]
        ? { markdown: row(record[key]).markdown ?? null }
        : (record[key] ?? null),
    ]),
  );
const sourceCollection = (collection: Collection): keyof Source =>
  collection === 'opportunities' ? 'deals' : collection;
const kind = (collection: Collection): string =>
  collection === 'notes' ? 'note' : collection === 'tasks' ? 'task' : 'record';
const recordKeys = (
  record: Row,
  collection: Collection,
  source: boolean,
): string[] => {
  if (collection === 'companies')
    return source
      ? values(record, 'domains').map((value) => domain(text(value.domain)))
      : [optionalText(row(record.domainName ?? {}).primaryLinkUrl)]
          .filter((value): value is string => Boolean(value))
          .map(domain);
  if (collection === 'people')
    return source
      ? values(record, 'email_addresses').map((value) =>
          email(text(value.email_address)),
        )
      : [
          optionalText(row(record.emails ?? {}).primaryEmail),
          ...z
            .array(z.string())
            .parse(row(record.emails ?? {}).additionalEmails ?? []),
        ]
          .filter((value): value is string => Boolean(value))
          .map(email);
  return [];
};

export const planSync = (
  source: Source,
  target: Snapshot,
  mapping: Mapping = {},
): Plan => {
  const plan: Plan = { actions: [], conflicts: [], unchanged: 0 };
  const identifiers = new Map<string, string>();
  const existing = new Map<string, Row>();
  const claimed = new Set<string>();
  const sourceKeys = new Set<string>();
  for (const collection of COLLECTIONS) {
    for (const record of rows(source[sourceCollection(collection)])) {
      const sourceIdentifier = sourceId(record, kind(collection));
      const key = `${collection}:${sourceIdentifier}`;
      const keys = recordKeys(record, collection, true);
      for (const identity of new Set(keys)) {
        const identityKey = `${collection}:${identity}`;
        if (sourceKeys.has(identityKey))
          plan.conflicts.push(
            `${key}: source shares an email/domain with another record`,
          );
        sourceKeys.add(identityKey);
      }
      const explicit = mapping.records?.[key];
      const exact = target[collection].filter(
        (candidate) => candidate.attioId === sourceIdentifier,
      );
      const candidates = explicit
        ? target[collection].filter((candidate) => candidate.id === explicit)
        : exact.length
          ? exact
          : target[collection].filter((candidate) =>
              recordKeys(candidate, collection, false).some((value) =>
                keys.includes(value),
              ),
            );
      if (candidates.length > 1 || (explicit && candidates.length !== 1)) {
        plan.conflicts.push(`${key}: ambiguous or missing target mapping`);
        continue;
      }
      const candidate = candidates[0];
      const identifier = candidate
        ? text(candidate.id)
        : stableId(source.workspaceId, collection, sourceIdentifier);
      if (
        claimed.has(identifier) ||
        (candidate?.attioId && candidate.attioId !== sourceIdentifier) ||
        (candidate?.attioSourceData &&
          row(candidate.attioSourceData).workspaceId !== source.workspaceId)
      ) {
        plan.conflicts.push(
          `${key}: target already belongs to another source record`,
        );
        continue;
      }
      if (
        !candidate &&
        target[collection].some((item) => item.id === identifier)
      ) {
        plan.conflicts.push(`${key}: deterministic ID collision`);
        continue;
      }
      // Deal names and note text are not reliable identities; require review before adoption.
      const duplicate =
        !candidate &&
        (collection === 'opportunities' ||
          collection === 'notes' ||
          collection === 'tasks') &&
        target[collection].some(
          (item) =>
            !item.attioId &&
            (collection === 'opportunities'
              ? item.name === first(record, 'name').value
              : item.title ===
                (collection === 'notes'
                  ? record.title
                  : record.content_plaintext)),
        );
      if (duplicate)
        plan.conflicts.push(
          `${key}: possible existing record; supply an explicit mapping`,
        );
      claimed.add(identifier);
      identifiers.set(key, identifier);
      if (candidate) existing.set(key, candidate);
    }
  }
  const reference = (
    collection: string,
    identifier: unknown,
  ): string | null => {
    if (identifier === undefined || identifier === null) return null;
    const resolved = identifiers.get(`${collection}:${text(identifier)}`);
    if (!resolved)
      plan.conflicts.push(
        `${collection}:${text(identifier)}: unresolved relationship`,
      );
    return resolved ?? null;
  };
  const member = (identifier: unknown): string | null => {
    if (!identifier) return null;
    const memberIdentifier = text(identifier);
    const sourceMember = source.members.find(
      (item) => sourceId(item, 'workspace_member') === memberIdentifier,
    );
    const explicit = mapping.members?.[memberIdentifier];
    const matches = target.workspaceMembers.filter((item) =>
      explicit
        ? item.id === explicit
        : sourceMember &&
          typeof item.userEmail === 'string' &&
          email(item.userEmail) === email(text(sourceMember.email_address)),
    );
    if (matches.length !== 1) {
      plan.conflicts.push(
        `member:${memberIdentifier}: missing or ambiguous workspace member`,
      );
      return null;
    }
    return text(matches[0]!.id);
  };
  const objectNames = new Map(
    source.objects.map((item) => [
      text(row(item.id).object_id),
      text(item.api_slug),
    ]),
  );
  const linkedCollection = (object: unknown): string => {
    const name = objectNames.get(text(object)) ?? text(object);
    return name === 'deals' ? 'opportunities' : name;
  };
  const append = (
    collection: string,
    identifier: string,
    body: Row,
    before?: Row,
  ) => {
    if (before && canonical(projection(before, body)) === canonical(body))
      plan.unchanged++;
    else
      plan.actions.push({
        collection,
        id: identifier,
        body,
        ...(before ? { before: projection(before, body) } : {}),
      });
  };
  for (const collection of COLLECTIONS) {
    for (const record of rows(source[sourceCollection(collection)])) {
      const sourceIdentifier = sourceId(record, kind(collection));
      const key = `${collection}:${sourceIdentifier}`;
      const identifier = identifiers.get(key);
      if (!identifier) continue;
      const before = existing.get(key);
      const body: Row = {
        attioId: sourceIdentifier,
        attioSourceData: { workspaceId: source.workspaceId, record },
      };
      const links: { collection: string; id: unknown }[] = [];
      if (collection === 'companies') {
        body.name = text(first(record, 'name').value);
        const domains = values(record, 'domains').map((value) =>
          text(value.domain),
        );
        if (domains.length)
          body.domainName = {
            primaryLinkUrl: `https://${domain(domains[0]!)}`,
            primaryLinkLabel: domains[0],
            secondaryLinks: domains.slice(1).map((value) => ({
              url: `https://${domain(value)}`,
              label: value,
            })),
          };
      } else if (collection === 'people') {
        const name = first(record, 'name');
        body.name = {
          firstName: optionalText(name.first_name) ?? '',
          lastName: optionalText(name.last_name) ?? '',
        };
        const addresses = values(record, 'email_addresses').map((value) =>
          email(text(value.email_address)),
        );
        if (addresses.length)
          body.emails = {
            primaryEmail: addresses[0],
            additionalEmails: addresses.slice(1),
          };
        if (first(record, 'job_title').value !== undefined)
          body.jobTitle = text(first(record, 'job_title').value);
        const companies = values(record, 'company');
        if (companies.length > 1)
          plan.conflicts.push(
            `${key}: multiple companies require a mapping policy`,
          );
        body.companyId = reference('companies', companies[0]?.target_record_id);
      } else if (collection === 'opportunities') {
        body.name = text(first(record, 'name').value);
        const stage = first(record, 'stage').status;
        if (stage) body.stage = stageValue(sourceId(row(stage), 'status'));
        else plan.conflicts.push(`${key}: missing deal stage`);
        const amount = first(record, 'value');
        if (amount.currency_value !== undefined) {
          const micros = Math.round(
            z.number().parse(amount.currency_value) * 1_000_000,
          );
          if (!Number.isSafeInteger(micros))
            plan.conflicts.push(`${key}: unsafe currency amount`);
          body.amount = {
            amountMicros: micros,
            currencyCode: text(amount.currency_code),
          };
        }
        body.ownerId = member(first(record, 'owner').referenced_actor_id);
        body.companyId = reference(
          'companies',
          first(record, 'associated_company').target_record_id,
        );
        const people = values(record, 'associated_people');
        const primary = mapping.primaryReferences?.[key];
        if (
          (people.length > 1 && !primary) ||
          (primary &&
            !people.some((person) => person.target_record_id === primary))
        )
          plan.conflicts.push(
            `${key}: select one associated contact in primaryReferences`,
          );
        body.pointOfContactId = reference(
          'people',
          primary ?? people[0]?.target_record_id,
        );
      } else if (collection === 'notes') {
        body.title = text(record.title);
        body.bodyV2 = {
          markdown:
            optionalText(record.content_markdown) ??
            text(record.content_plaintext),
        };
        links.push({
          collection: linkedCollection(record.parent_object),
          id: record.parent_record_id,
        });
      } else {
        body.title = text(record.content_plaintext).slice(0, 255);
        body.bodyV2 = { markdown: text(record.content_plaintext) };
        body.status = z.boolean().parse(record.is_completed) ? 'DONE' : 'TODO';
        body.dueAt = record.deadline_at
          ? new Date(text(record.deadline_at)).toISOString()
          : null;
        const assignees = rows(record.assignees ?? []);
        const primary = mapping.primaryReferences?.[key];
        if (
          (assignees.length > 1 && !primary) ||
          (primary &&
            !assignees.some(
              (assignee) => assignee.referenced_actor_id === primary,
            ))
        )
          plan.conflicts.push(
            `${key}: select one assignee in primaryReferences`,
          );
        body.assigneeId = member(primary ?? assignees[0]?.referenced_actor_id);
        for (const link of rows(record.linked_records ?? []))
          links.push({
            collection: linkedCollection(link.target_object_id),
            id: link.target_record_id,
          });
      }
      append(collection, identifier, body, before);
      for (const link of links) {
        const targetIdentifier = reference(link.collection, link.id);
        const targetField = {
          companies: 'targetCompanyId',
          people: 'targetPersonId',
          opportunities: 'targetOpportunityId',
        }[link.collection];
        if (!targetField || !targetIdentifier) {
          plan.conflicts.push(`${key}: unsupported note/task relationship`);
          continue;
        }
        const relationCollection =
          collection === 'notes' ? 'noteTargets' : 'taskTargets';
        const relationField = collection === 'notes' ? 'noteId' : 'taskId';
        const present = target[relationCollection].find(
          (item) =>
            item[relationField] === identifier &&
            item[targetField] === targetIdentifier,
        );
        if (!present)
          append(
            relationCollection,
            stableId(identifier, targetField, targetIdentifier),
            { [relationField]: identifier, [targetField]: targetIdentifier },
          );
      }
    }
  }
  return plan;
};
