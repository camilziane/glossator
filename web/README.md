# glossator web

The reading room of glossator: every bibliography on this computer, each article's summary,
full-text search over the papers and the inbox's triage, served by `glossator serve` at
http://127.0.0.1:8765/. It is built once per computer, works offline, and reads the library at
runtime (`build/data/library.json`, written by `glossator build`).

How it is made, the conventions and the design system: [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Use it

Node 20.19 or later (with npm), and [uv](https://docs.astral.sh/uv/) for the tool's Python
environment. From the repository root:

```sh
uv sync                         # once: the tool's Python environment
uv run glossator web            # once per computer: npm ci and next build into web/out/
uv run glossator serve --open   # the app, the data and the API
```

`glossator serve` finds the app in `web/out/` (or in `GLOSSATOR_WEB`). Each computer builds its own
`out/`: it holds no data, so the same build serves any library. To look at it without a library of
your own, open the demo (one open-access article, `demo/README.md`):

```sh
uv run glossator demo           # builds demo/build/ the first time, then serves it
```

| Page                  | What it shows                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `/`                   | Today: what the inbox found, the way into triage, the bibliographies, the latest articles.    |
| `/bib/?b=<name>`      | A bibliography's tables (articles, and the profile's others), filters and sorting in the URL. |
| `/article/?b=…&k=…`   | An article's summary, sections as `#<id>`, page links into its PDF.                           |
| `/search/?q=…`        | Full-text search over the papers, their files and summaries (needs `glossator serve`).        |
| `/inbox/` (`?p=<id>`) | The inbox's triage (`?view=` a view, `?p=` one paper); decisions need `glossator serve`.      |

Links in the single-page form (`/#<bib>/<key>`, `/#inbox`…) work too. ⌘K / Ctrl+K searches from
anywhere; `?` lists the keyboard shortcuts of the page.

## 2. Develop

```sh
cd web
npm ci
# terminal 1, from the repository root: the data and the API (--home demo for the demo)
uv run glossator serve --port 8765
# terminal 2, in web/: the app with hot reload
npm run dev            # http://127.0.0.1:3000
```

`npm run dev` binds 127.0.0.1 and proxies `/data/*`, `/library/*` and `/api/*` to that
`glossator serve` (`GLOSSATOR_SERVE_URL`, default `http://127.0.0.1:8765`), only for pages opened
as `127.0.0.1` or `localhost`. Several dev servers side by side: `-p <port>` and
`NEXT_DIST_DIR=.next-<name>` each (ARCHITECTURE section 7).

| Script                  | What it does                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Next dev server on 127.0.0.1 (`NEXT_DIST_DIR`, `GLOSSATOR_SERVE_URL`, `-p` to run several).                                                             |
| `npm run build`         | Static export into `out/`.                                                                                                                              |
| `npm run typecheck`     | Route types, then `tsc --noEmit`.                                                                                                                       |
| `npm run lint`          | ESLint (Next core-web-vitals, TypeScript, our rules).                                                                                                   |
| `npm test`              | Unit and component tests (Vitest).                                                                                                                      |
| `npm run test:e2e`      | Playwright on the built app (build first), served by `glossator serve` with the synthetic library (`E2E_PORT`, default 8790; `E2E_WORKERS`, default 4). |
| `npm run serve:fixture` | The built app with the synthetic library, to try it without a library of your own (`E2E_PORT`, default 8790).                                           |
| `npm run format`        | Prettier (Tailwind classes sorted); `npm run format:check` only checks.                                                                                 |
| `npm run check`         | typecheck + lint + tests (the order to run before a build).                                                                                             |

## 3. Test

```sh
npm run check && npm run format:check   # types, lint, unit tests, formatting
npm run build                           # the e2e suite runs on out/
npx playwright install chromium         # once per computer: the browser of the pinned Playwright
npm run test:e2e                        # desktop (1440×900) and phone (Pixel 7), axe in each spec
```

- The e2e suite starts its own server (`scripts/serve-fixture.mjs`): the real `glossator serve`
  (the repository's `.venv/bin/glossator`, else `uv run glossator`) on `out/`, with the synthetic
  library (`tests/fixtures/library.json`) in a temporary `GLOSSATOR_HOME`. Every API call is mocked
  in the browser; nothing reads or decides on a real library. Run one e2e suite at a time per port.
- `@playwright/test` is pinned (1.62.1): `npx playwright install chromium` fetches the Chromium that
  version expects. To use a browser already on the computer instead, set `PLAYWRIGHT_CHROMIUM_PATH`.
- Traces and screenshots of failures go to `test-results/`, the report to `playwright-report/`
  (both git-ignored).

To try a build on your own library, from the repository root:
`GLOSSATOR_WEB=web/out uv run glossator serve --port 8807`. Tests and demos never decide on a real
inbox: the e2e suite mocks every decision, and `npm run serve:fixture` serves a synthetic library
from a temporary folder.

Telemetry is off in every script (`NEXT_TELEMETRY_DISABLED=1`); fonts are self-hosted; nothing is
fetched from the network at runtime.
