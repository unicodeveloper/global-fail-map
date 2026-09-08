# Global Fail Map

**The world is built on attempts.**

Global Fail Map is an interactive atlas of ambitious companies, unfinished megaprojects, abandoned inventions, terminated experiments, and futures that never arrived.

Cited reports cover discontinued drugs, terminated clinical trials, companies, patented inventions and cancelled infrastructure. Click a symbol on the globe to read what was attempted, what ended, and what survived. Click anywhere else to research that place with the Valyu DeepResearch API.

## Why this exists

Success stories erase the forks in the road. Failure leaves evidence.

Fordlandia, the Superconducting Super Collider, Project Cybersyn, Monju, Concorde, and Biosphere 2 did not simply vanish. They produced infrastructure, institutions, technical knowledge, regulatory precedent, and lessons for the next builder. This atlas follows those traces without flattening every cancellation, dissolution, or negative result into the same story.

Every report distinguishes:

- What people actually tried to build
- The documented geographic connection
- What the sources establish and what remains uncertain
- Why the attempt ended
- What survived it
- What the next builder can take forward

## Run it yourself

You need Node.js 22, pnpm, a [Valyu API key](https://platform.valyu.ai), and a [Mapbox public token](https://account.mapbox.com).

```sh
git clone https://github.com/yorkeccak/global-fail-map.git
cd global-fail-map
pnpm install
cp .env.example .env.local
pnpm dev
```

Set the values in `.env.local`:

```env
NEXT_PUBLIC_APP_MODE=self-hosted
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk_your_public_token
VALYU_API_KEY=valyu_your_api_key
```

Self-hosted mode calls Valyu directly with your server-side API key. It does not require a database. Research history comes from `GET /v1/deepresearch/list` for that key.

Optionally set `DEEPRESEARCH_ALERT_EMAIL` to an email belonging to your Valyu organisation to enable completion notifications. Set `NEXT_PUBLIC_APP_URL` to the reachable app URL so the email returns to the correct report.

## Research and sharing

- Fast is the default. Standard and Heavy offer deeper research and use more time and account credits.
- Each task has a `/?research=<id>` link that reopens its latest progress or completed report with the owner's account.
- Completion emails are enabled by default when a verified account email is available, with an option to turn them off before starting.
- Share a completed report explicitly to create a public `/?share=<id>` link. Publishing exposes its report and research query through Valyu. Turn public sharing off to revoke access.
- Project photos load automatically from Valyu search results with links to their original sources. Location reports search for the named projects they uncover. Bundled stories include cached photos, available without signing in. New photo searches use the viewer's configured account credits.

## Hosted mode

The hosted app uses Sign in with Valyu. OAuth tokens stay in encrypted, HTTP-only cookies and research requests pass through the Valyu OAuth proxy. The OAuth client secret and session secret are server-only environment variables.

```env
NEXT_PUBLIC_APP_MODE=valyu
NEXT_PUBLIC_APP_URL=https://your-app.example
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk_your_public_token
NEXT_PUBLIC_VALYU_SUPABASE_URL=https://your-provider.supabase.co
NEXT_PUBLIC_VALYU_CLIENT_ID=your_client_id
VALYU_CLIENT_SECRET=your_client_secret
VALYU_SESSION_SECRET=at_least_32_random_characters
VALYU_APP_URL=https://platform.valyu.ai
```

Allow `https://your-app.example/auth/valyu/callback` in the OAuth client.

## Example reports

The bundled reports were generated in `standard` mode and cached as Markdown under `public/reports`. Their task IDs and source metadata live in `src/data/examples.json`.

To refresh them from their existing DeepResearch tasks:

```sh
pnpm sync:examples
```

This command requires a configured Valyu CLI session. It fails if any task is incomplete instead of publishing partial output. Cached reports may contain narrow, source-backed factual corrections. Resyncing replaces those edits with provider output, so review the diff before publishing.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Stack

- Next.js 15 and React 19
- Mapbox GL JS with globe projection
- Valyu DeepResearch API
- Valyu OAuth 2.1 with PKCE in hosted mode
- Vercel Analytics

## License

MIT. See [LICENSE](LICENSE).
