# Ontora fork workflows

The production CRM uses a published Twenty image on GCP. The Attio connector is
built and deployed separately. Its tests/typecheck and container checks are the
required main-branch checks and intentionally run on every PR. Deployment runs
only after successful main push CI and never starts a CRM synchronization.

Twenty package CI is retained for changes to the corresponding source, shared
dependencies, workflow or CI actions. The standalone Attio directory is excluded
from the monorepo Utils suite because the connector has its own test/runtime stack.
Do not add path-filtered package checks to branch protection without an always-run
aggregate check: GitHub can leave a filtered required check pending indefinitely.

CodeQL, sensitive-path approval and its review relay remain enabled. Sensitive
changes require a human repository maintainer's approval of the current head;
this cleanup does not bypass that review. The legacy base-branch approval policy
will remain in effect until the configuration PR is merged.

Removed upstream-only automation: twentyhq infrastructure/factory dispatches,
preview and review forwarding, upstream release/npm publication, Crowdin imports
and exports, scheduled catalog/subprocessor updates, benchmark timings, and
upstream Danger/congratulation automation. Deleted workflows that were already
registered in this fork were disabled in GitHub so base-branch triggers stop before
the cleanup merges. Workflow history is retained; files remain recoverable in Git.

Reusable workflow references must continue to resolve. Package filters should
include their own workflow and shared CI actions so CI configuration changes are
still checked. Repository settings continue to require the two Attio checks.

AI documentation and agent-skill drift reviewers are optional on forks. To enable
them, configure `CLAUDE_CODE_OAUTH_TOKEN` and set repository variable
`ENABLE_AI_DRIFT_CHECKS=true`. Deterministic docs lint and skill validation remain
enabled without an AI provider.
