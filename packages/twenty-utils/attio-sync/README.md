# Attio → Twenty (on demand)

Standalone Node.js 24+ connector. Attio is the source of truth for mapped fields.
Nothing is scheduled. Default execution only reads APIs and writes a local report.
`--apply` explicitly enables Twenty writes. Attio is never modified; deletions are
never propagated. This is a CLI, not an installed Twenty marketplace application.

## Setup

From this directory:

```sh
npm ci
npm test
npm run typecheck
```

Supply secrets through your password manager or environment, never command-line
arguments or committed files:

- `ATTIO_API_TOKEN`: read access to records, object configuration, notes, tasks and
  workspace members (`record_permission:read`, `object_configuration:read`,
  `note:read`, `task:read`, `user_management:read`).
- `ATTIO_WORKSPACE_ID`: expected source workspace UUID; mismatches abort.
- `TWENTY_BASE_URL`: HTTPS origin, e.g. `https://crm.ontora.com`.
- `TWENTY_API_TOKEN`: workspace API token with read/create/update permissions for
  companies, people, opportunities, notes, tasks and their target relationships;
  read access to workspace members. Setup additionally needs metadata read/write.
  Use a token from the intended workspace: a hostname alone does not identify a
  workspace on a multi-workspace installation.
- Optional `ATTIO_MAPPING_FILE`: path to a JSON mapping file (see below).

```sh
npm run sync -- setup
# Review the schema report, then:
npm run sync -- setup --apply
npm run sync
# Review the data report and resolve every conflict, then:
npm run sync -- --apply
```

Each apply builds a fresh plan and rechecks the target before writing. It does not
apply a previously saved report. Run with source/target editing paused during a
migration window: the APIs do not provide a cross-system snapshot or transaction.
The final record check narrows, but cannot eliminate, concurrent-edit races.

Setup adds nullable `attioId` (unique text) and `attioSourceData` (JSON) to all five
objects, and appends Attio stages to the opportunity stage field. Existing stage
options are preserved. Stage label changes in Attio are retained in source data
but are not automatically renamed in Twenty. Review schema changes separately.

## Mapping and preservation

| Attio     | Twenty                                                                  |
| --------- | ----------------------------------------------------------------------- |
| Companies | Name, domains                                                           |
| People    | Name, emails, job title, company                                        |
| Deals     | Name, amount/currency, stage, owner, company, primary contact           |
| Notes     | Title, Markdown body, linked person/company/deal                        |
| Tasks     | Title, full body, deadline, completion status, assignee, linked records |

Every imported record also stores its complete returned Attio payload in
`attioSourceData`, including source timestamps, authors, custom attributes and
additional relationships. These are preserved as JSON, not converted into native
Twenty creation dates, authors, phone fields or custom relationship fields.
Twenty creation dates represent import time. Task completion dates remain in JSON.
Missing optional scalar values do not erase target values; relationship fields and
task status/deadline are source-owned and may be cleared. Existing extra note/task
links are retained. This is a migration bridge, not an exact replica.

Matching uses Attio ID first, then exact normalized company domain or person email.
Names alone never trigger automatic merges. Possible same-name deals/notes/tasks,
ambiguous matches, missing members and unsupported links block the whole apply.
Company fallback matching currently uses the target's primary domain only.
A second Attio record cannot claim the same target in one run. Deterministic create
IDs and unique Attio IDs allow resuming after a partial failure.

Mapping file example (replace all illustrative UUIDs with real IDs):

```json
{
  "records": {
    "companies:11111111-1111-4111-a111-111111111111": "22222222-2222-4222-a222-222222222222"
  },
  "members": {
    "33333333-3333-4333-a333-333333333333": "44444444-4444-4444-a444-444444444444"
  },
  "primaryReferences": {
    "opportunities:55555555-5555-4555-a555-555555555555": "66666666-6666-4666-a666-666666666666"
  }
}
```

`records` maps `<Twenty collection>:<Attio record ID>` to an existing Twenty ID.
`members` maps Attio member IDs to Twenty member IDs; otherwise exact email is used.
`primaryReferences` selects an Attio person ID for a deal with multiple contacts,
or an Attio member ID for a task with multiple assignees. The selected reference
must already belong to that source record. Additional references remain in JSON.
Multiple company references on a person require source cleanup before importing.

## Reports and recovery

