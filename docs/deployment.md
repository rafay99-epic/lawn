# Deployment

## Deploying to Vercel (with Convex)

This repo is configured so Vercel runs:

```bash
bun run build:vercel
```

`build:vercel` runs Convex deployment first, then runs the app build via Convex:

```bash
bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL
```

Required Vercel environment variable:

- `CONVEX_DEPLOY_KEY` (create a production deploy key in Convex and add it in Vercel project settings)

## Disabling payments (self-hosting without Stripe)

Payments are behind a feature flag so you can run lawn without Stripe. To fully
disable billing, set **both** flags to `false`:

| Flag | Where | Effect |
| --- | --- | --- |
| `PAYMENTS_ENABLED=false` | Convex deployment env (dashboard or `bunx convex env set PAYMENTS_ENABLED false`) | Removes all server-side subscription/storage enforcement — every team gets unlimited, always-active access. |
| `VITE_PAYMENTS_ENABLED=false` | Web build env (Vercel project env var, `VITE_` vars are read at build time) | Hides all billing/pricing UI: checkout, plan cards, the billing paywall, the `/pricing` page, and marketing pricing sections. |

Set both together — the backend flag makes the app work, the frontend flag hides
the now-unused billing UI. With payments disabled you do **not** need any
`STRIPE_*` env vars or the Stripe webhook.

To redeploy after changing the flags:

1. Set `PAYMENTS_ENABLED` in Convex (dashboard → Settings → Environment Variables,
   or `bunx convex env set PAYMENTS_ENABLED false --prod`).
2. Set `VITE_PAYMENTS_ENABLED` in Vercel (Project → Settings → Environment
   Variables). Because it is baked in at build time, you must **rebuild** for it
   to take effect.
3. Trigger a redeploy (push to the connected branch, or run
   `bun run build:vercel` with `CONVEX_DEPLOY_KEY` set). This deploys the Convex
   backend and rebuilds the web app together.
