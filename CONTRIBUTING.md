# Contributing

Global Fail Map is an atlas of attempts worth understanding. Help make it a better place to learn from them.

## Run the app

Use Node.js 22 and pnpm. Follow the self-hosted setup in the README, then run `pnpm dev`.

Before opening a pull request:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Use small commits with one clear purpose. Explain what changed and how you checked it. Format TypeScript with Prettier, use two-space indentation, and keep strict types.

## Add an example

Each map pin needs a real geographic connection. A headquarters, factory, trial site, and proposed construction site are different things. Say which one it is.

- Add metadata to `src/data/examples.json` and a cited Markdown report under `public/reports/`.
- Verify the title, dates, coordinates, location role, status, and central claims against the linked sources.
- Prefer archives, regulatory records, trial registries, original papers, and company filings.
- Preserve the difference between a cancelled project, a dissolved company, a retired product, and an experiment that answered its question.
- Explain what survived and what a future builder could learn. Avoid hindsight dressed up as certainty.
- Keep credentials, unpublished material, and private research out of pull requests.

For corrections, identify the claim, explain the issue, and link the evidence. A more precise status or geographic role is as valuable as a new entry.

## Report a bug

Include the browser, screen size, steps to reproduce, and expected behavior. For research failures, include the visible error and approximate time. Never include cookies, bearer tokens, OAuth codes, API keys, or environment files.

Report security issues privately to contact@valyu.ai.
