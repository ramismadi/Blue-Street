# Blue Street — design & data-feed spec

**Maintained by Claude.** This is the source of truth for how the site looks,
how it is built, and the exact shape of every `data/*.json` feed.
Hercules: read it before touching `data/*.json` or `assets/`; please don't
rewrite it — tell Rami (or note it in COLLAB.md) if something here is wrong.
Collaboration rules and the update schedule live in `COLLAB.md`.

## Product shape
**Five tabs, one question each (Rami, 2026-10-18):** Today (what's the
story? — Story chapters open from here, `#story` lights up Today) ·
Currencies (where does each stand? — the currency page carries its bank,
positioning, chapter, Developing threads and "In the news") · **Drivers**
(what's moving things underneath? — Macro engine, Positioning and Central
banks as three sections with a sub-nav; `#drivers` opens the last one read,
saved in localStorage `bluestreet-driver`) · News · Calendar. Every old route
still works. The table below lists the views.

A premium, tabbed FX macro desk. Principle: **less text up front, depth on
demand** — every view leads with the takeaway and tucks detail behind a click.

| Tab | Route | Fed by |
|---|---|---|
| Today | `/` (also `#today`) | story, engine, calendar, news |
| Story (opens from Today) | `#story`, `#story/2` = chapter 2 | `data/story.json` |
| Currencies | `#fx`, `#fx/AUD` = currency page | `data/currencies.json` (+ banks, calendar, story joins) |
| Drivers: Macro engine | `#engine` | `data/engine.json` + `data/pillars.json` |
| Drivers: Positioning | `#positioning`, `#positioning/EUR` = open that market | `data/cot.json` (Claude's weekly job) |
| Drivers: Central banks | `#banks` | `data/banks.json` |
| Calendar | `#calendar` | `data/calendar.json` (+ banks.json join) |
| News | `#news`, `#news/JPY` = filtered to a market (old `#flash` / `#wire` links redirect here) | `data/news.json` (Claude's job, from Hercules's `data/news-raw.json`). The Developing strip was removed 2026-10-18; `data/latest.json` now only feeds the editions' "What changed". |
| Learn (not a tab) | `#learn`, `#learn/cpi` = full explainer | `data/glossary.json` (+ calendar.json for live numbers) |

- **Today's chapters are cards** (Rami, 2026-10-19; replaces the pinned full-screen chapter scenes): a grid (3 across on desktop, 2 on tablet, 1 on phones) in chapter order. Each card: flag + chapter title, a lean mark (strength-board score for the 8 currencies, the News read for gold/oil — evidence, not a call), today's read (`teaser`, 1–3 sentences), "In the news" (top 3 headlines touching that market from `news.json`, by impact — each opens its card expanded on News), and "More on … →" into the full Story chapter. Quiet chapters still fold into the "Quiet today" line.
- **Today (as built, 2026-10-19):** full-screen headline (the one pinned scene,
  `hero-scene`) → **At a glance** (two tiles: *Next up*, the next two high/medium
  events with times + zone, and *Evidence leans*, the ranked chips) → the
  chapter cards above → "Go deeper" (macro pulse, where the evidence leans,
  tiles). Chapters with `"quiet": true` fold into one "Quiet today" line; the
  Story view still shows them in full. The full narrative lives only in Story.
  The scroll code ("today: scroll engine" in app.js) drives the hero and the
  fade-up of Go deeper; `route()` re-runs it after every tab change, so Today
  never comes back blank. `prefers-reduced-motion` gets a plain, fully visible
  page.
- **At a glance is reorderable** (Rami, 2026-10-12): "Rearrange" turns on edit
  mode — ↑/↓ on each tile (works on touch), drag on desktop, Reset, Done/Esc.
  Saved per browser in localStorage `bluestreet-glance` (array of tile ids:
  `next`, `lean`); unknown ids are dropped, missing ones appended, so
  a new tile only needs a `.glance-tile[data-tile]` wrapper + entries in
  `GLANCE_IDS`/`GLANCE_NAMES`. The first visible tile spans the full width.
  Per-device for now; accounts (same layout on every device) would need a
  backend — a later decision.
- **Prose first, site-wide:** narrative leads; figures sit in a "Details"
  drawer (tap to open) — story `numbers`, engine `figure` + sources, bank
  rate definition / last move / sources, the currency score table. Scene mechanics are commented in app.js ("today: scroll engine");
  `prefers-reduced-motion` gets a plain, fully visible page.
- The masthead wordmark is lettered like the sign — big "BLUE" with a small raised "ST" (Inter 800), beside the symbol; it shows on phones too. The wordmark and the Today tab go to the clean site URL (no hash).
- **Brand (Rami, 2026-10-19):** one colour, **#0A84FF** (the MT5 profit blue; CSS `--brand`, the same in every theme), with ivory **#f6f2ea**. A two-piece family sharing one geometry (512 viewBox: post `x92 y88 w30 h336 rx15`, arrow `M108 150 H384 L438 210 L384 270 H108 Z`, 14px round-join stroke):
  - **Sign** (full logo) = post + arrow + "BLUE" with raised "ST" (Inter 800). Used where the name can be read: home-screen app icon (`icon-512/192`, `apple-touch-icon`: ivory sign on a blue tile), link previews (`assets/og.png`, 1200×630, og/twitter meta), the loading splash (`#splash`, hidden by app.js once the edition renders, 350 ms–2.5 s).
  - **Symbol** = the same post + arrow, no lettering. Used where it's tiny or the name sits beside it: browser tab (`favicon.png`, blue tile), masthead (ivory, before the BLUE STREET wordmark), top of the side menu (brand blue).
  - Colour flips with the background so the mark always contrasts: ivory on blue/navy, blue on ivory.
- **Side menu (optional, Rami 2026-10-18):** the masthead's panel button moves
  the sections from the top bar into a left side menu (same five + Drivers'
  three sections + Learn, with the badges mirrored). Wide screens: a fixed
  rail that collapses to icons; narrow screens: a drawer that slides in from
  that button. "Tabs on top" puts it back. Saved per browser in localStorage
  `bluestreet-nav` (top|side) and `bluestreet-nav-collapsed`; applied before first
  paint. Built in app.js (`NAV_ITEMS`) — a new tab needs an entry there too.
- No live price widgets (Rami removed them). Price levels appear only in the
  narrative data.

- **No subtitle lines under page titles** (Rami, 2026-10-19): Currencies, Drivers' three sections, News, Calendar and Learn show just the title. (The positioning "as of / next report" line went with it.)
- **Currencies:** the Pair picker sits above the Strength board, full width; on wide screens its "Strongest edge" and "Fights your view" groups run side by side.

- **Calendar session clocks** (Rami, 2026-10-19): four analog clocks (SYD, TYO, LDN, NYC) beside the Calendar title, each on its city's local time (same session rules as the masthead chips). Out of session = greyed out; in session = lit by a warm light from the top down. On phones they sit in a row under the title.
- **No overflow, ever** (Rami, 2026-10-19): nothing may run past the screen edge or the page scroll sideways. The overflow guard at the end of style.css wraps long values and lets grid/flex children shrink; `html, body` clip as a last resort. **Run `tools/overflow-check.py` before shipping any layout change** — it loads every page at 320–768px (calendar fully expanded) and lists anything that spills.

## Build & deploy
- Plain static files, relative paths only (site lives under `/Blue-Street/`).
  No build step, no backend. All DOM is built with `textContent` — never
  inject HTML from data.
- **Cache-busting:** `index.html` loads `assets/style.css?v=N` and
  `assets/app.js?v=N`, and `ASSET_VERSION` at the top of `app.js` must equal
  N. **Bump all three whenever index.html, style.css or app.js changes.** On load, app.js
  re-fetches index.html and reloads once if it sees a newer N — this is how
  cached pages and home-screen installs heal themselves.
- **Live data while open:** every 5 min (while visible) and on returning to
  the page, app.js re-fetches the `data/*.json` files it rendered and
  compares them. Changed and the reader was away 10+ min → reload; changed
  mid-read → a "New update · tap to refresh" pill. Nothing for the scheduled
  jobs to do — just push the files as usual.
- Only http(s) URLs become links; they open in a new tab with
  `rel="noopener noreferrer"`.

## Look
- **Default theme: Blue Street** (`blue`, dark pair `night`; Rami 2026-10-19) — brand blue #0a84ff as the accent and a solid blue masthead, on the ivory page; listed first in the colorways. The older colorways remain.
- **No gold trim on Blue Street / Night** (Rami, 2026-10-19): `--gold` is remapped to blue in those two themes, so kickers, labels, callout rules and the tab underline are brand blue. Gold survives only as the *mixed* signal via `--mixed`/`--mixed-wash` (news lean tags, thesis "mixed"). Central-bank bias there is one blue scale: Hawkish = solid blue, Dovish = pale blue, Neutral = grey. Other themes keep their gold.
- **Look controls live in the side menu** (Rami, 2026-10-19): light/dark and the colorway swatches sit at the bottom of the side menu / phone drawer; the masthead's own sun-moon and colorway buttons are hidden. On phones the masthead's menu button always opens the drawer (any layout), which frees the bar for the SYD/TYO/LDN/NYC session chips; under 440px the wordmark hides and the symbol carries the brand.
- Themes are token sets on `<html data-theme="…">` (plus `data-mode` =
  light|dark). They come in **four colorways, each a light + dark pair**:
  | Colorway | Light | Dark |
  |---|---|---|
  | Navy, ivory & brass | **ivory** (site default; tokens on `:root`) | **ink** |
  | Green & sand | **sage** | **forest** |
  | Burgundy, rosé & gold | **claret** | **velvet** |
  | Black & champagne | **pearl** | **onyx** |
  The masthead has a sun/moon toggle (flips to the counterpart) and a
  colorway menu (switches colorway, keeps the current mode). The choice is
  saved per reader (localStorage `bluestreet-theme`); retired themes (alpine,
  porcelain, harbor, dusk, …) fall back to Ivory. To add a colorway, add both
  `[data-theme]` blocks in style.css, both entries in `THEMES`, and the pair in
  `COLORWAYS` in app.js (and the dark id to the pre-paint regex in
  index.html). Every theme defines the same tokens; never hard-code hex in
  component rules.
- Fonts: serif (Source Serif 4 → Georgia) for headlines and ledes; system sans
  for UI/body; monospace only for tabular numerals.
- Flags: `assets/flags/<us|eu|gb|jp|ch|ca|au|nz|xau|oil>.svg` (hand-drawn 4:3 SVGs; gold and oil are icons), placed with `flagEl(code)` in app.js. On the News chips, bias tags, news read, Developing thread tags and the Today glance tile. Emoji flags aren't used — Windows shows them as letters.
- Session chips (masthead): SYD 07–16, TYO 09–18, LDN 08–17, NYC 08–17, each
  in its own city's local time (DST-correct), Mon–Fri, and only while the FX
  week is open (Sun 17:00 → Fri 17:00 New York). Holidays not modelled.

## Writing data for this design
`fx` (story) and `read` (engine) are what people see first — short, punchy
one-liners. Depth goes in `numbers`, `meaning`, scenarios, `why`.
Never guess or fabricate a number, date or URL; leave it `null` and it renders
gracefully. Link the specific article / series page / release, not a homepage,
and check its published date matches the event.

### Sources (all feeds)
Any `sources` field is an array of `{"label", "url"}` (plain strings also
work). Engine rows and story chapters may instead use `"source"` (string) +
`"source_url"`. Wire items may add `"url"` to link the headline.

### `data/story.json`
```
{"date":"YYYY-MM-DD","headline":"...",
 "chapters":[{"title","teaser","fx","meaning","numbers":[],
   "scenarios":{"base","bull","bear"},"sources":[]}]}
```
- `headline` — **Today's read: 1–2 sentences, ~35 words max** (Rami, 2026-10-19). The page shows at most the first two sentences (one if two run past ~45 words), so anything longer is cut, not shown.
- Chips under Today's read: flag + code (USD, EUR…; Gold and Oil by name), matching the News market chips. Tap = that currency's card on Today, or its Story chapter when quiet (Rami, 2026-10-19).
- `teaser` — **the Today card: 1–3 sentences, ~50 words max**, the delta only (Rami, 2026-10-19). The card shows at most three sentences / ~60 words; "Read the chapter →" opens the full chapter for anyone who wants more.
- `meaning` (+ `fx`) — the narrative. Section labels `What changed:`,
  `Thread:`, `What it means:`, `What to watch:` become headed sections in the
  Story tab, in that order (`fx` usually carries What to watch). Unlabelled
  `fx` renders as the old "What it means for FX" callout.
- `numbers` — 3–4 crisp figures for the Details drawer, never paragraphs.
- `quiet` (optional boolean, Hercules) — true only when the chapter has no
  real delta since the previous edition. Today folds quiet chapters into one
  line; never set it to skip writing a chapter.

### `data/engine.json`
```
{"updated":"<ISO-8601>","rows":[{"id","title","figure","read","sources":[]}]}
```
**`read` = the meaning, not the data** (Rami, 2026-10-19): 2–3 short plain-English sentences — what's happening and what it means for currencies — with as few numbers as possible (round ones if any). Prints, odds, levels and dates go in `figure` and `sources` (the Details drawer). The page shows at most 3 sentences / ~70 words.
Row ids: `policy`, `growth`, `inflation`, `risk`, `tot`, `positioning`,
`fiscal`. Any number of rows works — the grid balances itself and the
"N pillars" label counts them.

### `data/pillars.json` — "What is this?" explainers
```
{"pillars":{"<engine row id>":{"title","body","live"}}}
```
`body` = what it is + how it moves currencies (static). `live` = one current
example — refresh it when conditions change. A pillar without an entry simply
has no "What is this?" button.

### `data/currencies.json` — Currencies (strength board + pair picker)
```
{"updated":"<ISO-8601>","as_of":"YYYY-MM-DD",   // edition date
 "method":"Score = sum of pillar scores (-1 / 0 / +1) ...",
 "currencies":[{"ccy":"AUD","name":"Australian dollar","bank":"rba",
   "chapter":3|null,                 // story chapter behind this currency
   "summary":"one line — why it sits where it does",
   "drivers":{"policy":{"score":1,"note":"RBA hiked +25bp Sep 29 to 4.60%"},
              "risk":{"score":-1,"note":"Risk-off tilt — AUD soft"}, ...}}],
 "history":[{"date":"YYYY-MM-DD","scores":{"USD":3,"EUR":-2,...}}],
 "pairs":{}}                         // reserved: per-pair notes / typical range
```
- Pillar keys match the engine: `policy`, `growth`, `inflation`, `risk`,
  `tot`, `positioning`, `fiscal`. Omit a pillar (or score 0) when it isn't a
  driver; every non-zero score needs a one-line `note`.
- The site computes the score (sum of drivers), ranks the board, and builds
  the pair picker: for "bullish X" each counterpart Y is ranked by
  `score(X) − score(Y)` (Best ≥ 2, Good 1, No edge 0, Avoid < 0), shown in
  market convention (EUR > GBP > AUD > NZD > USD > CAD > CHF > JPY), with
  carry from `banks.json` rates and high-impact events in the next 14 days
  from `calendar.json`.
- **Daily (2 a.m. edition):** rewrite `drivers`/`summary` from that morning's
  engine reads and banks, set `as_of`, and **append** one
  `{"date","scores"}` snapshot to `history` (keep ~60 days). History is what
  draws each currency's trend line and the ▲/▼ change on the board — never
  rewrite past entries.
- Scoring is v1 on purpose (Rami + Claude will refine weights/pillars over
  time); keep the method string accurate if it changes.

### `data/momentum.json` — surprise momentum (Hercules)
```
{"updated":"<ISO-8601>",
 "since":"2026-10-14",              // counting starts fresh with US CPI, Oct 14
 "window":6,                         // releases kept per currency
 "currencies":{"USD":{
   "note":"one line on the pattern (optional)",
   "recent":[{"id":"us-cpi-20261014",   // = calendar.json event id
              "date":"YYYY-MM-DD","title":"CPI y/y (Sep)",
              "result":"beat"|"miss"|"inline",
              "actual":"3.7%","forecast":"3.6%"}]}}}   // newest first
```
- **`result` is judged for the currency, not the number:** use the calendar
  event's `better` (higher|lower). An unemployment rate above forecast is a
  `miss`. `inline` = matched forecast (or inside your stated tolerance).
- Only scored releases with an `actual` and a `forecast` count — speeches,
  minutes and auctions don't.
- Keep the newest `window` releases per currency; the site computes the
  beat/miss/in-line counts itself, so no totals are needed.
- Never backfill before `since` — Rami wants the count to start clean at CPI.
- No file (or a currency with no releases) renders gracefully: before the feed
  exists the site shows "Tracking starts Oct 14 with US CPI".

How it renders: currency page → "Data surprises" under Trend (coloured squares
oldest→newest, "Beat 3 · missed 1 · in line 0 of the last 4", the `note`, the
three newest releases). Today → "data 3–1" on that currency's evidence row.

### Today: "Where the evidence leans" (render only, from currencies.json)
A card in Go deeper: every currency, board order, seven dots = the seven
pillars in engine order (green supports, red weighs, grey neutral; tooltips
carry each driver note), "N for · N against", plus the momentum chip. Copy
says "Evidence, not a call" — this is a tally of evidence, never a verdict.
The currency page header also shows "Pillars: N for · N against · N neutral".

### `data/glossary.json` — inline definitions
```
{"terms":[{"term":"FOMC","definition":"one to two lines","aliases":["Federal Open Market Committee"]}]}
```
Known terms in prose get a dotted underline: hover = tooltip, tap (touch) =
bottom sheet. Only the first occurrence per chapter / card / wire thread /
calendar detail. Never inside links, buttons, headings, labels or figures.
Terms with 2+ capitals (CPI, BoE, OAT) match case-sensitively so plain words
("oat") stay plain; others match any case. Render code opts a container in
with the `gl-scope` class; re-renders are picked up automatically.

**Explain layer (Rami, 2026-10-15): three levels, nothing added to the read.**
1. The popover above (1–2 lines) — unchanged.
2. A full explainer page, `#learn/<term-id>`, for terms whose entry carries an
   optional `detail` object. The popover then shows "Learn more →".
3. The library, `#learn` (footer link + "← All terms"): every term, grouped by
   `kind`, searchable; terms with `detail` link to their page. Not a tab.
Optional fields on a glossary term (all backward-compatible; omit = today's
behaviour):
```
{"term":"CPI","definition":"...","aliases":[...],
 "id":"cpi",              // default = slug of term; related_ids use it
 "kind":"Data",           // library group; default "Terms" (e.g. Data, Central banks, Concepts)
 "detail":{
   "measures":"...", "why_moves_fx":"...", "surprise_looks_like":"...",  // string or [strings]; at least one required
   "calendar":{"id_prefix":"us-cpi"},    // or {"match":"CPI","ccy":"USD"} — live "Next / Last" block from calendar.json
   "related_ids":["pce","hawkish"],      // term ids, shown as chips
   "sources":[{"label":"...","url":"..."}]}}
```
Rules: `detail` text explains mechanics only, never direction (no house view);
no hard-coded figures that go stale — put live numbers behind `calendar` so the
page pulls consensus/next-release timing from `calendar.json`. Keep the
`definition` to 1–2 sentences (a length check at write time keeps the popover
honest). Text is rendered with `textContent` only.
**Preview:** `?learn-demo` overlays `assets/glossary-demo.json` (sample `detail`
for CPI, FOMC, hawkish) so the pages can be reviewed before the feed has any.

### `data/focus.json` — Focus Mode (big-event Today takeover)
**TABLED (Rami, 2026-10-19):** switched off with `FOCUS_ON = false` in app.js — no polling, no Today takeover, no Focus tag in the calendar. Code and demo (`?focus-demo=…`) kept for a redesign later.

```
{"active": true, "event_id": "us-cpi-20261014",   // = calendar.json event id
 "phase": "preview" | "live" | "recap",
 "story_so_far": ["beat", ...],   // 3–4 beats, oldest first; last = this event
 "stakes": "one line",
 "setup": {"consensus", "previous", "priced"},
 "forks": [{"if": "...", "then": "..."}],          // branches, never a call
 "watch": ["7:30 AM CT — ...", ...],
 "thread": "us-cpi-20261014",                      // wire thread = the live blog
 // optional — default from the calendar event via event_id:
 "title": "US CPI (Sep)", "ts": "<ISO print time>", "ccy": ["USD"], "chapter": 1,
 "sources": [{"label","url"}],
 // recap phase:
 "recap": {"outcome": "one-line verdict on the print",
           "actual": "...", "expected": "..." (defaults to setup.consensus),
           "pricing": "Oct hike ~17% → ~48%; Dec ~70% → ~92%",
           "thesis": {"verdict": "confirms"|"breaks"|"mixed", "note": "..."},
           "fork": 2}}                             // index of the fork that played out
```
`{"active": false}` (or no file) = no takeover. How it renders:
- **Preview:** full-screen head (act stepper, title, stakes, print time in CT
  + reader's zone, live countdown), then How we got here → The setup → The
  forks → What to watch, links to the story chapter and calendar.
- **Live:** the site flips preview → live **by itself at `ts`** (no need to
  wait for the feed). The thread's wire items render as a live blog, newest
  on top, re-fetched every minute in place (no reload); unseen items get a
  "New" flag, the tab title shows `● LIVE` (+ count while in the background),
  the Today tab shows a LIVE badge. Setup + forks stay one tap away. The
  newest item's `next` shows as What's next.
- **Recap:** outcome line, Actual / Expected / Pricing tiles, thesis verdict
  (green confirms / red breaks / gold mixed), forks with the played one
  highlighted, the thread as "How it unfolded".
- focus.json is polled every minute while active, every 5 min otherwise.
  Calendar events with `"focus": true` get a Focus chip.
- Preview the design anytime: `?focus-demo=preview|live|recap` (sample
  content in `assets/focus-demo.json`, labelled as a demo on screen).

### `data/news.json` — News (Claude's job; built from `data/news-raw.json`)
Rami, 2026-10-18, benchmarked on ForexFundamentals' News Sentiment page and
built to beat it: every FX-relevant headline as an image card, a market filter,
an expandable read, which way the headline pushes each currency, and a link out
to the publisher. Flash stays the curated "developing now" desk; News is the
full stream.

**Two files, two owners, no shared writes:**
- `data/news-raw.json` — **Hercules (ingest).** Raw headlines from the sources,
  newest first, keep ~72h:
  ```
  {"updated":"<ISO>","items":[{"id":"stable-unique","ts":"<ISO published>" | "date":"YYYY-MM-DD",
    "source":"Reuters","url":"https://...","headline":"publisher's headline",
    "image":"https://... (the article's og:image) | null","lede":"publisher's preview text (optional, never shown)"}]}
  ```
  Check `datePublished` before adding (COLLAB rule 7). `image` is the
  publisher's own preview image (og:image), hotlinked, never re-hosted.
- `data/news.json` — **Claude (read + enrich), what the site renders.** A
  scheduled job reads the raw file, writes the read for each new item, groups
  storylines, refreshes `narratives`, prunes items older than 72h unless their
  storyline updated inside that window.
```
{"updated":"<ISO>","method":"...",
 "narratives":{"JPY":{"lean":"bullish"|"bearish"|"mixed","text":"what today's headlines add up to","ts":"<ISO>"}},
 "items":[{"id","ts"|"date","source","url","image"|null,"headline",
   "story":"hormuz","story_title":"Hormuz: reopening offer vs ship attacks",   // same story = one card
   "pillar":"risk",                       // engine pillar id
   "summary":"1–2 lines, Blue Street's own words",
   "beats":{"was","happened","means","fx"},   // the four beats (COLLAB template)
   "impact":[{"ccy":"JPY","dir":"bullish"|"bearish"|"mixed","strength":1|2|3,"why":"one line"}],
   "watch":"what would change it"}]}
```
- Markets: `USD EUR GBP JPY CHF CAD AUD NZD` plus `XAU` (gold) and `OIL`.
  `impact[0]` is the market the headline moves most (it labels the fallback tile).
- `dir` is **headline pressure, never a call** — the same evidence-weighing
  rule as the pillar tally. `strength`: 1 mild, 2 clear, 3 strong.
- Summaries and beats are written from the headline and public preview in
  Blue Street's own words — never copy the article's sentences.
- No `ts` from the publisher → give `date`; the card shows the date instead of
  "5h ago". Never invent a time.

**Sorting (Rami, 2026-10-18):** "By impact" (default) ranks by the strongest `strength` on any market, then how many markets it moves at strength 2+, then newest; "Latest" is newest first. Choice saved per browser (localStorage `bluestreet-news-sort`). So `strength` must be honest — it decides the order.
**Rami, 2026-10-18: every article gets its own card** — no folding by `story` (keep writing `story`/`story_title`; they're kept for later use). Each card leads with a coloured pillar badge (Growth, Risk sentiment, Policy…) and shows each currency it moves as a coloured tag with a tiny trend line — rising green (bullish), falling red (bearish), choppy gold (mixed). No words or strength labels on screen; strength only drives the sort.
How it renders: market chips with flags (markets with no stories are dimmed;
tap again for All; the hash keeps the filter) + a source dropdown (2+ publishers). Picking a
market shows its **news read** card (`narratives`). Cards: publisher image (or a
generated tile — market + pillar, edged by the lean — if there is none or it
fails to load), source · time, storyline kicker when 2+ items share a `story`,
headline, bias tags (▲ bullish / ▼ bearish / ◆ mixed; faint arrow = mild,
outlined = strong), pillar tag, summary. Tapping the headline or "Key
takeaways" opens the card across the row: the four beats, "By currency" with
each `why`, "What would change it", the publisher button, and "Earlier on this
story". Today's tiles link the tab.

### `data/latest.json` — Developing now (was the Flash tab)
**Rami, 2026-10-18 (late): the Developing strip is removed from the site** —
no strip on News, no Today glance tile, no currency-page section, no badge.
`latest.json` is still read for Focus Mode's live blog (and the editions'
"What changed"), so the feed itself stays; everything below about rendering
the strip is retired.
**Rami, 2026-10-18: Flash merged into News.** One tab: the market chips and
news read on top, then **Developing now** (these threads), then **Headlines**
(`news.json`). The feed, the 30-min breaking watch, Focus Mode's live blog and
the editions' fold-in are unchanged — only where it renders moved. In the
strip: threads updated in the last 24h show (newest spans the row, the rest
two-up), cooling threads fold into "Earlier stories", and "How it developed"
is collapsed behind a tap. The News market chips filter threads too (by `ccy`;
Oil / Gold also match oil- or gold-themed headlines and `pillar: "tot"`). The
News tab badge counts live threads; the Today glance tile opens News.
```
{"items":[{"ts":"<ISO-8601>","headline","url"?,"bullets":[],"sources":[],
  "thread":"us-iran-20261008",     // same id = one developing story
  "ccy":["USD","JPY"],             // affected currencies → tags link to #fx/CCY
  "pillar":"risk",                 // engine pillar id → tag links to #engine
  "next":"Next: ..."}]}            // next catalyst in the storyline
```
Renders as **threads**: items sharing a `thread` id become one card headed
by the newest update (headline, currency + pillar tags, FX line, "What's
next" from the newest item's `next`, sources), with a "How it developed"
timeline of every update below. Items without `thread` stand alone. Threads
sort by their newest update; the tab badge counts threads. Currency pages
list the threads tagged with that currency ("On Flash").
Times are relative ("2h ago", "yesterday", "2d ago"; exact time on hover)
and tick every 30s. A thread with no update in 24h is **cooling**: dimmed,
no "Developing"/"Latest" pill. Hercules prunes threads 72h after their last
update and unthreaded items after 36h.
Keep the `Numbers:` / `Meaning:` / `FX:` prefixes on bullets — the FX line
shows by default, the rest sits behind "Full detail".

### `data/cot.json` — Positioning (Claude owns; weekly, automated)
Built by **`assets/cot.js`** (the one calculator; the site loads it too) from the
CFTC's public Commitments of Traders API, by the GitHub Action
`.github/workflows/cot.yml` → `node tools/cot-build.cjs`. Runs Fri 21:17 UTC
(after the 3:30 PM ET release), with Sat and Mon catch-ups for holiday weeks;
commits only when a newer report exists, and refuses to overwrite a good
snapshot with a bad pull. **Nobody hand-edits this file** — change the
calculator instead (pushing `assets/cot.js` re-runs the job).
```
{"updated":"<ISO>","report_date":"2026-10-06",      // Tuesday the positions are as of
 "method":"...","sources":[{"label","url"}],
 "markets":[{"id":"EUR","name":"Euro","ref":"the euro",
   "kind":"fx"|"commodity","report":"TFF"|"Disaggregated",
   "contract":"CME Euro FX","code":"099741","long_means":"euro up against the dollar",
   "as_of":"2026-10-06","oi":870291,
   "hf":{"net","long","short","flip","pct","zone","z":{"all","y10","y1"},
         "range12","chg1","chg4","weeks","since"},  // hedge funds & CTAs
   "rm":{...same...},                                 // real money — fx only
   "split":false,        // hf and rm lean opposite ways vs their own history
   "signal":0,           // engine positioning score: very bullish −1, very bearish +1
   "history":[{"d","hf","oi","rm"?}],                // last 26 weeks, net contracts
   "summary":"one plain-English line"}]}
```
- **Markets:** USD (ICE Dollar Index), EUR, GBP, JPY, CHF, CAD, AUD, NZD from the
  Traders in Financial Futures report (Leveraged Money = hedge funds, Asset
  Manager = real money); gold, silver, WTI, copper from the Disaggregated report
  (Managed Money). Futures only. Contract codes keep full history through the
  CFTC's 2022 renames, so every market ranks against Jan 2015 onward.
- **Maths:** flip = (long − short) ÷ open interest × 100; `pct` = mid-rank of
  this week's flip vs every week since Jan 2015; zones (a lean
  compared with the group's own usual) ≥90 `very bullish`, ≥60 `bullish`,
  ≤40 `bearish`, ≤10 `very bearish`, else `neutral`; `range12` = where the net
  sits in its 12-week range (0 = 12-week low). Calibrated 2026-10-14 against a
  public benchmark: EUR/JPY/AUD/CAD/CHF percentiles match to ±0.1.
- **Safety net:** if the file is missing or a report behind (`isStale`), the
  Positioning tab rebuilds live in the reader's browser from the CFTC and
  says so in the header.

How it renders (redesigned 2026-10-19, Rami: no "how to read this", no jargon, and
"usual / more bullish" wording didn't work): "This week" takeaway in plain
sentences (any extreme, biggest bet for and against among currencies, where real
money disagrees, the biggest shift of the month) → Currencies and Commodities,
each sorted by size of the hedge-fund bet. Each row: one track, "Betting against
← Even → Betting for", showing each group's net position (`flip`, net as a share
of open interest; right = net long): filled dot = hedge funds, ring = real money,
both coloured green (for) / red (against). Beside it, one line per group in words
(Evenly split < 2%, Leaning < 8%, Betting < 20%, Strongly beyond, then "for" or
"against"). Tags: "Near its low/high since 2015" when the hedge-fund percentile
is ≤10 or ≥90, and "Real money disagrees" when both groups are 8%+ and on opposite
sides. Tap a row: the summary, 26-week bars, a Details drawer with the numbers and
sources. A small "About this data" drawer sits at the bottom; there is no how-to
section. Never "crowded", "stretched" or "usual" (Rami found them unclear). The currency page
shows a one-line "Positioning" link under Trend.

### `data/banks.json` — Central banks
```
{"updated":"<ISO-8601>","banks":[{"id","short","name","ccy",
  "rate":"2.50%"|null, "rate_label":"Deposit facility rate",
  "last_move":{"date":"YYYY-MM-DD","bp":25|-25|0}|null,
  "next_meeting":{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"?}|null,
  "priced":"Oct hike ~60%"|null, "bias":"hawkish"|"neutral"|"dovish"|null,
  "sources":[]}]}
```
**Meaning, not data** (Rami, 2026-10-19): `summary` = 1–2 plain sentences on where the bank stands and what it means for its currency (shown first); `priced` = ONE short line on what markets expect, in words ("October: hold expected; December: hike likely"); `detail` (optional) = the numbers, odds, prints and dates — shown only inside Details. The card trims summary to 2 sentences and priced to 1.
A bank with `rate`, `priced` or `bias` gets a full card; others show date
only. Cards sort by soonest meeting. Use the headline policy rate (Fed: the
target range; ECB: deposit facility) and say which in `rate_label`. Source
the rate from the bank's own site (Fed target range: FRED `DFEDTARU` /
`DFEDTARL`; `FEDFUNDS` is the *effective* rate).

### `data/calendar.json` — Calendar
```
{"updated":"<ISO-8601>","events":[{
  "id":"us-cpi-20261014",          // stable, unique
  "ts":"2026-10-14T12:30:00Z",     // UTC instant; or omit ts and give
  "date":"2026-10-30","time_tbd":true,  //   a date when the time is unknown
  "ccy":"USD", "impact":"high"|"medium"|"low",
  "category":"inflation"|"jobs"|"growth"|"central-bank"|"speech"|"auction"|"sentiment"|...,
  "title":"CPI y/y (Sep)",
  "actual":null, "forecast":"3.4%", "previous":"3.35%",
  "better":"higher"|"lower"|null,  // which direction is good for the currency
  "why":"one line on why it matters",
  "if_beat":"...", "if_miss":"...", // central-bank events: hawkish / dovish
  "chapter":1,                     // story chapter to link, optional
  "bank":"fed",                    // joins banks.json for decisions, optional
  "sources":[]}]}
```
Past events may carry `"outcome"`: one line on what the print meant (shown
under the title and as "What it meant" in the briefing). Once a past event has
an `outcome`, the briefing drops the `if_beat`/`if_miss` boxes — the outcome
supersedes them (speeches/minutes included, which never get an `actual`). Render-only: keep writing all fields. The feed keeps a
7-day lookback; the "Last 7 days" range shows it.

How it renders: times shown in the reader's chosen zone (local by default),
grouped by day, filterable by range / impact / currency, live countdowns, a
"Now" marker, actual vs forecast coloured beat/miss using `better`, and an
expandable briefing (why / beat / miss / bank today / story link / add to
calendar). Today's "Next up" shows the next three high/medium events.

**Keeping it fresh (Hercules):** the seed covers only the events the site
already listed plus central-bank decisions at each bank's standard
announcement time — verify those times. To cover the full weekly slate,
ingest ForexFactory's weekly export feed
(`https://nfs.faireconomy.media/ff_calendar_thisweek.json`; check their
terms and poll sparingly) and map: `country`→`ccy`, `impact`
High/Medium/Low→`impact` (skip Holiday or show as low), `date`→`ts` (convert
to UTC), `forecast`, `previous`. The feed has no actuals — fill `actual` as
prints land (that's what turns rows green/red). Then add the Blue Street layer
FF doesn't have: `why`, `if_beat`/`if_miss`, `better`, `chapter`, `bank`.

## Plain-words layer: data/words.json (Rami, 2026-10-19)
Claude owns `data/words.json`; Hercules never edits it. Sections: `story.headline`,
`engine.reads.<row id>`, `banks.banks.<bank id>.{summary, priced, why, watch, bias}`, each with
`as_of` (YYYY-MM-DD). `applyWords()` in app.js merges them over story/engine/banks
on load, but only when the data file isn't from a later day than `as_of`; otherwise
Herc's text shows, still trimmed by the render clamps. A bank's original `priced`
moves to `detail` (Details drawer) when replaced. `why` ("What is driving it") and `watch`
("What to watch") are 1–2 plain sentences each and fill the bank Details drawer; when present they
replace the number-heavy `detail`, which only shows as a fallback. The bank's bias pill shows a
trend line (`bias` is Claude's label from words.json, applied regardless of date; rule in COLLAB.md): hawkish = rising (green), dovish = falling (red), neutral = sideways (gold).
