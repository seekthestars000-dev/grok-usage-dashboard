# Grok Bot Usage

Local dashboard for weekly Grok Bot token usage, daily spikes, high-frequency loops, and per-bot / per-routine breakdowns.

Dark theme, sample data until a usage API is connected. Nothing here deploys, and the repo should not contain secrets.

## Run

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Open http://localhost:5173.

```bash
npm run build
```

Production files land in `dist/`. Preview them with `npm run preview`.

## Where to plug in real data

All data access lives in one module: `src/data/source.ts`.

The UI calls only `getUsage(): Promise<UsageSnapshot>`. The snapshot type is defined in `src/data/types.ts`.

To connect a real API:

1. Replace the body of `getUsage` with a fetch to your endpoint.
2. Return the same `UsageSnapshot` shape (`source`, week window, bots, routines, 30 daily points).
3. Set `source` to `"api"`. The Sample data badge hides when the source is not `"mock"`.
4. Point the client at the endpoint with an env var, for example `VITE_USAGE_API_URL`. Keep the value in `.env.local` (gitignored). Do not commit tokens or keys.

```ts
export async function getUsage(): Promise<UsageSnapshot> {
  const response = await fetch(import.meta.env.VITE_USAGE_API_URL);
  if (!response.ok) throw new Error(`Usage API ${response.status}`);
  return response.json() as Promise<UsageSnapshot>;
}
```

Derived numbers (percent of limit, projected finish, spike days, Loop / Watch tags, saving tips) are computed in `src/lib/metrics.ts` from the raw snapshot, so the API does not need to pre-aggregate them.

Spike days are daily totals above mean + 1.25 standard deviations. A routine is a Loop when it fires faster than once a minute (or has 1,000+ calls), and a Watch when it fires every few minutes with 150+ calls.
