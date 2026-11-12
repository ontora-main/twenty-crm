const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const workflow = readFileSync(resolve(__dirname, '../workflows/ci-sensitive-paths-approval.yaml'), 'utf8');
const script = workflow.split('          script: |\n')[1].split('\n').map(line => line.replace(/^            /, '')).join('\n');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const evaluate = async (reviews, permissions = {}, files = [{ filename: '.github/workflows/ci-attio-sync.yaml' }]) => {
  const statuses = [];
  const listFiles = () => {};
  const listReviews = () => {};
  const github = {
    paginate: async method => method === listFiles ? files : reviews,
    rest: {
      repos: {
        createCommitStatus: async value => statuses.push(value),
        getCollaboratorPermissionLevel: async ({ username }) => ({ data: permissions[username] ?? { permission: 'read' } }),
      },
      pulls: { get: async () => ({ data: { head: { sha: 'current' }, user: { login: 'author' } } }), listFiles, listReviews },
    },
  };
  await new AsyncFunction('github', 'context', 'core', script)(github, { repo: { owner: 'ontora-main', repo: 'twenty-crm' }, payload: { pull_request: { number: 1 } }, eventName: 'pull_request_target', serverUrl: 'https://github.com', runId: 1 }, { info: () => {} });
  return statuses[0].state;
};
const review = (login, state = 'APPROVED', commit_id = 'current', type = 'User') => ({ user: { login, type }, state, commit_id });
test('requires a human maintainer approval', async () => {
  assert.equal(await evaluate([]), 'failure');
  assert.equal(await evaluate([review('reader')]), 'failure');
  assert.equal(await evaluate([review('admin')], { admin: { permission: 'admin' } }), 'success');
  assert.equal(await evaluate([review('maintainer')], { maintainer: { role_name: 'maintain' } }), 'success');
});
test('rejects self approval, bots and stale approvals', async () => {
  assert.equal(await evaluate([review('author')], { author: { permission: 'admin' } }), 'failure');
  assert.equal(await evaluate([review('bot', 'APPROVED', 'current', 'Bot')], { bot: { permission: 'admin' } }), 'failure');
  assert.equal(await evaluate([review('admin', 'APPROVED', 'old')], { admin: { permission: 'admin' } }), 'failure');
});
test('a dismissal or changes requested supersedes approval, comments do not', async () => {
  for (const state of ['DISMISSED', 'CHANGES_REQUESTED']) assert.equal(await evaluate([review('admin'), review('admin', state)], { admin: { permission: 'admin' } }), 'failure');
  assert.equal(await evaluate([review('admin'), review('admin', 'COMMENTED')], { admin: { permission: 'admin' } }), 'success');
});
test('checks renamed sensitive files and permits unrelated changes', async () => {
  assert.equal(await evaluate([], {}, [{ filename: 'ordinary.txt', previous_filename: '.github/workflows/check.yaml' }]), 'failure');
  assert.equal(await evaluate([], {}, [{ filename: 'ordinary.txt' }]), 'success');
});
