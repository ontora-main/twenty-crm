import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { IDENTIFIERS } from '../identifiers.ts';
import { runTwenty } from './run-twenty.ts';

test(
  'installs the Attio app on the local test server',
  { timeout: 180_000 },
  async () => {
    const apiUrl = process.env.TWENTY_API_URL;
    assert.ok(
      apiUrl && process.env.TWENTY_API_KEY,
      'Test server URL and API key are required',
    );
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(apiUrl).hostname),
      'Integration tests require a local disposable server',
    );
    assert.ok((await fetch(`${apiUrl}/healthz`)).ok);
    process.env.TWENTY_APP_ACCESS_TOKEN = process.env.TWENTY_API_KEY;

    const applied = await runTwenty(['app', 'apply', '--create']);
    assert.ok(applied.ok, JSON.stringify(applied));
    try {
      const client = new MetadataApiClient();
      const result = await client.query({
        findManyApplications: {
          id: true,
          name: true,
          universalIdentifier: true,
        },
      });
      const installed = result.findManyApplications.find(
        (application: { universalIdentifier: string }) =>
          application.universalIdentifier === IDENTIFIERS.application,
      );
      assert.ok(installed, 'Attio must be registered in workspace metadata');
      assert.equal(installed.name, 'Attio');
    } finally {
      const removed = await runTwenty(['app', 'uninstall', '--yes']);
      assert.ok(removed.ok, JSON.stringify(removed));
    }
  },
);
