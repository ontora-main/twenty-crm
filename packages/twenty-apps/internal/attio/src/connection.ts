import { z } from 'zod';
import { type Request } from '@ontora/attio-twenty-sync/api.ts';

export const inspectConnection = async (request: Request) => {
  const identity = z
    .object({
      active: z.boolean(),
      workspace_id: z.uuid().optional(),
      workspace_name: z.string().optional(),
      workspace_slug: z.string().optional(),
    })
    .parse(await request('/self'));
  if (!identity.active || !identity.workspace_id)
    throw new Error(
      'The Attio token is inactive or has no workspace identity.',
    );
  return {
    workspaceId: identity.workspace_id,
    workspaceName: identity.workspace_name,
    workspaceSlug: identity.workspace_slug,
  };
};
