# Architecture of the web app

The web app of glossator: every bibliography of a computer, each article's summary,
full-text search over the papers and the inbox's triage. Read this file before writing code here;
`AGENTS.md` adds one rule: the bundled Next.js docs (`node_modules/next/dist/docs/`) are the reference for this version.

## 1. How it runs

```
            npm run build (once per computer)                    glossator build
web/src ──────────────────────────────────▶ web/out/   build/data/library.json   build/index.sqlite
                                              │               │                        │
                                              ▼               ▼                        ▼
                         glossator serve (127.0.0.1:8765): /  /data/library.json  /library/…  /api/…
                                              │
                                              ▼
                                  the browser: one fetch of the data, then everything client-side
```

- **Built once, independent of the data.** `next build` makes a static export (`output: "export"`,
  `trailingSlash: true`, `images.unoptimized`) into `out/`: one HTML page per route, no build-time
  data, no `generateStaticParams`. The same `out/` serves any library.
- **Data at runtime.** The app fetches `/data/library.json` once per session (validated with zod,
  indexed once), and calls `/api/search`, `/api/read`, `/api/status` and `POST /api/inbox/decide`.
  Files (PDFs, figures, supplementary files, inbox PDFs) are `/library/<path>`.
- **The API may be absent** (the app opened from a static host): pages degrade gracefully (section 5.3).
- **Routes are fixed; what they show is in the search params**: `/`, `/bib/?b=<name>`,
  `/article/?b=<bib>&k=<key>` (sections are `#<section-id>`), `/search/?q=…`, `/inbox/`. Links in the
  single-page form (`/#<bib>`, `/#<bib>/<key>[/<section>]`, `/#inbox`) are redirected by the shell.
- **In development** `next dev` proxies `/data/*`, `/library/*` and `/api/*` to a running
  `glossator serve` (`GLOSSATOR_SERVE_URL`, default `http://127.0.0.1:8765`), only for requests whose Host
  is `127.0.0.1` or `localhost` (the proxy rewrites the Host header, so `glossator serve`'s own check
  cannot see a page reached under another name: DNS rebinding), and each dev server may use
  its own build dir (`NEXT_DIST_DIR`). Builds always use `.next/` and write `out/` (a custom `distDir`
  would move the export itself).
- **The tsconfig never changes.** `experimental.strictRouteTypes` makes `next-env.d.ts` (git-ignored,
  rewritten by whichever `next` ran last) import the route types and the check of each page's
  exports, instead of Next appending one `include` line per build dir to `tsconfig.json`.
  `npm run typecheck` runs `next typegen` first, so it always checks against `.next/types`.

## 2. Stack

