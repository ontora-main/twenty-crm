import { defineView } from 'twenty-sdk/define';
import { IDENTIFIERS } from './identifiers';

export default defineView({
  universalIdentifier: IDENTIFIERS.view,
  name: 'Attio sync runs',
  objectUniversalIdentifier: IDENTIFIERS.runs,
  icon: 'IconTerminal',
  position: 0,
  fields: [
    {
      universalIdentifier: IDENTIFIERS.nameColumn,
      fieldMetadataUniversalIdentifier: IDENTIFIERS.runName,
      position: 0,
      isVisible: true,
      size: 260,
    },
    {
      universalIdentifier: IDENTIFIERS.statusColumn,
      fieldMetadataUniversalIdentifier: IDENTIFIERS.status,
      position: 1,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: IDENTIFIERS.summaryColumn,
      fieldMetadataUniversalIdentifier: IDENTIFIERS.summary,
      position: 2,
      isVisible: true,
      size: 300,
    },
    {
      universalIdentifier: IDENTIFIERS.lockColumn,
      fieldMetadataUniversalIdentifier: IDENTIFIERS.lockKey,
      position: 3,
      isVisible: true,
      size: 160,
    },
  ],
});
