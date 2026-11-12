import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { createRequest, readSource, readTarget } from './api.ts';
import { applyPlan } from './apply.ts';
import { canonical, stableId } from './data.ts';
import { planSync } from './planner.ts';
import { planSchema } from './schema.ts';

const main = async () => {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.includes('--help')) {
    console.log(
      'sync [setup] [--apply]\nDefault: read-only sync plan. See README for environment and mapping configuration.',
    );
    return;
  }
  if (
    argumentsList.some((argument) => !['setup', '--apply'].includes(argument))
  )
    throw new Error('Unknown argument. Use --help.');
  const environment = z
    .object({
      ATTIO_API_TOKEN: z.string().min(1),
      TWENTY_API_TOKEN: z.string().min(1),
      TWENTY_BASE_URL: z.url(),
      ATTIO_WORKSPACE_ID: z.uuid(),
    })
    .parse(process.env);
  const targetUrl = new URL(environment.TWENTY_BASE_URL);
  if (targetUrl.pathname !== '/')
    throw new Error('TWENTY_BASE_URL must be an origin without a path.');
  const directory = resolve('.local');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = resolve(directory, `${stableId(targetUrl.origin)}.lock`);
  const lock = await open(lockPath, 'wx', 0o600);
  try {
    const attio = createRequest(
      'https://api.attio.com/v2',
      environment.ATTIO_API_TOKEN,
    );
    const twenty = createRequest(
      targetUrl.origin,
      environment.TWENTY_API_TOKEN,
    );
    const source = await readSource(attio);
    if (source.workspaceId !== environment.ATTIO_WORKSPACE_ID)
      throw new Error('Attio workspace does not match configuration.');
    const schema = await planSchema(twenty, source);
    const reportPath = resolve(
      directory,
      `${new Date().toISOString().replaceAll(':', '-')}.json`,
    );
    if (argumentsList.includes('setup')) {
      await writeFile(
        reportPath,
        JSON.stringify({ target: targetUrl.origin, schema }, null, 2),
        { mode: 0o600 },
      );
      console.log(`${schema.length} schema changes. Report: ${reportPath}`);
      if (argumentsList.includes('--apply'))
        for (const action of schema)
          await twenty(action.path, action.method, action.body);
      return;
    }
    if (schema.length)
      throw new Error(
        'Schema setup required. Run setup, review the report, then setup --apply.',
      );
    const mapping = process.env.ATTIO_MAPPING_FILE
      ? z
          .object({
            records: z.record(z.string(), z.uuid()).optional(),
            members: z.record(z.uuid(), z.uuid()).optional(),
            primaryReferences: z.record(z.string(), z.uuid()).optional(),
          })
          .strict()
          .parse(
            JSON.parse(await readFile(process.env.ATTIO_MAPPING_FILE, 'utf8')),
          )
      : {};
    const target = await readTarget(twenty);
    const plan = planSync(source, target, mapping);
    const report = {
      target: targetUrl.origin,
      sourceWorkspace: source.workspaceId,
      source,
      targetBefore: target,
      plan,
      completed: [] as string[],
    };
    await writeFile(reportPath, JSON.stringify(report, null, 2), {
      mode: 0o600,
    });
    console.log(
      `${plan.actions.filter((action) => !action.before).length} creates, ${plan.actions.filter((action) => action.before).length} updates, ${plan.unchanged} unchanged, ${plan.conflicts.length} conflicts. Report: ${reportPath}`,
    );
    if (argumentsList.includes('--apply')) {
      const latest = await readTarget(twenty);
      if (canonical(planSync(source, latest, mapping)) !== canonical(plan))
        throw new Error('Target changed after planning; rerun.');
      await applyPlan(twenty, plan, latest, async (action) => {
        report.completed.push(`${action.collection}/${action.id}`);
        await writeFile(reportPath, JSON.stringify(report, null, 2), {
          mode: 0o600,
        });
      });
      console.log('Sync completed.');
    }
    if (plan.conflicts.length) process.exitCode = 2;
  } finally {
    await lock.close();
    const { unlink } = await import('node:fs/promises');
    await unlink(lockPath);
  }
};
main().catch((error) => {
  console.error(
    error instanceof z.ZodError
      ? 'Invalid configuration or API data. Check the documented schema; sensitive values are not logged.'
      : error instanceof Error
        ? error.message
        : 'Sync failed.',
  );
  process.exitCode = 1;
});
