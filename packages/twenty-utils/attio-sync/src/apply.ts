import { canonical, row, type Row, type Snapshot } from './data.ts';
import { projection, type Action, type Plan } from './planner.ts';
import type { Request } from './api.ts';
export const applyPlan = async (
  request: Request,
  plan: Plan,
  current: Snapshot,
  checkpoint: (action: Action) => Promise<void>,
): Promise<void> => {
  if (plan.conflicts.length)
    throw new Error('Resolve all conflicts before applying.');
  // Recheck the complete plan before the first write, including externally created matches.
  for (const action of plan.actions) {
    const records = current[action.collection as keyof Snapshot];
    const record = records.find((item) => item.id === action.id);
    if (
      action.before
        ? !record ||
          canonical(projection(record, action.body)) !==
            canonical(action.before)
        : record ||
          records.some(
            (item) =>
              action.body.attioId && item.attioId === action.body.attioId,
          )
    )
      throw new Error(
        `Target changed since planning: ${action.collection}/${action.id}`,
      );
  }
  for (const action of plan.actions) {
    if (action.before) {
      const response = await request(`/rest/${action.collection}/${action.id}`);
      const data = row(response.data);
      const singular = {
        companies: 'company',
        people: 'person',
        opportunities: 'opportunity',
        notes: 'note',
        tasks: 'task',
      }[action.collection];
      const record: Row = data.id ? data : row(data[singular ?? '']);
      if (
        canonical(projection(record, action.body)) !== canonical(action.before)
      )
        throw new Error(
          `Record changed during sync: ${action.collection}/${action.id}`,
        );
    }
    await request(
      `/rest/${action.collection}${action.before ? `/${action.id}` : ''}`,
      action.before ? 'PATCH' : 'POST',
      action.before ? action.body : { id: action.id, ...action.body },
    );
    await checkpoint(action);
  }
};
