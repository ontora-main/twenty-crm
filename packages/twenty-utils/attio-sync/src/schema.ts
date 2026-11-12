import {
  COLLECTIONS,
  rows,
  sourceId,
  stableId,
  stageValue,
  text,
  type Row,
  type Source,
} from './data.ts';
import { twentyPages, type Request } from './api.ts';
export type SchemaAction = {
  path: string;
  method: 'POST' | 'PATCH';
  body: Row;
};
export const planSchema = async (
  request: Request,
  source: Source,
): Promise<SchemaAction[]> => {
  const objects = await twentyPages(
    request,
    '/rest/metadata/objects',
    'objects',
  );
  const fields = await twentyPages(request, '/rest/metadata/fields', 'fields');
  const actions: SchemaAction[] = [];
  for (const collection of COLLECTIONS) {
    const object = objects.find((item) => item.namePlural === collection);
    if (!object) throw new Error(`Missing Twenty object: ${collection}`);
    for (const definition of [
      { name: 'attioId', label: 'Attio ID', type: 'TEXT', isUnique: true },
      {
        name: 'attioSourceData',
        label: 'Attio source data',
        type: 'RAW_JSON',
        isUnique: false,
      },
    ]) {
      const present = fields.find(
        (item) =>
          item.objectMetadataId === object.id && item.name === definition.name,
      );
      if (
        present &&
        (present.type !== definition.type ||
          (definition.isUnique && present.isUnique !== true))
      )
        throw new Error(`Incompatible field: ${collection}.${definition.name}`);
      if (!present)
        actions.push({
          path: '/rest/metadata/fields',
          method: 'POST',
          body: {
            ...definition,
            objectMetadataId: object.id,
            isNullable: true,
            icon: 'IconLink',
          },
        });
    }
    if (collection === 'opportunities') {
      const stage = fields.find(
        (item) => item.objectMetadataId === object.id && item.name === 'stage',
      );
      if (!stage || stage.type !== 'SELECT')
        throw new Error('Missing opportunity stage select field');
      const options = rows(stage.options);
      const additions = source.stages
        .filter(
          (item) =>
            !options.some(
              (option) => option.value === stageValue(sourceId(item, 'status')),
            ),
        )
        .map((item, index) => ({
          id: stableId(source.workspaceId, 'stage', sourceId(item, 'status')),
          value: stageValue(sourceId(item, 'status')),
          label: text(item.title),
          position: options.length + index,
          color: 'blue',
        }));
      if (additions.length)
        actions.push({
          path: `/rest/metadata/fields/${text(stage.id)}`,
          method: 'PATCH',
          body: { options: [...options, ...additions] },
        });
    }
  }
  return actions;
};
