import { defineApplication } from 'twenty-sdk/define';
import { IDENTIFIERS } from './identifiers';

export default defineApplication({
  universalIdentifier: IDENTIFIERS.application,
  displayName: 'Attio',
  description:
    'Import companies, people, deals, notes and tasks from Attio with duplicate checks. Run a preview before importing; no source records are changed.',
  applicationVariables: {
    ATTIO_API_TOKEN: {
      universalIdentifier: IDENTIFIERS.token,
      label: 'Attio read-only API token',
      description: 'Read access to records, objects, notes, tasks and members.',
      isSecret: true,
      isRequired: true,
    },
    ATTIO_WORKSPACE_ID: {
      universalIdentifier: IDENTIFIERS.workspace,
      label: 'Attio workspace ID',
      description:
        'Expected source workspace UUID. A different workspace is rejected.',
      isSecret: false,
      isRequired: false,
    },
    ATTIO_MAPPING_JSON: {
      universalIdentifier: IDENTIFIERS.mapping,
      label: 'Explicit record and member mappings',
      description:
        'Optional JSON mappings for ambiguous matches. See the app README.',
      isSecret: true,
    },
  },
});