`.local/` contains sensitive source/target snapshots, planned changes and completed
write IDs. Files are created with mode 0600 and the directory with 0700; keep it
private and delete reports according to your retention policy. Do not commit them.
There is no automatic rollback. Review the before snapshot for manual recovery.
Writes are sequential and stop on the first failure. Rerun a read-only plan after
failure before resuming. Ambiguous failed writes are not retried automatically.
A local per-host lock prevents overlapping runs from this directory; do not run
another copy elsewhere. After a hard kill, verify no sync is running before
manually removing the stale `.local/*.lock` file.

## Not included

Attio lists/list entries, custom objects, attachments, email history, meetings,
comments, recordings, and downloaded files are not imported. Notes/tasks referring
to unsupported objects block apply. Raw payload preservation does not download
external attachments or preserve their access. This connector does not activate
Gmail, Granola, Slack, Needle or other integrations, and has not been live-tested
without API credentials.

API contracts: [Attio records](https://docs.attio.com/rest-api/endpoint-reference/records/list-records),
[notes](https://docs.attio.com/rest-api/endpoint-reference/notes/list-notes),
[tasks](https://docs.attio.com/rest-api/endpoint-reference/tasks/list-tasks).
Twenty REST behavior is based on the server integration tests in this repository.

## CI and production deployment

`Attio Connector CI` runs the ten behavior tests, TypeScript, an AMD64 container
build, an offline/non-root smoke test, and isolated deployment safety tests. It
publishes only the image and installation files, never CRM reports or credentials.
Actions and the Node base image are pinned to immutable revisions/digests.

After a successful **push CI run on main**, `Attio Connector Deploy` downloads that
exact run's release, validates checksums and revision, and installs it on:

- Project `ontora-twenty-crm-prod`
- VM `crm-prod`, zone `europe-west3-a`
- Directory `/opt/ontora/attio-sync`

PR runs cannot deploy. The protected `attio-production` environment permits only
main. Workload Identity Federation additionally restricts the GitHub repository
and owner numeric IDs, branch, environment, and deployment workflow path. No
long-lived GCP keys are stored in GitHub. The deployer can read Compute metadata,
modify metadata only on this VM (for expiring SSH keys), use its attached service
account and tunnel to its SSH port through IAP. This implies administrative access
to this VM: treat changes to the deployment workflow as production-sensitive.
The existing metadata-based SSH mode is retained; OS Login is not enabled by this
connector. No public SSH firewall rule is added.

`deploy/bootstrap-gcp.sh` idempotently provisions these dedicated IAM resources.
Run it as a project administrator. Configure its two printed non-secret values as
`ATTIO_GCP_WIF_PROVIDER` and `ATTIO_GCP_DEPLOY_ACCOUNT` in the GitHub environment.
The VM needs Docker, sudo, and an existing ingress rule from IAP
(`35.235.240.0/20`) to TCP 22. The pipeline does not modify firewall rules.

Deployment loads a versioned image and smoke-tests it without network access
before atomically switching `current`. The previous release remains at `previous`.
It neither restarts Twenty nor performs schema changes or synchronization.
No scheduler or automatic data import is installed.

On the VM, create a **root-owned, mode 0600** file
`/opt/ontora/attio-sync/runtime.env` containing the four required variables from
Setup. Store optional mapping JSON under `/opt/ontora/attio-sync/data/` and reference
it inside the container as `/data/mapping.json`. Reports persist under
`/opt/ontora/attio-sync/data/.local/` and are never uploaded to GitHub.

```sh
sudo /opt/ontora/attio-sync/current/run.sh setup-plan
sudo /opt/ontora/attio-sync/current/run.sh setup-apply
sudo /opt/ontora/attio-sync/current/run.sh plan
sudo /opt/ontora/attio-sync/current/run.sh apply
```

The launcher defaults to `plan`, runs as a non-root container user with a read-only
root filesystem and resource limits, and prevents concurrent runs via a fixed
container name. A hard kill can leave the local lock: inspect the container and
report before removing any stale lock. Deployment is serialized independently of
sync; a running sync continues using its original image ID.

Rollback code (not CRM data) by atomically repointing `current` to a verified
release in `releases/`, then use `run.sh plan`. Keep the previous image until no
rollback is needed. Failed uploads in the deployment account's home
and old images require periodic operator cleanup; successful uploads are removed; never prune a running image or
the current/previous release. Deployment artifacts expire from GitHub after 14 days.
