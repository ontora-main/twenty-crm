import { defineObject, FieldType } from 'twenty-sdk/define';
import { IDENTIFIERS } from './identifiers';

export default defineObject({
  universalIdentifier: IDENTIFIERS.runs,
  nameSingular: 'attioSyncRun',
  namePlural: 'attioSyncRuns',
  labelSingular: 'Attio sync run',
  labelPlural: 'Attio sync runs',
  icon: 'IconTerminal',
  description:
    'Import progress and an exclusive lock. Contains counts and errors, never source payloads or credentials.',
  labelIdentifierFieldMetadataUniversalIdentifier: IDENTIFIERS.runName,
  fields: [
    {
      universalIdentifier: IDENTIFIERS.runName,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Run',
    },
    {
      universalIdentifier: IDENTIFIERS.lockKey,
      type: FieldType.TEXT,
      name: 'lockKey',
      label: 'Active import lock',
      isNullable: true,
      isUnique: true,
    },
    {
      universalIdentifier: IDENTIFIERS.status,
      type: FieldType.TEXT,
      name: 'status',
      label: 'Status',
    },
    {
      universalIdentifier: IDENTIFIERS.summary,
      type: FieldType.RAW_JSON,
      name: 'summary',
      label: 'Result',
      isNullable: true,
    },
  ],
});
