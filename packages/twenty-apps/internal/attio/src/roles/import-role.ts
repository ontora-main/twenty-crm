import {
  defineApplicationRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  SystemPermissionFlag,
} from 'twenty-sdk/define';
import { IDENTIFIERS } from '../identifiers';

export default defineApplicationRole({
  universalIdentifier: IDENTIFIERS.role,
  label: 'Attio importer',
  description:
    'Imports CRM records and relationships. Schema setup adds Attio identifiers and preserves source stages. Cannot delete records.',
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    ...[
      'company',
      'person',
      'opportunity',
      'note',
      'task',
      'noteTarget',
      'taskTarget',
      'workspaceMember',
    ].map((name) => ({
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS[
          name as keyof typeof STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS
        ].universalIdentifier,
      canReadObjectRecords: true,
      canUpdateObjectRecords: name !== 'workspaceMember',
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    })),
    {
      objectUniversalIdentifier: IDENTIFIERS.runs,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    },
  ],
  fieldPermissions: [],
  permissionFlagUniversalIdentifiers: [SystemPermissionFlag.DATA_MODEL],
});