| Package                                            | Version                                                             | Why                                                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js (App Router, Turbopack)                    | 16.4.6                                                              | Static export, file routes, `next/font/local`, `next/link` prefetching.                                                                                             |
| React / React DOM                                  | 19.3.1                                                              | `use()` + Suspense for the data, `useSyncExternalStore` for browser-only state.                                                                                     |
| React Compiler (`reactCompiler: true`)             | babel-plugin 1.0.0                                                  | Builds cleanly with the export; memoizes components, so no `useMemo`/`useCallback` by habit. Its lint rules (react-hooks 7) are on.                                 |
| TypeScript                                         | 6.0.3                                                               | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. 7.0 exists but typescript-eslint needs a TypeScript with a JS API (< 6.1).                              |
| Tailwind CSS                                       | 4.3.5                                                               | CSS-first: tokens in `src/app/globals.css` (`@theme`), compiled by `@tailwindcss/turbopack` (no PostCSS config).                                                    |
| shadcn/ui CLI (dev dependency)                     | 4.23.0                                                              | `components.json`: style radix-nova, base color neutral, lucide icons, CSS variables. Components in `src/components/ui/` on `radix-ui` 1.8 (alert-dialog included). |
| zod                                                | 4.6.7                                                               | The data contract at the boundary (`src/lib/data/schema.ts`, `src/lib/api.ts`).                                                                                     |
| nuqs                                               | 2.10.2                                                              | URL state (filters, sorting, queries) with typed parsers; the Next app adapter.                                                                                     |
| @tanstack/react-table                              | 9.3.1                                                               | Headless tables (hub, inbox). **v9 has a new API** (`useTable`, `tableFeatures`): read `node_modules/@tanstack/react-table/skills/` before writing a table.         |
| @tanstack/react-virtual                            | 3.14.26                                                             | Virtualize long lists (the inbox's papers, long hub tables and their phone cards).                                                                                  |
| MiniSearch                                         | 7.2.0                                                               | Instant client-side search over article cards (see below).                                                                                                          |
| cmdk                                               | 1.1.1                                                               | The ⌘K palette (through shadcn `command`).                                                                                                                          |
| next-themes                                        | 0.4.6                                                               | Light / dark / system, class strategy, no flash.                                                                                                                    |
| sonner                                             | 2.0.8                                                               | Toasts, for rare app-wide messages (inbox decisions use the status line).                                                                                           |
| lucide-react                                       | 1.70.0                                                              | Icons.                                                                                                                                                              |
| Source Serif 4 (`source-serif`, Adobe)             | 4.5.1 (exact)                                                       | The reading serif: official variable build (weight, optical size, true italic, small caps, old-style figures), through `next/font/local`. Section 3.2.              |
| IBM Plex Sans Variable (`@ibm/plex-sans-variable`) | 0.2.0 (exact)                                                       | The interface sans (weight and width axes, true italic). Its telemetry is replaced by `scripts/no-telemetry` (section 3.2).                                         |
| IBM Plex Mono (`@ibm/plex-mono`)                   | 2.5.0 (exact)                                                       | Commands, keys, paths (Regular and Medium, not preloaded).                                                                                                          |
| Vitest + jsdom + Testing Library                   | 4.1.12 / 29.1.1 / 16.3.3 (jest-dom 6.9.1)                           | Unit and component tests.                                                                                                                                           |
| Playwright + axe                                   | 1.62.1 / @axe-core/playwright 4.13.0                                | End-to-end and WCAG checks. Pinned: `npx playwright install chromium` fetches the Chromium this version expects.                                                    |
| ESLint + Prettier                                  | 9.39.5 (eslint-config-next 16.4.6) / 3.9.10 + tailwind plugin 0.8.1 | Lint (core-web-vitals + typescript + our rules) and format. Not Biome: Next's rules, react-hooks and jsx-a11y live in ESLint.                                       |

**Held back on purpose.** Node 20.20 is installed: vitest 5, jsdom 30+, jest-dom 6.10+, axe 4.14 and
`cn` 0.5 need Node 22. ESLint 10 waits for eslint-plugin-react. `playwright-core` is pinned to 1.62.1
by an npm override (axe would pull a newer one, whose types differ). Upgrade these together once Node
22 is the floor.

**Not adopted.** `cacheComponents` / Partial Prefetching (create-next-app's default): they serve
apps with a server; here every page is static and data is client-side, and their `<Activity>`
navigation (hidden routes kept mounted) would surprise dialogs and shortcuts. `typedRoutes`: our
routes differ by search params, which it cannot check; `src/lib/routes.ts` builds every internal URL
and is unit-tested instead.

**Why MiniSearch** (not Orama, not Fuse.js): 7 kB, no dependencies, synchronous (usable during
render), a real inverted index with BM25-like scoring, per-field boosts, prefix and bounded fuzzy
matching, and a custom tokenizer (we fold accents: papers and summaries come in several
languages, names carry diacritics). Fuse.js scans every document with a fuzzy matcher (slow and loose on multi-word
queries); Orama is larger and async. Full text stays on the server (`/api/search`).

## 3. Design system: the glossed page

"A plain serif page with red page numbers in the margin." Paper, ink and one rubric red for
structure; hairlines and space instead of cards; the serif for every word that is read, a quiet sans
for controls and data, a mono for tokens; icons only where the icon is the label; no decoration
that carries no information. It lives in `src/app/globals.css` (tokens in oklch: light in `:root`,
dark in `.dark`, print under `@media print`; utilities; base rules), `src/app/fonts.ts`,
`src/components/ui/` (shadcn, restyled) and `src/components/content/` (the data's look).

### 3.1 Colour tokens

| Token (Tailwind class)                               | Light                     | Dark                  | Use                                                                                   |
| ---------------------------------------------------- | ------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| `background` = `paper` (`bg-background`, `bg-paper`) | oklch(0.972 0.012 85)     | oklch(0.205 0.008 70) | The page. `card` is the paper too: no raised white cards.                             |
| `foreground` = `ink` (`text-foreground`, `text-ink`) | oklch(0.22 0.012 60)      | oklch(0.90 0.014 85)  | Text. `primary` (a solid button), `ring` (focus) and `link` are the ink.              |
| `muted-foreground`                                   | oklch(0.48 0.012 70)      | oklch(0.70 0.012 80)  | Secondary text, labels, meta.                                                         |
| `border` = `rule`                                    | oklch(0.885 0.012 80)     | oklch(0.32 0.010 70)  | Hairlines between things.                                                             |
| `rule-strong`                                        | oklch(0.80 0.012 75)      | oklch(0.42 0.010 70)  | A quiet button's hairline (its words identify it).                                    |
| `input`                                              | oklch(0.62 0.012 75)      | oklch(0.55 0.010 75)  | The edge of a field or a checkbox (≥ 3:1: WCAG 1.4.11).                               |
| `muted` = `wash` = `secondary`                       | oklch(0.950 0.012 85)     | oklch(0.235 0.008 70) | Hovered and selected rows, code, commands, skeletons.                                 |
| `accent`                                             | = wash                    | oklch(0.275 0.009 70) | A hovered or highlighted row in a raised surface (in dark, a step above the popover). |
| `popover`                                            | oklch(0.985 0.008 85)     | oklch(0.235 0.009 70) | Menus, dialogs, sheets, the palette: the only raised surfaces (`shadow-popover`).     |
| `rubric` (`text-rubric`)                             | oklch(0.52 0.165 32)      | oklch(0.72 0.13 38)   | Structure only (below).                                                               |
| `highlight`                                          | oklch(0.94 0.06 95)       | oklch(0.40 0.07 95)   | `<mark>`: search matches, an inset highlighter stroke.                                |
| `danger` = `destructive`                             | oklch(0.45 0.17 20)       | oklch(0.74 0.14 22)   | Retractions, errors: always with the word.                                            |
| `warning`                                            | oklch(0.50 0.11 65)       | oklch(0.80 0.11 80)   | Drafts, corrections, "keyword only".                                                  |
| `success`                                            | oklch(0.46 0.09 150)      | oklch(0.78 0.10 150)  | "Accepted" status words only.                                                         |
| `danger-soft`, `warning-soft`, `success-soft`        | the ink at 7–8 % in paper | at 10–12 %            | Kept for compatibility: new work writes the word in its ink, without a fill.          |
| `chart-1…5`, `star`                                  | ink, then lighter inks    | lighter, then darker  | Bars and small charts are ink, never rubric; `star` (★ marks) is the muted ink.       |

Print is the light set on white paper, the muted ink oklch(0.42 0.012 70) and the hairlines a step
darker for toner.

**Contrast** (WCAG 2 ratios from a real conversion: oklch → OKLab → linear sRGB, clipped, relative
luminance), every text pair at least AA, most AAA:

| Pair                                                   | Light              | Dark               | Print              |
| ------------------------------------------------------ | ------------------ | ------------------ | ------------------ |
| ink on paper / wash / popover                          | 16.0 / 15.0 / 16.6 | 13.3 / 12.4 / 12.4 | 18.1 / 15.7 / 18.1 |
| muted ink on paper / wash / popover                    | 6.0 / 5.7 / 6.3    | 6.7 / 6.2 / 6.2    | 8.5 / 7.3 / 8.5    |
| rubric on paper / wash / popover                       | 5.5 / 5.2 / 5.7    | 6.9 / 6.4 / 6.4    | 6.0 / 5.2 / 6.0    |
| danger on paper / wash / popover                       | 7.5 / 7.0 / 7.8    | 7.3 / 6.8 / 6.8    | 8.2 / 7.0 / 8.2    |
| warning on paper / wash                                | 5.7 / 5.3          | 9.5 / 8.9          | 6.2 / 5.3          |
| success on paper / wash                                | 6.3 / 5.9          | 9.3 / 8.7          | 6.8 / 5.9          |
| ink / muted ink / rubric on accent (a highlighted row) | 15.0 / 5.7 / 5.2   | 11.0 / 5.6 / 5.7   | 15.7 / 7.3 / 5.2   |
| ink on highlight (a match)                             | 14.6               | 6.8                | 15.3               |
| ink on the selection (rubric 18 % on paper)            | 12.5               | 10.3               |                    |
| paper on ink (a solid button)                          | 16.0               | 13.3               |                    |
| danger / warning / success on their soft tint          | 6.7 / 5.1 / 5.7    | 6.2 / 8.1 / 8.0    |                    |
| a field's edge (`input`) on paper / popover, non-text  | 3.4 / 3.5          | 3.7 / 3.4          |                    |
| the focus ring (ink) on paper / wash, non-text         | 16.0 / 15.0        | 13.3 / 12.4        |                    |

Hairlines (`rule` 1.3:1, `rule-strong` 1.7–2.1:1) are separations, never the only edge of a control
that needs one.

**Rubric is allowed for exactly**: the wordmark's first letter; section rubrics (numbers and names in
the margin); page marks (signes de renvoi) in the text and the gloss; the in-scope ¶ and the
inbox's "new" count; link underlines (the `link` utility: ink, a rubric underline at 55 % that firms
on hover); the text selection (18 %); the 2 px bar of the highlighted row in menus and the palette;
the reading-progress line. Never a fill, never a button, never in charts.

**Mixing colours**: `color-mix(in oklab, …)`, never `in oklch`. Tailwind ships the tokens as `lab()`,
and a near-neutral one mixed in oklch loses its hue (the result turns pink).

Do not invent colours: add a token here and in globals.css (light, dark and print).

### 3.2 Typography

| Face                                       | Package (OFL)                   | Files                                                                                                | For                                                                                                     |
| ------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Serif: Source Serif 4 (`font-serif`)       | `source-serif` 4.5.1 (Adobe)    | Variable Roman and Italic (`.ttf.woff2`, 429 + 347 kB): weight 200–900, optical size 8–60; preloaded | Every word that is read: titles, prose, lists, quotes, summaries, abstracts, glosses, citations, labels |
| Sans: IBM Plex Sans Variable (`font-sans`) | `@ibm/plex-sans-variable` 0.2.0 | Roman and Italic (230 + 262 kB): weight 100–700, width 85–100 %; preloaded                           | Navigation, buttons, inputs, menus, the status line, meta, table bodies, fact values (the default)      |
| Mono: IBM Plex Mono (`font-mono`)          | `@ibm/plex-mono` 2.5.0          | Regular and Medium (49 + 50 kB), not preloaded                                                       | Commands, keys, paths, hashes, file names, DOIs in tables. Nowhere else                                 |

- The official builds, not fontsource's (which strip small caps and old-style figures): the serif
  has smcp, c2sc, onum, lnum, pnum, tnum, sups, frac and Latin Extended, Greek letters, ≈ ≤ ≥ ± ×
  − µ ‰. `next/font/local` loads them from `node_modules` (offline after `npm ci`); the CSS names are
  `--font-serif`, `--font-sans`, `--font-mono` (fed by next/font's `--font-source-serif`,
  `--font-plex-sans`, `--font-plex-mono`, set on `<html>` by `fontVariables`).
- `html { font-synthesis: none; font-kerning: normal }`: no fake bold, italic or small caps, ever.
  Regular text weighs 400 on light paper and 380 on dark (`--weight-regular`; `font-normal` follows).
- The IBM packages' postinstall runs IBM's telemetry (on CI and in containers). The app sends none:
  `@ibm/telemetry-js` is overridden by `scripts/no-telemetry` (an `ibmtelemetry` that does nothing),
  installed as a copy (`install-links=true` in `.npmrc`, so its command exists when theirs runs).

**One scale** (`text-display`, `text-title`… set the size and the line height together; `cn`
knows them). Every size of the app is one of these: no `text-[…]`, `text-xs`, `text-base` or
`text-lg` (one exception: a phone's text field is 16 px, below which iOS zooms in).

| Token   | px / line           | Face                                      | Use (utility)                                                                   |
| ------- | ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| display | 34/38 (phone 26/30) | serif 600, −0.005em                       | An article's title (`display`)                                                  |
| title   | 22/28               | serif 600                                 | A page's h1, a section's h2, the reading pane's title (`title`)                 |
| lede    | 20/29 (phone 18/27) | serif 400                                 | The one-liner, Today's opening sentence (`lede`), the wordmark                  |
| read    | 17/27               | serif 400                                 | Prose and field values (`reading`), the reader's passages, dialog titles        |
| note    | 15/22               | serif 400                                 | Descriptions, one-liners and cite lines in lists, search passages in the list   |
| item    | 15.5/21             | serif 600                                 | Titles in lists, rows, the palette (`item-title`)                               |
| gloss   | 13.5/19             | serif 400                                 | Margin notes and quotes, facts values, captions (`gloss`)                       |
| ui      | 14/20               | sans 400/500/600                          | The interface (`text-sm` is the same)                                           |
| table   | 13.5/19             | sans at 92 % width                        | Table bodies (`<Table>`)                                                        |
| small   | 12.5/17             | sans                                      | Meta, authors, sources, the phone's tab labels (`text-small`)                   |
| label   | 13.5/18             | serif 600, all small caps, +0.05em, muted | Every label, table head and kicker (`label`; `eyebrow` is its deprecated alias) |
| kbd     | 12/16               | mono or sans                              | Key caps, file names and keys in mono (`text-kbd`)                              |

One measure for sentences: `max-w-measure` or `measure` (34 rem, `--measure`); tables and figures
may go wider. Rhythm: paragraphs 20 px apart, fact rows 6 px, sections 48 px. No hyphenation in a
list narrower than 30 rem (`hyphens-none` on it); reading text hyphenates words of 8 letters or
more, 4 before and after the break (`hyphenate-limit-chars: 8 4 4`).

**OpenType per role** (utilities in globals.css):

- `reading`, `lede`, `gloss` (and `blockquote`): the serif, old-style proportional figures, optical
  sizing, `text-wrap: pretty`, hyphenation (`hyphenate-limit-chars: 7 3 3`).
- `display`, `title`, `item-title`: lining proportional figures, `text-wrap: balance`.
- `label`: the serif's small caps. `ac` (on `<abbr>`): an acronym in serif text as all small caps,
  +0.04em. `cite`: `.au` (surnames) in small caps, `<i>` (the venue) in the serif's italic.
- `num`: lining tabular figures (tables, counts, priors, the pager). `mono` (and `code`, `kbd`,
  `samp`): the mono at `max(0.875em, 12px)`, no ligatures.
- No face has ★ or ↵: ★ in any text drawn through `<Typeset>` / `<InlineContent>` is an SVG
  (`StarGlyph`, `@/components/content/typeset`; its character kept for screen readers and
  copying), and `↵` in a `<Kbd>` or a key cap is drawn (`EnterGlyph`, `@/components/ui/kbd`).

**Typesetting at render** (`typeset(text, lang?)` and `typesetParts(text, { lang, acronyms })` in
`@/lib/typeset`; `<Typeset text lang? acronyms? />` in `@/components/content/typeset`; the inline
renderer applies it to its text). The data stays as written; the page gets: `4 × 64` (no-break
spaces round ×; `0x1F`, `a 2x faster`, `the x axis` stay; `4 plots × 64 sensors` and
`−4.5 × RMS` too, the glue kept short there: a line may break before × and before a unit word after
its figure, so a narrow table cell never cuts a word), `±` for `+/-`, the minus sign before a
figure, en dashes in ranges (`4–10`, `P1–P4`, `Fig. 2a–d`; not ISO dates `2023-08`, chains
`978-3-16` or identifiers `S12-3`, `COVID-19`), the dash held to the figure after it and a hyphen
after a figure, or after a unit, held to its word (`14–33%`, `125,000-word`, `1.5 mm-length`: a word
joiner, U+2060, since the serif has no non-breaking hyphen; `copyText` drops it), a no-break space
between a figure and its unit (`50 ms`, `30 kHz`, `12 sensors`), after `p.`, `pp.`, `§`, `Fig.`,
`Table`, `Eq.` and the words that number (`Participant 1`, `plot 4`, `day 5`, `session 3`,
`Figure 2`), around a comparison (`p < 0.05`), `mm²`, `1.2 × 10⁻⁵` (from `1.2e-5`, and from a power
written out: `× 10-09`, `x 10^-4`), `…`, an author list's `, … ,` as `…` and `(12 authors)` as a
muted `· 12 authors`, ’ and ‘ ’ “ ” by their side, and in serif text acronyms (`GPS`, `NDVI`,
`RNN/CNN/LR` three times; the plural s outside; not `LiDAR`, `qPCR`, `S4ND`, names joined to a
figure `COVID-19`, `CIFAR-10`, `ISO-8601`, Roman numerals or text all in capitals) as
`<abbr class="ac">`. French (`lang: "fr"`, from `guessLang`): a narrow no-break space before
`; : ! ? %` and the closing guillemet, after the opening one (not in `12:30`), between thousands
written with a space (`131 000`), straight double quotes as guillemets. Never inside code, URLs, DOIs, e-mail addresses, identifiers (PMID,
arXiv), paths or file names, wherever they appear; a link whose text is one is drawn as written.
`typeset` returns a plain string (superscripts in Unicode) for titles, labels and copied text;
`typesetParts` the parts for a renderer of one's own. It is idempotent; `src/lib/typeset.test.ts` is
the table of rules and exceptions.

### 3.3 Layout, shape and surfaces

- **Two grids.** Every page renders inside the shell's `<Page>` on one of two grids: `full` (the
  window's width at the page gutters, 16 px and 32 px from 768 px: a hub, the inbox, the search) or
  `glossed` (the glossed grid's width, centred, `glossGrid`: an article, Today, a page not found;
  `reading` is its former name). `PAGE_GUTTERS` gives the gutters to a frame of one's own (the
  inbox's window-tall frame); the top bar has the same. `width="page"` (76 rem) is deprecated.
- `--header-height` is 3 rem (the 48 px top bar); `html` has the matching `scroll-padding-top`
  (plus `--toc-bar-height` while an article's slim bar shows), so `#section` anchors land below it.
- **Shape**: radius 0 for content (figures, tables, quotes, rows: nothing to add), 4 px for controls
  (`rounded-lg`, `--radius`; every larger radius is 4 px too, so no class makes a pill).
- **Surfaces**: the page is paper and nothing on it is raised: hairlines and space separate things.
  Only popovers, menus, dialogs, sheets and the palette rise (`bg-popover shadow-popover`: a hairline
  and `0 8px 24px` at 8 % on light paper; a hairline all round and 40 % on dark). No backdrop blur:
  scrims are a plain warm tint.
- **Tables** (`<Table>`, `@/components/ui/table`): the sans at 13.5/19 and 92 % width, heads as
  labels over an ink rule, rows on hairlines with the wash on hover, never zebra;
  `<TableHead numeric>` / `<TableCell numeric>` right-aligned in `num`; the container scrolls
  sideways with `scroll-shadow`.
- **Layout utilities**: `scroll-shadow` (Lea Verou's scrolling shadows: a box that scrolls sideways
  says so at its edges); `clamp-fade-2`, `clamp-fade-3` (or `--clamp-lines`) and `truncate-fade`
  (cut text fades on its last line instead of "…", and only when it is cut: the shell's
  `ClampObserver`, one ResizeObserver for every such box, measures each once per layout and sets
  `data-clamped`, where a static mask applies; no animation per box); `sticky-edge` (a
  sticky bar's hairline once the page has scrolled, static where scroll timelines lack);
  `reading-progress` (a 1 px rubric line that grows with the page's scroll); `focus-inset` (the
  focus outline drawn 2 px inside); `print-wide` (a landscape A4 page in print).
- Breakpoints: 360 px phones and up; `md` (768 px) separates phones; the glossed grid starts at
  1024 px (one margin) and 1280 px (both margins).

### 3.4 Interaction

- **The shell** (`src/components/shell/`) has no sidebar and no breadcrumb. A 48 px sticky top bar
  (`top-bar.tsx`), opaque paper, its hairline appearing once the page has scrolled (`sticky-edge`):
  the wordmark (`APP_NAME` in serif small caps, its first letter in rubric; never a hard-coded
  name), then Today · Inbox · the bibliographies by short name with their counts (their width held
  from the last visit while the library loads, so nothing pops in), then the word "Search" and a
  muted ⌘K (no box; none on the search page, whose field is the page), `?` and the theme. The
  inbox's count is the latest run's new papers in rubric (none new: the waiting ones, muted; the
  link's title says both), from `@/lib/inbox-views`, this session's decisions counted. The
  bibliographies fold into one "Library ▾" menu below 1180 px, beyond five, or when their names do
  not fit (`bibsFitInline`, `nav-model.ts`). The current page's link is ink 600 over a 2 px ink rule
  (`aria-current="page"`); an article marks its bibliography (`aria-current="true"`).
- **Phones** (< 768 px): the wordmark and Search on top; a tab bar at the bottom (`bottom-bar.tsx`:
  Today · Inbox · Library · Search, 56 px plus the safe area, 48 px targets, an icon over each
  label, the inbox's new count in its label, "Inbox 26"; Library opens a sheet of the
  bibliographies and the theme). The viewport is
  `viewport-fit=cover`; `<main>` pads itself above the tab bar, and the status line and toasts sit
  above it.
- **Focus on page entry.** Each arrival on a page (a link, Back, a `g` chord, the palette; not a
  filter, a sort or the inbox's next paper: `entryKey`, `@/lib/routes`) moves the focus to the
  page's main object without scrolling, so its keys work at once and Tab starts in the content. By
  default the shell focuses the page's h1 (made focusable, no ring: it is no control), waiting for
  it while the library loads. A page with a better object says so (`@/hooks/use-entry-focus`):
  `useEntryFocus(target, { ready })`, `target` a ref or a function finding the element (the current
  row of a list); `ready: false` while the rows are not drawn (the page keeps its claim, and focuses
  them once drawn). The focus never moves once the reader has put it somewhere since arriving. Today
  focuses Start triage (Enter starts it; on a touch screen, or with nothing to decide, the sentence),
  or the link the reader left by; a hub its current row (its h1 on a phone); the search its current
  passage (else its field); the inbox its current paper; an article its h1 (or the section of the
  URL's hash). That focus shows no ring until the reader's first key (`focusEntryTarget`). A jump
  from the palette is an arrival like any other: the palette gives the focus back only when it led
  nowhere (`takeReturnFocus`; after a jump, to what the page focused, even within the same page:
  the inbox's paper named by `?p=`).
- **List memory.** `useListMemory(key?)` (`@/hooks/use-list-memory`) keeps a list's current row and
  scroll position per URL (without the inbox's `p`; this tab's sessionStorage) and gives them back
  on a return: Back, Forward, a reload, or Esc from an article. `memory.restored` (the row and
  scroll position, or null on a fresh visit) chooses the starting row; `memory.remember(row)`
  follows it; the scroll comes back by itself once the list is tall enough again (never against the
  reader's own scrolling). With `useEntryFocus` on the restored row, Back lands on the row the
  reader left.
- **Where an article comes from** (`from`). A list's links to articles carry the list:
  `routes.article(bib, key, section, { from: useFromHere() })`; the list also says its order,
  `rememberListOrder(from, refs)` (`<bib>/<key>` refs, as on screen). The article reads
  `parseFrom(from)` (`@/lib/routes`: only an internal URL of a list route counts) for its folio and
  kicker, `readListOrder(from)` for `[` / `]` (null: page within the bibliography), and
  `useReturnToList()(from, currentRef)` for Esc (Back when the list is the previous page, else a
  push treated as a return, the list's row set to the article shown). Page within it with
  `router.replace`, so Back and Esc still lead to the list.
- **The status line** (`StatusLine`, `useStatusLine()`, `@/components/shell/status-line`): one
  polite line (`role="status"`) for what the app has to say — a decision and its Undo, a failure and
  its Retry — instead of stacked toasts. `show(message, { action, tone, ttl, wrap })` replaces the
  current message (`action`: `{ label, key, onAction }`; `tone`: `"neutral"` or `"danger"`); neutral
  messages go after 8 s (held while pointed at or focused), danger ones stay until replaced; a
  neutral message is one line, cut, a danger one (or `wrap: true`) takes the lines it needs. A page
  places `<StatusLine />` where its messages belong (the inbox: at the foot of its list column);
  elsewhere the shell shows it bottom left, on a slip of the popover's surface. Inbox decisions
  speak only here (section 5.3), and their line outlives the inbox page. The action's `key` is shown
  and named (`aria-keyshortcuts`); the page handles the key, in its own scope. sonner stays for rare
  app-wide messages: bottom left, never over a reading pane.
- **Focus ring**: one, everywhere: 2 px of ink, 2 px out (`:focus-visible`, globals.css); inside
  menus and the palette the highlighted row is the wash and a 2 px rubric bar; the current row of a
  list in a page (a hub's table, the search's passages, the inbox's papers) is the wash, and its
  focus a 2 px ink bar on its left edge (no box around a row). Never remove an outline without a
  replacement.
- Overlays (dialog, alert dialog, sheet) are a plain scrim, never a backdrop blur (it repaints the
  page behind on every change: slow keystrokes in the palette).
- A dialog opened without a Radix trigger (a shortcut, a URL param, the header's own toggle) gives
  the focus back where it was: `useRestoreFocus()` (`@/hooks/use-restore-focus`) on its content's
  `onOpenAutoFocus` / `onCloseAutoFocus`; the palette records it in its context as it opens.
- Motion: the tokens of globals.css (`--ease-out`, 90 / 150 / 200 / 240 ms); exits faster than
  entrances; `prefers-reduced-motion` turns animations off globally.
- **Keyboard.** The app's keys (`global-keys.tsx`, listened to before the page's): `g t` Today,
  `g i` Inbox, `g s` Search, `g 1`…`g 9` the bibliographies in the top bar's order (a chord waits 1
  s for its second key; a second key that means nothing is swallowed, so `g a` never accepts a
  paper); `/` focuses the page's filter (an input marked `data-page-filter`) or, on a page without
  one, opens the palette; ⌘K / Ctrl+K the palette (shell); `?` the **one** shortcuts dialog
  (`src/components/shell/shortcuts.tsx`), which lists the page's keys, then the app's. None of them
  acts while typing, over a dialog or a menu, with a modifier, or held down (`isGlobalKey`); a field
  of a dialog fading out is no longer typing (Esc then `?` at once opens the shortcuts). `g` is
  reserved: no page binds it alone. A page declares its keys with `usePageShortcuts(SECTION)` (a
  module constant; `legend` explains its signs) and handles them itself; a "Shortcuts" button calls
  `useShortcuts().show`. Every page shortcut follows `@/lib/keyboard`: `isPlainKey(e)` (a key the
  shell took is `defaultPrevented`), not `isTypingTarget(e.target)`, not while `overlayOpen()`; and
  is named on its control with `aria-keyshortcuts` (a chord is not: the attribute has no syntax for
  a sequence). **A single-letter key that changes something is scoped (WCAG 2.1.4)**: the inbox's
  `a r u x o p j k / Enter` work only with the focus on a paper (or inside the list), in the reading
  pane, or on nothing in particular (the page, `#main`); on any other control (the top bar's
  buttons, a menu) a letter does nothing. The app's keys only move the reader (they change nothing),
  like `?`. A key held down (`e.repeat`) never decides twice. Show the modifier with `useModKey()`
  (⌘ on Apple systems, Ctrl elsewhere) or `<Keys keys={["mod", "K"]} />` (`sequence` for a chord);
  keyboard hints carry `data-kbd-hint` (hidden on touch screens).
- Icons only where the icon is the label (the top bar's right group, the tab bar): lucide, `size-4`
  in controls, decorative ones `aria-hidden`; an icon-only button has an `aria-label`.
- Print: paper is light whatever the theme (globals.css resets the dark tokens under `@media
print`); chrome marked `data-print="hide"` or `print:hidden` stays off the page.

### 3.5 Shared patterns (never copy one into a feature)

| What                                             | Use                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A notice about an article                        | `<SeriousNoticeBadge notices />` in lists, `<NoticeBadges notices />` (every one, serious first, a middle dot between) (`@/components/content/notice-badge`): the word in small caps, danger or muted ink, no pill, no icon; words from `noticeLabel` / `noticeSentence`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| A draft                                          | `<DraftBadge />`: "Draft" in small caps, warning ink.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| A word as a badge                                | `<Badge variant="default" \| "secondary" \| "destructive" \| "warning" \| "success" />` (`@/components/ui/badge`): small caps in the variant's ink, no fill, no frame.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| An inbox paper's relevance                       | `<RelevanceMark value showLabel? />` (`@/components/content/relevance`): the gutter mark, the ¶ (rubric) only for in scope (3), an ink • related (2), a muted · loosely (1), a muted ring unrelated or not rated; an image named by `relevanceDescription` ("Relevance 3 of 3: In scope").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| An inbox paper's prior                           | `<PriorNote prior bibLabel words? />`: "closest to ML methods · 0.86", the number in tabular figures and a `meter` for screen readers; nothing for an unscored paper. Laid out as text: in a narrow margin the words wrap and "· 0.86" stays whole.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A page reference                                 | `<PageMark page doc? href?>p. 5</PageMark>` (`@/components/content/page-mark`): rubric, no underline, its context's face and figures (old-style in prose, lining in a sans cell), a link to the PDF at that page, `data-page` from `pageKey()` ("5", "SI 15") to pair text and gloss; a 44 px target on touch screens. `pageRefOf(text)` finds one in a text ("Table 1 (p. 4)" → "p. 4"); `<InlineContent>` draws a link part whose text is a page reference as a page mark.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Text from the data                               | `<InlineContent parts context? lang? acronyms? />` (`@/components/content/inline`; typeset, page marks, `cell` puts sub-lines on their own line and marks no acronyms); a plain string: `<Typeset text lang? acronyms? />` or `typeset()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A citation line                                  | `<CiteLine card separator? venue? />` (`@/components/content/cite`): surnames in small caps, the venue in italic; `<FullReferenceText card />`: the full reference in Nature's style, "Jumper, J. et al. Highly accurate protein structure prediction with AlphaFold. _Nature_ 596, 583–589 (2021)."; `referenceParts` (the short lead "Jumper et al. 2021"), `fullReference`, `formatReference` (`@/lib/cite`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Citing an article                                | One rule for a page, everywhere (`citePlace(card, { page, file? })` → `{ words, latex }`, `@/lib/cite`): the PDF published and `journal_offset` known → the journal page ("p. 585", `\cite[p.~585]{key}`); a manuscript (`version` accepted or submitted, `isManuscript`) → "manuscript p. 2", `\cite{key} % manuscript p. 2`; otherwise "PDF p. 2", `\cite{key} % PDF p. 2`; a supplementary file names itself (`file`: "SI 1, p. 15", `\cite[SI~1, p.~15]{key}`). `quoteWithCitation(words, card, place?, { quote? })`; `<CiteMenu card place? keyHint? open? onOpenChange? />` (`@/components/content/cite-menu`): the key, the `\cite` at the place, the BibTeX entry (every author, volume, number, pages: `bibtex(card)`), the full reference; choosing one copies it and the trigger says "Copied" at its own width (a short "Cite" shows ✓ alone). `latexCite(key, page?)` only for a page already the journal's. |
| Copying text                                     | `<CopyButton value label? what? iconOnly? keyHint? />` (`@/components/content/copy-button`): the icon crossfades to a check and the label to "Copied" (120 ms), back after 1.2 s, no toast; `useCopy()` for a control of one's own; underneath, `copyText()` (`@/lib/clipboard`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| A command to type                                | `<CliCommand command={commands.…} />` (the mono on the wash, a copy control), `<InlineCommand>` in a sentence (`@/components/content/cli-command`); the text always from `commands` (`@/lib/site`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Dates, venues, counts                            | `formatDate` ("23 Aug 2023"), `formatShortDate` ("1 Nov", the year when it is not this one), `relativeDay` ("today", "yesterday"), `formatDateTime` ("07:45, 10 Nov 2026"), `shortVenue` ("arXiv (Cornell University)" → "arXiv"), `formatCount`, `formatNumber` (`@/lib/format`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Records the data could not read                  | `<DataProblems only? />` (`@/components/shell/data-problems`): a note like `Alert` (a hairline on its left, no box, no icon) listing them, the details one click away (Today: all; a hub: its own; the inbox: its papers).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Text in another language                         | `lang={guessLang(text)}` (`@/lib/lang`) on triage summaries, "why" lines, abstracts and titles: "de", "es", "fr", "it" or "pt" from the short words every sentence uses, else none (English); pass the same to `typeset` / `<Typeset lang>` for its spacing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Empty, error, not found                          | `Empty` (`@/components/ui/empty`): a sentence in the serif saying what to do (`EmptyTitle`, `EmptyDescription`, an action in `EmptyContent`), no box, no icon; `DataErrorNotice`, `NotInLibrary` (its title is the page's `h1`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A note in a page                                 | `Alert` (`@/components/ui/alert`): a hairline on its left, the words in ink or danger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| A card on hover or focus                         | `HoverCard`, `HoverCardTrigger`, `HoverCardContent` (`@/components/ui/hover-card`): the popover's surface after a 350 ms rest (the article's in-collection links); the trigger works the same without it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Wide and phone layouts                           | `useWideLayout()` (≥ 1280 px: a list and a reading pane), `useIsMobile()` (< 768 px), `useMediaQuery(q)` (`@/hooks/use-media-query`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| An inbox paper's status                          | `statusOf(paper, useOverrides())` (`@/lib/inbox-decisions`): this session's decisions count everywhere.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| An inbox decision                                | `decideWithUndo(ids, decision, words)` (`components/inbox/decide.ts`): queued and said in the status line with an Undo (`u`), then sent; a failure is said in danger with a Retry (section 5.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Deprecated (they draw the new look; retire them) | `RelevanceStars` (→ `RelevanceMark`), `Stars` (→ `RelevanceMark`), `MeterBar` (draws nothing), `PriorMeter` (→ `PriorNote`); the `eyebrow` utility (→ `label`); `EmptyMedia` (draws nothing); the `*-soft` tints.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### 3.6 Motion, states, touch and print

- **Motion tokens**: `--ease-out` cubic-bezier(0.2, 0, 0, 1) (also Tailwind's `ease-out` and the
  default transition), `--ease-in-out` (0.65, 0, 0.35, 1), `--ease-in` (0.4, 0, 1, 1) for exits;
  `--dur-press` 90 ms (press, exits), `--dur-hover` 150 ms (hover, menus, popovers; the default
  transition), `--dur-dialog` 200 ms (dialogs, sheets), `--dur-panel` 240 ms (a row's collapse,
  panels). Animations: `animate-pop-in` / `animate-pop-out` (popovers, menus, selects: opacity,
  scale 0.97 and 4 px from the trigger's side, from the trigger; 150 in, 90 out),
  `animate-dialog-in` / `animate-dialog-out` (200 in, 120 out, scale 0.98), sheets slide (200 in, 120
  out), the ⌘K palette opens at once and fades out in 90 ms (`<DialogContent motion="instant">`,
  automatic around a cmdk palette), `animate-fade-in` / `animate-fade-out`, `animate-skeleton-in`
  (a skeleton shows after 200 ms: a fast load shows nothing), `animate-indeterminate` (a 2 px
  loading line). Exits are faster than entrances; nothing bounces; never animate a layout's width
  or height (collapse a row with `grid-template-rows: 1fr → 0fr` and opacity).
  `prefers-reduced-motion` turns it all off.
- **States**: hover never lightens a control (a quiet button darkens its hairline, a solid one its
  ink); pressed is darker than hover and sinks 0.5 px (buttons under 32 px scale to 0.98 instead);
  `transition: transform 80ms, colours 120ms`. Buttons (`@/components/ui/button`): `default` and
  `outline` quiet (hairline, ink words), `solid` (a 1 px ink outline and semibold ink words: one main
  action per view; no fill of ink, never a slab of light in dark mode),
  `secondary` (the wash), `ghost`, `link` (ink, rubric underline), `destructive` (danger words).
- **Focus**: one outline everywhere, 2 px of ink 2 px out (`:focus-visible`, globals.css). Fields
  draw it on their edge (−1 px), tabs and segmented options inside (−2 px, `focus-inset`); rows of
  menus, selects and the palette show the wash and a 2 px rubric bar instead; the rows of a page's
  lists the wash and a 2 px ink bar. No `ring-*` focus; a pointer click leaves no ring (a tab
  focused by Radix on mousedown included: `ui/tabs`). The focus a page gives itself on arrival
  shows no ring (`focus({ focusVisible: false })`, `data-entry-focus` until the first key): the
  current row's wash says where it is.
- **Selection** is the rubric at 18 %. **Search matches** (`<mark>`) are a highlighter stroke under
  the words (`box-shadow: inset 0 -0.42em 0 var(--highlight)`), no padding, no width change.
- **Touch** (`pointer: coarse`): buttons, toggles, tabs, select triggers and fields at least 44 px
  tall; icon buttons 44 × 44 with 20 px glyphs; a checkbox's hit area 44 px; inline links 6 px more
  above and below without moving the lines; a row marked `data-touch-row`, and a button, take the
  wash while pressed; a page mark's target is 12 px taller and 6 px wider each way. Keyboard hints
  hide on touch screens.
- **Key chips** (`<Kbd hint>`, `data-kbd-hint`) show only while their control is hovered or has the
  keyboard's focus (opacity: the room is kept); the shortcuts dialog and the palette's footer show
  theirs always, as does a container marked `data-kbd-always`.
- **Print**: light paper whatever the theme (the tokens reset under `@media print`); chrome marked
  `data-print="hide"` or `print:hidden` stays off the page. Every printed page has its furniture: the
  folio bottom right ("3 / 12") and a running head top left from `--print-head` (a CSS string a page
  may set on `<html>`: `style.setProperty("--print-head", JSON.stringify(title))`). A4, white paper
  (`color-scheme: light`), every `clamp-fade-*` / `truncate-fade` box whole (not the hub's table
  cells, `data-clamp`: their rows keep the Rows setting's lines), `thead` repeated on each page. A
  wide table asks for the landscape page with `print-wide` (`@page wide`: A4 landscape, 12 × 10 mm
  margins). An article prints its folded detail closed but Key metrics' full table
  (`data-print-open`).
- **The app's mark**: APP_NAME's first letter in the serif's semibold, rubric on paper in a 1 px ink
  frame (`src/app/icon-svg.ts`; the capitals' outlines in `icon-glyphs.ts`, from Source Serif 4
  SmText, since an icon cannot load a web font). `icon.tsx` writes `/icon/mark.svg` (its dark
  colours inside, by `prefers-color-scheme`) and `/icon/mark.png` (32 px); `apple-icon.tsx`
  `/apple-icon/mark.png` (180 px, unframed: the system rounds it). The ids carry the extensions, so
  the export's files are served with their types.
- **Toasts** (sonner's `<Toaster>`, `@/components/ui/sonner`): app-wide messages only (a decision
  speaks in the status line), bottom left, one line, no close button, no icon but a pending
  spinner, 200 ms in and 120 out.

## 4. Folder structure and features

```
web/
├── ARCHITECTURE.md  README.md  AGENTS.md
├── next.config.ts  tsconfig.json  eslint.config.mjs  .prettierrc.json  components.json
├── vitest.config.mts  vitest.setup.ts  playwright.config.ts
├── scripts/serve-fixture.mjs        glossator serve + out/ + the synthetic library (e2e, demos)
├── tests/
│   ├── fixtures/library.json        the synthetic library (invented content, real shapes)
│   ├── utils/                       renderWithApp, setNavigation, fixtureLibrary
│   ├── unit/                        tests of the configuration (next.config's phases and rewrites)
│   └── e2e/                         Playwright: test.ts (API mocked), <feature>.spec.ts, integration.spec.ts
└── src/
    ├── app/
    │   ├── layout.tsx  globals.css  fonts.ts  error.tsx  global-error.tsx              shared
    │   ├── icon.tsx  apple-icon.tsx  icon-svg.ts  icon-glyphs.ts   the app's mark      shared
    │   ├── page.tsx  not-found.tsx                                                     overview
    │   ├── bib/page.tsx                                                                hub
    │   ├── article/page.tsx                                                            article
    │   ├── search/page.tsx                                                             search
    │   └── inbox/page.tsx                                                              inbox
    ├── components/
    │   ├── ui/          shadcn's components, restyled (section 3); table, hover-card   shared
    │   ├── shell/       providers, the top bar and the phone's tab bar (nav-model),    shared
    │   │                the app's keys, entry focus, the status line, the shortcuts
    │   │                dialog, boundaries, Page and its grids, skeletons, errors,
    │   │                the clamp observer
    │   ├── content/     the data's look: inline parts, typesetting and its glyphs,     shared
    │   │                page marks, citations, the full reference and the Cite menu,
    │   │                copy buttons, notice badges, relevance marks and priors
    │   ├── overview/    Today (/) and the 404                                          overview
    │   ├── article/     the article view, its glossed grid and the block renderer      article
    │   ├── hub/         a bibliography's tables and the preview drawer                 hub
    │   ├── search/      the search page and the ⌘K palette (command-palette.tsx)      search
    │   └── inbox/       the triage: views, list, reading pane, decisions               inbox
    ├── hooks/           use-mobile, use-media-query, use-mod-key, use-document-title,  shared
    │                    use-restore-focus, use-entry-focus, use-list-memory (and the
    │                    `from` helpers), page-entry (the arrivals they read)
    └── lib/
        ├── data/        schema, loader, index, hrefs, text, article search             shared
        ├── api.ts       typed API clients                                              shared
        ├── routes.ts    every internal URL; page entries; `from`; legacy hashes        shared
        ├── url-state.ts nuqs parsers of the routes' params                             shared
        ├── inbox-views.ts      the inbox's views and their counts                      shared
        ├── labels.ts    relevance and notice wording                                   shared
        ├── inbox-decisions.ts  the session's inbox decisions, the API probe           shared
        ├── inbox-order.ts      the inbox's order ("first in line")                    shared
        ├── keyboard.ts  key rules, `g` chords; clipboard.ts format.ts lang.ts          shared
        ├── typeset.ts   the typesetting pass; cite.ts references, BibTeX, \cite        shared
        ├── site.ts      CLI_NAME, APP_NAME, DECISION_HEADER, commands (the names)      shared
        └── utils.ts     cn(), taught the theme's tokens                                shared
```

- What each feature's folder holds:
  - `overview/`: Today (`/`) and the 404: `today-view`, `today-data`, `today-grid` (the glossed
    grid's width, `TODAY_PAGE_WIDTH`, in three columns every section shares: the hang for marks and
    years, the measure, the counts), the `today-*` sections, `not-found-*`.
  - `hub/`: the tables (TanStack v9), their toolbar and filters in the URL (the Rows choice
    remembered per bibliography), the phone's rows, the exports (the table, and the headline
    metrics one row each, as CSV / Markdown / LaTeX), cells clamped at a word with their own print
    clamp (`data-clamp`, `data-cut`), and the preview drawer: a non-modal Sheet given `role="region"`, so global keys work
    while it is open; the row keeps the focus; Esc returns to the row. Its links carry the list
    (`from`) and remember its order as `<bib>/<key>` refs.
  - `article/`: the headline metrics as sentences in the text column, each with its source note in
    the margin, the whole table under "All n metrics" (`m` opens it); quotes and sources sit in the
    margin as `[data-gloss-note]` beside the text they follow (`segmentBlocks`); marks of the same page in a section light each other
    (`usePageMarks`: `data-page`, `data-lit`); the slim bar (40 px, `#article-toc-bar`) shows once
    the title scrolls away and sets `--toc-bar-height`; `c` opens the visible Cite menu; Esc closes
    what is open first, and returns to the list only when the article has one (`from`).
  - `search/`: the search page (the field and the filter sentence; results grouped by article; a
    40/60 reader at ≥ 1280 px, a sheet below; keys ↑↓ Enter p c y Esc; recent searches in
    sessionStorage, else three example queries from the library's titles, `examples.ts`) and the ⌘K
    palette; `snippet.ts` turns the server's snippets and flattened record passages into readable,
    labelled text, and a copied quote is whole sentences of the passage shown; a referee report is
    labelled so; a metric hit is drawn from the article's Key metrics row.
  - `inbox/`: the views and filters (the focus back on the current paper after any of them), the
    list (`paper-list`, `paper-row`; a group's "Select n", Shift+X), the reading pane, the decisions
    (`decide.ts`; several failures said as one line with "Retry all"), the print list.
- A feature's code stays in its directories. What two features need goes in the shared ones
  (`content/`, `shell/`, `hooks/`, `lib/`), never copied: one wording, one badge, one store. A change
  to a shared piece keeps every feature's tests green (`npm run check`, then the e2e suite).
- Each route's `src/app/<route>/page.tsx` is a server component that wraps the feature's view in
  `<LibraryBoundary fallback={<PageSkeleton variant="…" />}>`; the view is
  `src/components/<feature>/<name>-view.tsx`.
- The ⌘K palette is the search feature's `src/components/search/command-palette.tsx`, exporting
  `CommandPalette`; the shell mounts it and owns its open state (`useCommandPalette()`).
- Shared feature-free pieces live in the shell: `Page` and `PageHeader` (title, `meta`,
  `description`, `actions`; no eyebrow), `glossGrid` and `PAGE_GUTTERS` (the two grids),
  `PageSkeleton` (`today`, `hub`, `article`, `search`, `inbox`: each page's own grid, shown after
  200 ms; Today's is its own frame, the inbox's its window-tall frame; each on its page's grid),
  `NotInLibrary` (a route naming nothing), `DataErrorNotice` and `ErrorText` (an h1, one sentence,
  the command), `StatusLine` / `useStatusLine`, `ProfileIcon`, `ClientOnly`, `ErrorBoundary`,
  `Keys`, `usePageShortcuts`, `ClampObserver`; the data's look in `content/` (section 3.5).

## 5. Conventions

### 5.1 Code

- Files `kebab-case.tsx`; components `PascalCase`, named exports (default exports only where Next
  requires them: `page`, `layout`, `error`, `not-found`). Hooks `useThing` in `src/hooks/` (shared) or
  beside the feature.
- Imports through `@/…`; types with `import { type X }` (lint-enforced). No `any`; narrow `unknown`.
- Pages (`src/app/**/page.tsx`) are server components that only compose; views are client components
  (`"use client"` at the top). Server components never read data (there is none at build time).
- Comments only where the why is not obvious; English everywhere (UI copy too).
- Format with Prettier (no semicolons, double quotes, width 100, Tailwind classes sorted); `cn()` to
  merge classes. `cn` (`@/lib/utils`, the `cn` package's `createCn`) knows the theme's tokens: the
  sizes (`text-small`, `text-ui`, `text-label`… beside a text colour), `max-w-measure`,
  `shadow-popover`, the animations. A size of the scale is written as its token, never as an
  arbitrary value; `ui/` imports `cn` from `@/lib/utils` too. `src/components/ui/` is the design
  system's restyle of shadcn's components (section 3): never edit it for a feature (compose around
  it), and never let the CLI write over a component that is there (`npx shadcn add` replaces the
  file and its look); a new component is added, then restyled to section 3. `ui/table.tsx` is ours
  (not the CLI's).

### 5.2 Data access

```tsx
"use client"
import { useLibrary, type Article } from "@/lib/data"

export function Thing() {
  const lib = useLibrary() // suspends until loaded; throws a LibraryError on failure
  const bib = lib.bib("ml") // Bibliography | undefined
  const entry = lib.article("ml", "k") // { ref: "ml/k", bib, article } | undefined
  lib.articles // every ArticleEntry
  lib.inbox?.papers // InboxPaper[]
  lib.inboxPaper(id)
}
```

- Call `useLibrary()` only under a `<LibraryBoundary>` (every page stub has one). It renders the
  fallback on the server and while loading, then the children; an error shows a notice with Retry
  (`errorDisplay="compact" | "silent"`, or `errorFallback`, for small places).
- Types come from the schema (`Article`, `ArticleView`, `Block`, `Inline`, `InboxPaper`, `Notice`,
  `Prior`…): `src/lib/data/schema.ts` mirrors `src/glossator/sitedata.py`. Fields added later
  are optional in the data and defaulted by the schema (`notices: []`, `prior: null`,
  `triage.by: null`). An unknown block kind is skipped and an unknown inline kind read as its text.
- **Reading is tolerant per item** (`parseLibrary`, `src/lib/data/library.ts`): only the library's
  frame (version, its lists) can fail the whole load. A text field that is null reads as `""`, a
  list as `[]`; a prior's score is clamped to 0–1 and a relevance to 0–3; then each bibliography,
  hub table, article and inbox paper is validated on its own, and one that still does not match is
  left out and listed in `lib.problems` (`{kind, ref, detail}`), which `<DataProblems>` shows.
- **An article's view is validated on first use**, not at load (views are most of the data's
  bytes): `article.view` is `unknown`; read it with `readArticleView(article)` → `{ view, error }`
  (memoized per article in a WeakMap). An invalid view is that article's error state
  (`<UnreadableRecord error>`), never the library's.
- Never compute a URL by hand: `routes.article(bib, key, section?)`, `routes.bib(name, table?)`,
  `routes.search({ q, bib, scope, mode })`, `routes.inbox(paperId?, status?)` (the inbox opened on
  one paper, `?p=<id>`; pass the paper's status, from `statusOf`, so a rejected or added paper is
  shown). A data href goes through
  `resolveHref()` (only http(s), `library/…` and `#anchor` survive), a file through
  `articleFileHref()` / `libraryHref()`, a page of a PDF through `pdfPageHref()`, a search hit
  through `hitHref(hit, sectionIds)`, a DOI through `doiHref()`.
- Text of inline parts: `plainText(parts)` (titles, sorting, aria labels); accent-folding:
  `foldText()`.
- Quick search over article cards: `searchArticles(lib, query, { bib, limit })` (MiniSearch,
  memoized per library). Full text: the API.
- Inline parts are drawn by `<InlineContent parts={…} context="text" | "cell" />`
  (`@/components/content/inline`); `cell` puts sub-lines on their own line (the hub's Article cell).
  Never `dangerouslySetInnerHTML` (lint error).
- Tab titles: `useDocumentTitle(article.cite)` (static metadata names the route). It keeps its title
  when Next writes `<title>` again (a navigation, StrictMode in development) and gives the route's
  back when it unmounts.
- Dates, counts and numbers: `formatDate`, `formatDateTime`, `formatRelative`, `formatCount`,
  `formatNumber` (`@/lib/format`).

### 5.3 The API

`@/lib/api`: `searchPassages(params, { signal })`, `readPassage(ref, { wholePage, signal })`,
`getStatus({ signal })`, `decideInbox(ids, "accept" | "reject", { signal })` (sends
`X-Glossator: 1`, from `DECISION_HEADER` in `@/lib/site`). Every answer is validated.

- `ApiUnavailableError` (`isApiUnavailable(e)`): no API here (network error, a static host's HTML,
  the dev proxy failing). Hide or disable what needs it and say it once, calmly ("Full-text search
  needs glossator serve"); the rest of the page works.
- `ApiError` (`status`, message from the server): show the server's words (e.g. "no index yet: run
  glossator build").
- Abort: pass an `AbortSignal` for anything typed (search as you type: debounce ~200 ms, abort the
  previous call); `isAbortError(e)` → ignore.
- An inbox decision changes the library. **Never against a real library in tests or demos** (mock
  it, or use `npm run serve:fixture`).
- Commands in messages come from `commands` in `@/lib/site`: `build`, `serve`, `curate(bib, doi?)`,
  `check(key, bib)`, `inboxInit`, `inboxStart`, `inboxRun`, `inboxAccept(ids)`, `inboxReject(ids)`,
  `addAccepted` (the agent's `/glossator-add inbox`), `curateAccepted`. Never spell one by hand: a
  command changes in one place.
- Inbox decisions go through `@/lib/inbox-decisions` (the store and the protocol) and
  `components/inbox/decide.ts` (what the reader sees):
  1. **Queued with an Undo.** `queueDecision(ids, decision)` shows the papers decided at once
     (`phase: "queued"`) and sends nothing for `UNDO_DELAY_MS` (6 s); the status line says it
     ("Rejected ‘Graph transformers…’") with an Undo: its button, or the inbox's `u`, calls
     `undoDecision(id)`, the papers are what they were and the line says so ("Undone: … is back in
     the list"). A multi-paper decision is confirmed first (an alert dialog), then queued the same
     way.
  2. **Sent.** After the delay (`phase: "sending"`) as a `fetch` with `keepalive: true` (not
     `navigator.sendBeacon`, which cannot send the `X-Glossator` header); the line keeps its words
     without the Undo, and goes in time. Leaving the page (`pagehide`, or the tab hidden) sends
     what waits at once (`flushDecisions()`); moving to another page of the app does not: the queue
     and its line live at module level.
  3. **Answered.** The server's lines are read per id (`readDecideAnswer`): what it did is kept
     (`phase: "done"`), what it did not goes back. A **4xx** is a refusal: nothing changed, every
     paper goes back. **No answer** (network error, a 5xx, a reply that is not the protocol's) is
     an unknown outcome — some papers may be saved: the API is probed again and
     `/data/library.json` read again (the server rewrites it after each decision) to show the truth
     per paper (`kind: "checked"`); if the data cannot be read either, the papers go back and the
     line says, in danger with a Retry, that they may not be saved (`kind: "unknown"`); a refusal
     and a paper the server did not take are said the same way. Only a failed probe marks the API
     unavailable.
  4. **Overlaps.** Each override remembers its decision (`batch`): an answer only touches the papers
     its decision still owns. A paper on its way is left out of a new decision; a paper still queued
     moves to the new one (a change of mind) and the line speaks for the new decision.
  5. **One voice.** The status line (polite, atomic) is the only place a decision is announced;
     each decision replaces the line of the one before, and it outlives the inbox page (on another
     page the shell shows it in its corner). No toast. Readers: `useOverrides()` /
     `statusOf(paper, overrides)` (the inbox, the top bar's count, Today and the palette),
     `useInboxCounts(papers)`, `useApiState()` (is the decision API here?).

### 5.4 State in the URL

- What a route shows is in its search params (`src/lib/url-state.ts`: `bibParams`,
  `articleParams`, `searchParams`) read with nuqs `useQueryStates(...)`. A feature's own state
  (sort, filters, selected tab, expanded rows worth sharing) goes in the URL too, with parsers
  defined in the feature (`parseAsStringLiteral`, `parseAsArrayOf`…, `.withDefault()` so defaults
  stay out of the URL). Typing in a box: `throttleMs`/`limitUrlUpdates` and `history: "replace"`.
- Ephemeral UI state (an open popover, a hover) stays in React state.
- Article sections are the hash (`#details`), not a param.
- Anything reading search params sits under a Suspense boundary (`LibraryBoundary` is one).

### 5.5 Errors, empty and loading states

- Loading: the page's `PageSkeleton` variant (`today`, `hub`, `article`, `search`, `inbox`), drawn
  on the page's own grid so nothing shifts when the data arrives; never a bare spinner for a page.
- Empty: `Empty` with a sentence in the serif that says why and what to do (no box, no icon).
- A route naming nothing: `<NotInLibrary what="article" name={…} />`.
- Unexpected render errors: `src/app/error.tsx` (and `global-error.tsx`) catch them.

### 5.6 Accessibility (WCAG 2.2 AA) and performance

- One `h1` per page, headings in order, landmarks (the shell gives `nav`, `header`, `main`, a skip
  link). Every control reachable and operable by keyboard, visible focus, labels on inputs and
  icon buttons, `aria-current="page"` on the current nav link, `aria-live` for async results.
- Text in another language says so (WCAG 3.1.2): the inbox's triage is written in the library's
  language (`language` in library.toml) and papers come in any language, so summaries, "why" lines,
  abstracts and titles carry `lang={guessLang(text)}`. **Future data field:** the library's language
  is a setting the data does not carry yet; once `sitedata.py` writes it (e.g. `inbox.language`), use
  it for the summaries instead of the guess.
- Colour never alone carries meaning (a retraction badge says "Retracted"; stars have text).
- Target size ≥ 24 px; text resizes to 200 % without loss; works at 360 px wide.
- External links: `target="_blank" rel="noopener noreferrer"` plus a screen-reader hint (see
  `inline.tsx`).
- 2+ MB of data: parse once (done; article views on first use), derive once per library (a
  `WeakMap` keyed by the `LibraryIndex`, or `useMemo`), virtualize long lists, never re-filter on
  every keystroke without a deferred value (`useDeferredValue`; the hub builds its whole table
  from a deferred copy of its URL params, the controls follow the URL at once). The compiler does
  not memoize every derived value: check a hot component's output, and `useMemo` what walks the
  data on each render (the inbox's rows and facets).
- **The inbox** (`components/inbox/paper-list.tsx`): beyond `VIRTUALIZE_AFTER` (40) papers it is
  virtualized (items keyed by paper id, measured, absolutely placed): beside the reading pane (≥
  1024 px) the list scrolls in its own column (an element virtualizer, `useVirtualizer`, with an
  `initialRect` of the window's height); narrower, a window virtualizer (`useWindowVirtualizer`). It
  keeps the keyboard model: the current paper is always drawn (`rangeExtractor`), so the roving tab
  stop and the focus never unmount; a key that moves to a paper not drawn scrolls to it
  (`scrollToIndex`) and the paper takes the focus as it mounts (`register`). Every item keeps
  `aria-posinset` / `aria-setsize` of the whole list (a `role="feed"`). Items are `memo` components
  with primitive props and one stable handlers object taking the paper's id: a key press re-renders
  two items, not the list. Measured with 156 papers at CPU ×4: DOM 6,866 → 1,111 elements (11,299
  → 603 on a phone), a `j` press 176 → 104 ms (p75 INP), LCP 3.6 → 2.4 s.
- The ⌘K palette's code loads lazily (`command-palette-slot.tsx`: at idle, or when the pointer
  nears the search button) and mounts on first open; its indexes are built once it has painted;
  its results are computed once per (deferred) query. The slot keeps the loaded component in state
  and renders it directly, not through `lazy` and Suspense: React holds a Suspense boundary's
  reveal back ~300 ms after its fallback, which made the first ⌘K slow even with the code loaded.
- An article's sections are laid out whole (no `content-visibility`: a jump lands where it aims).
  `goToSection` puts the section in the URL (Back returns where the reader was), moves the focus to
  its heading and scrolls it under the bars: smoothly (at most 300 ms) when it is near, at once
  when it is more than one and a half windows away (or with less motion), its heading then tinted
  for a moment; once there it is held in place while what is above it settles (`holdInPlace`). A
  deep link on load and a hash changed in the page land the same way. Room after the colophon
  (print: none) lets the last sections land under the bars too.

### 5.7 Privacy

A library is private data. Fixtures, tests, docs and comments are invented: when a library's
`../build/data/library.json` is there, `src/lib/data/schema.test.ts` fails if a fixture shares any
run of 24 characters with it (the tool's own words, found in the tool's source, excepted).
Screenshots never go into `web/`. No CDN, analytics or telemetry (`NEXT_TELEMETRY_DISABLED=1` in
every script); fonts and assets are self-hosted. Dev servers bind to 127.0.0.1 only (they proxy the
library's data).

## 6. Testing

- **Unit and component tests** (Vitest + Testing Library, jsdom): `*.test.ts(x)` beside the code.
  `next/navigation` is faked for every test (`tests/utils/navigation.ts`: `setNavigation({ pathname,
search })`, `router.push` is a `vi.fn`). Render with the app's providers and the fixture:

  ```tsx
  import { screen } from "@testing-library/react"
  import { renderWithApp } from "../../../tests/utils/render"

  await renderWithApp(<BibView />, { search: "?b=ml" })
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Learning methods for invented signals"
  )
  ```

  `renderWithApp` is async (it renders inside `act()` and waits for the library); it mounts the
  toasts too (sonner applies a toast's update on the next task: wait one before reading it). Mock
  `fetch` with `vi.stubGlobal("fetch", …)` for API calls; `fixtureLibrary()` gives a fresh parsed
  copy to tweak. A queued inbox decision is sent at once with `flushDecisions()` (what leaving the
  page does), or after `UNDO_DELAY_MS` with fake timers.

- **The fixture** `tests/fixtures/library.json`, invented field ecology and methods:
  bibliographies `grassland` (a profile of its own, `field`, whose hub has three tables: Articles,
  Plots, Sensor types; a complete article with a retraction, one with a correction, a draft, one
  unreadable record), `ml` (Articles / Kinds; accents in names and titles, a supplementary file with
  spaces) and an empty `materials`; the reference fields (`authors_full`, `volume`, `issue`,
  `pages`, `version`, `journal_offset`) of a published article with its journal offset, one without
  and a manuscript; 9 inbox papers with every status, relevance 0–3 and null, a summary in Spanish,
  a paper never triaged, priors by similarity and model; a build time in UTC (`+00:00`).
  `src/lib/data/schema.test.ts` checks it and, when present, a library's own
  `../build/data/library.json` (read at test time, never copied).
- **End to end** (Playwright, `tests/e2e/<feature>.spec.ts`): import `test`, `expect` and
  `expectAccessible` from `./test`; the API is mocked for every page (`api.calls` records what the
  app sent; override with `page.route`). The web server is the real `glossator serve` on `out/` with the
  fixture (`scripts/serve-fixture.mjs`), so **build first**. Two projects: desktop 1440×900 and a
  phone (Pixel 7); axe runs inside each feature's "is accessible" test, light and dark. Four
  workers by default (`E2E_WORKERS`; `glossator serve` has a listen queue of 64). The browser is the
  Chromium of the pinned `@playwright/test` (`npx playwright install chromium` once per computer),
  or `PLAYWRIGHT_CHROMIUM_PATH`.
  The `consoleErrors` fixture collects console errors; assert it is empty on your pages. A
  decision waits for its Undo delay: `sendDecisionsNow(page)` sends it (a `pagehide`), and
  `sentDecisions(api, n)` waits for the n requests; `page.clock` tests the delay itself. Never let
  a page unload (a reload, a full navigation) with a decision queued: the request it sends as the
  page goes away escapes Playwright's routes and reaches the fixture's server.
  `integration.spec.ts` covers what crosses pages: links both ways, the session's decisions in the
  sidebar and the overview, the one shortcuts dialog, every route without a console error.
- **serve-fixture.mjs** runs the venv's `glossator` (or `uv run`) in a process group of its own, in a
  temporary `GLOSSATOR_HOME`; SIGINT, SIGTERM or SIGHUP stop the whole group, then remove the folder. A
  run killed with SIGKILL leaves both: the next run on the same port stops that server first.

## 7. Running things side by side

| Who              | glossator serve           | next dev                                   |
| ---------------- | ------------------------- | ------------------------------------------ |
| you              | 8765 (the default)        | 3000                                       |
| a second session | its own port              | its own port, `NEXT_DIST_DIR=.next-<name>` |
| e2e              | `E2E_PORT` (default 8790) | none: `out/`                               |

```sh
# the data and the API (from the repository root)
uv run glossator serve --port 8801

# a second dev server (from web/), bound to 127.0.0.1
NEXT_DIST_DIR=.next-second NEXT_TELEMETRY_DISABLED=1 GLOSSATOR_SERVE_URL=http://127.0.0.1:8801 \
  npx next dev -H 127.0.0.1 -p 3001

# checks of a few paths
npx tsc --noEmit -p .
npx eslint src/components/hub src/app/bib
npx vitest run src/components/hub

# everything, then build and e2e (one e2e run at a time: it serves out/)
npm run check && npm run build && E2E_PORT=8795 npm run test:e2e

# the built app on your own library (from a test, never Accept or Reject on it)
GLOSSATOR_WEB=web/out uv run glossator serve --port 8807   # from the repository root

# the built app with the synthetic library, to click around without a library of your own
E2E_PORT=8796 npm run serve:fixture
```

- `next dev` rewrites `next-env.d.ts` to point at its own build dir (the file is git-ignored);
  `npm run typecheck` (or `npx next typegen`) points it back at `.next/`. The tsconfig stays as is.
- Stop your servers when done (by PID; a `pkill -f` pattern can match other people's servers).
- Screenshots: Playwright's Chromium, saved outside `web/`.

## 8. Pro tips

1. Read `node_modules/next/dist/docs/` for Next APIs and
   `node_modules/@tanstack/react-table/skills/` for tables: both changed since most training data.
2. Keep `<LibraryBoundary>` and the skeleton variant in each route's page.
3. Derive, don't store: compute from `useLibrary()` during render; the compiler memoizes.
   No `useEffect` to sync derived state (lint flags `setState` in effects).
4. Build links with `routes.*`, resolve data hrefs with `resolveHref()`, and draw inline parts with
   `<InlineContent>`: the security rules live there.
5. URL first: if a reader would want to share or reload it, it is a search param (nuqs).
6. Every async UI has four states: loading (skeleton), empty, error (with what to do), done.
7. Test with the fixture's edge cases (draft, unreadable record, retraction, empty bibliography,
   untriaged paper, accents) and at 360 px and in dark mode before calling a feature done.
8. Run axe (`expectAccessible`) on your page in light and dark; check focus order by tabbing.
9. Keep tables dense and prose airy: `text-sm` + `tabular-nums` in tables, `reading` +
   `max-w-measure` for paragraphs.
10. Before writing a badge, a meter, a command or a wording, look in `content/` and `lib/labels.ts`:
    one look and one word for one thing, on every page.
