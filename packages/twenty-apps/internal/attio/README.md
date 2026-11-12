# Attio app for Twenty

A native Twenty app for one-way, on-demand imports of Attio companies, people,
deals, notes and tasks. It appears in Apps, exposes an `attio-import` AI tool and
workflow action, and adds an **Attio sync runs** view. It is not scheduled and does
not write to Attio. Installation alone does not import records.

## Connect and import

In the app's Variables settings, enter an Attio read-only API token with records,
object configuration, notes, tasks and workspace-member access, and the expected
Attio workspace UUID. Tokens are stored as secret application variables. An
optional secret JSON mapping uses the existing connector's `records`, `members`
and `primaryReferences` format.

Invoke **Import from Attio** in a workflow, or ask Twenty AI to call `attio-import`:

1. `connection`: verify the token’s workspace identity and set that UUID as the expected workspace in Variables.
2. `preview-setup`: review the proposed identifiers, source-data fields and stages.
3. `setup`: apply that schema setup, preserving existing opportunity stages.
4. `preview`: inspect create/update counts and resolve every reported conflict.
5. `import`: build a fresh plan, check target drift again, then apply it.

The app uses its own Twenty role and the runtime's internal API connection. It
needs record read/update access for the five CRM objects and note/task targets,
read access to workspace members, and Data Model permission for schema setup.
It has no delete permissions. No additional Twenty API key is needed.

## Safety and recovery

The existing connector engine is imported directly from `twenty-utils/attio-sync`
and bundled into the app function. Its matching, source-field ownership, payload
preservation and unsupported-object limitations apply here too; read that
connector's README before the first import. Attio ID is preferred, then exact
company domain/person email. Names alone never merge records.

A unique database lock serializes this app's writing operations across workers.
Do not run the standalone CLI importer concurrently: it has its own lock.
Successful runs release the app lock. A failed or killed run retains it; review
**Attio sync runs**, the completed count, and target records before clearing that
run's `lockKey` to retry. Never clear a lock while its worker is active. Retrying
uses deterministic identities and rechecks the current target. Imports are not
transactional; there is no automatic rollback.

The function has a 15-minute ceiling and stops starting requests after 13 minutes.
Large workspaces may need the standalone importer; this app does not claim an
unbounded background backfill or automatic incremental sync. Progress records
contain counts/status only; imported records preserve their Attio payloads in
`attioSourceData`. Normal CRM retention and access rules apply to those records.
Uninstalling the app is not a rollback of imported CRM data or setup fields.

## Development

Use Node 24 and install dependencies in this app with `yarn install --immutable`.
The shared connector is installed as a local package dependency. Then run:

```sh
yarn lint
yarn test:unit
yarn typecheck
npx twenty@2.57.0 app build
npx twenty@2.57.0 app apply --create --no-prune
```

`yarn test` installs and removes the app on a disposable local Twenty server.
Set `TWENTY_API_URL` and `TWENTY_API_KEY` for that fixture, and `TWENTY_CLI`
when using a locally built CLI. Remote servers are rejected to protect live data.

SDK definition entry points require default exports for Twenty's source scanner;
ordinary functions use named exports. Keep credentials, local CLI authentication,
build snapshots and real source records out of Git.

Token identity is checked with [Attio Identify](https://docs.attio.com/rest-api/endpoint-reference/meta/identify). The health check verifies authentication and source identity only; it does not claim successful data sync.

The Twenty instance must enable logic-function execution (`LOCAL` on a trusted single-tenant server, or a configured `LAMBDA` runtime). With execution disabled, installation still succeeds but no import or health check runs.
