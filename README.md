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

This command requires a configured Valyu CLI session. It fails if any task is incomplete instead of publishing partial output.

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
