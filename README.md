# Gest Cloudflare Collector Template

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fumgbhalla%2Fgest-cloudflare-collector-template)

This is the one-click template shape for a user-owned Gest collector on
Cloudflare Workers. The public button targets
`umgbhalla/gest-cloudflare-collector-template`, a generated self-contained repo
with the built Gest runtime packages vendored under local `file:` dependencies.

## Files

- src/collector.ts defines the collector, enabled platforms, and runtime
  consumer registry.
- src/runtime.ts is the app-owned decision runtime.
- src/worker.ts exports the Worker handlers and Durable Object classes that
  Wrangler binds.
- wrangler.jsonc declares the Worker, D1, R2, Queue, DLQ, Durable Objects, and
  required secrets for Cloudflare's deploy button.
- pnpm-workspace.yaml approves the transitive native/binary package build
  scripts needed by Wrangler and Alchemy during non-interactive installs.
- alchemy/stack.ts is the upgrade path for teams that want the richer
  Alchemy-managed substrate handle instead of Wrangler-only deployment.

## Deploy

The README button imports the public self-contained template into the deployer's
Cloudflare account.
For local deployment:

~~~sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm deploy
~~~

`pnpm deploy` applies the D1 migrations against the `RAW_DB` binding before
deploying the Worker, which matches the database name chosen during the deploy
button flow.

The Alchemy path uses the same collector:

~~~sh
pnpm build
pnpm deploy:alchemy
~~~

## CLI init

For an existing repo or monorepo, prefer the CLI:

~~~sh
pnpm dlx @gest/cli init cloudflare apps/events
~~~

The CLI detects whether the target lives inside a workspace, then writes an
Alchemy-first collector structure for source-repo development.

## Package boundary

The checked-in source template uses published @gest/* package names so the
future npm-published path stays obvious. The public Deploy to Cloudflare repo is
generated from this source template and rewrites those dependencies to committed
`vendor/*` file dependencies.

While developing inside the Gest monorepo, replace those versions with local
workspace links or run `pnpm run build:cloudflare-template-release`.
