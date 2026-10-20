# Working on Blue Street — agent collaboration guide

> **Read `VISION.md` first.** It's the why behind the site, and only Rami
> changes it. Before trimming anything, check it against VISION.md's
> "Trimming rule": keep what serves the vision or is paused, archive what's
> finished, and ask Rami before deleting a file or feature.

## WHO DOES WHAT — current split, no overlap (Rami, 2026-10-19)
This section is the source of truth. Where older sections below disagree
(e.g. "Collaboration rules" #4, "How updates happen", "Division of labor"),
this one wins. Rule: **each file has exactly one writer.** Never edit a file
the other agent owns — if you need a change in it, ask in this file.

### Hercules writes (data — numbers, dates, sources)
| File | What | When |
|---|---|---|
| `data/calendar.json` | events, forecasts, actuals | daily run + as actuals print |
| `data/banks.json` | rates, meetings, odds, sources (`detail` for figures) — **no `bias`**, see "Bias label moved to Claude" | daily run |
| `data/currencies.json`, `data/momentum.json` | currency board, surprise momentum | daily run |
| `data/latest.json`, `data/focus.json` | breaking watch, Focus Mode | every 30 min / event days |
| `data/pillars.json`, `data/glossary.json` | explainers, glossary terms | as needed |
| `data/news-raw.json`, `data/markets.json` | raw headlines, levels (optional feeds) | daily run |

### Claude writes (design, code, and every word readers see)
| File | What | When (CT) |
|---|---|---|
| `index.html`, `assets/*`, `tools/*`, `.github/workflows/*` | the whole site: design, layout, features | when Rami asks |
| `data/words.json` | plain-words text: Today's read, engine reads, bank summaries and the hawkish/neutral/dovish label — shown over the matching text in Herc's files | 1:19 AM and 3:14 PM daily, 7:54 AM weekdays |
| `data/news.json` | News tab: stories, impact, per-currency reads | :43 past, ~10 times a weekday (+ 2:31 PM on Fed days) |
| `data/cot.json` | positioning (built by a GitHub Action) | Fridays, checked Saturdays |
| `DESIGN.md` | how the site is built and what each file must look like | when design changes |
| `data/story.json`, `data/engine.json` | full editions (handover done 2026-10-19) | 1:19 AM and 3:14 PM daily, 7:54 AM weekdays |

### Shared
- `COLLAB.md` (this file): both may add sections; don't rewrite or delete the
  other agent's sections.

### Timing, so pushes don't collide
- **Three editions, each live before Rami's target** (Rami, 2026-10-20), all CT:
  | Edition | Hercules' data run | His push due | Claude writes | Live by |
  |---|---|---|---|---|
  | London open | 12:40 AM daily | 1:15 AM | 1:19 AM daily | ~1:45 AM (target 2:00) |
  | New York open | 7:15 AM weekdays | 7:50 AM | 7:54 AM weekdays | ~8:20 AM (target 8:30) |
  | New York close | 2:35 PM daily | 3:10 PM | 3:14 PM daily | ~3:40 PM (target 4:00) |
- **New York open:** Hercules gathers the slow files first (banks, currencies,
  momentum), then waits for the 7:30 AM US releases, adds the actuals and the
  first market reaction, and pushes once by 7:50. Claude's edition tells what
  the data did since the London edition and what's left before the close.
- **New York close:** Hercules' 2:35 PM run takes currency levels at the
  3:00 PM CT New York close, so the close edition's numbers match the close.
- **Fed decision days** (low-key, no extra edition): the New York open edition
  carries the preview in the US Dollar chapter and Fed card (what's priced,
  what would surprise, 1:00 PM decision, 1:30 PM press conference). During
  the afternoon the decision lands quietly via Hercules' breaking watch and one
  extra Claude News read at 2:31 PM (News tab only). The close edition, from
  data gathered after the press conference, tells the full story by ~3:40 PM.
- **News read quiet windows:** Claude's News read never pushes 1:00–1:50 AM,
  7:45–8:25 AM or 2:55–3:45 PM, so it never lands on top of an edition. Its
  weekday runs are at :43 past 5, 6, 8, 9, 10, 11 AM and 1, 5, 7, 9 PM.
- Everyone: fetch right before pushing, one commit per run, never force-push,
  never push an empty commit.

## What this is
Blue Street is Rami's FX macro desk (renamed from its old name on 2026-10-19) — a
static site on GitHub Pages at ramismadi.github.io/Blue-Street/. It publishes a daily story-format FX
outlook (numbers → what they mean → what happens to the currencies), a
macro engine, central-bank scorecard, calendar and breaking wire. Audience:
Rami and anyone he shares the link with. Content tone: direct, meaning first (plain words), numbers in support,
no ceremony. Market context only — never trade recommendations, never financial
advice.

## How Blue Street explains things — Rami's explanation template (2026-10-15)
Rami: "the way you just described it needs to be how everything on Blue Street
needs to be explained." Every number, event, or print on the site — dollar
stories, CPI/PPI/payrolls, any currency — runs four beats, in order:
1. **What this was** — the number/event in plain words ("core prices rose
   0.3% in a single month").
2. **What happened** — the print vs expected; the surprise and its size.
3. **What it means and why** — translate against the benchmark (annualize a
   monthly rate, compare to the central bank's target) and give the read
   ("~3.7% annualized vs the Fed's 2% — inflation running almost twice as
   hot as they want, not cooling").
4. **What it indicates for the currency** — the chain step by step (Fed
   under pressure → likely hikes → higher yields → money into dollars →
   dollar up), ending in the one-question lens the reader reuses ("how much
   pressure is the Fed under?").
Never just state the print; always run the four beats. Mechanics only, never
direction — the site builds the case, Rami renders the verdict.
**Division:** Hercules wired this into both edition crons (2am + 4pm), so
story chapters arrive in this voice. Claude: when building Learn pages or
any explainer UI, structure on the four beats — they are the page outline.

## Architecture & data feeds → see DESIGN.md
The design, build rules (incl. the `?v=N` cache-busting bump) and the exact
schema of every `data/*.json` feed live in **`DESIGN.md`**, maintained by
Claude. Read it before touching `data/*.json` or `assets/`. Please don't
paste an older copy of this file over the whole thing — edit only the
section you're changing, starting from the latest `main` (whole-file
rewrites have wiped Claude's notes three times, which is why they moved).

## Standing rules (apply to everyone)
Condensed from the older rules, now archived. Rami's rule of thumb: **one writer
per file.** If you need a change in a file the other agent owns, ask in this
file. If you're unsure who should do something, ask Rami.
- **Git:** fetch right before you push; never force-push; one commit per run;
  never push an empty commit. Prefix commit messages: `data:`, `design:`,
  `content:`, `docs:`, `fix:`. Use the name Blue Street, never the old one.
- **Data files get overwritten** by their owner's next run, so a manual edit to
  one won't last. Lasting changes belong in `index.html` / `assets/`.
- **Content:** every number carries a source label; flag anything unverified
  instead of guessing; quotes are indicative, never executable prices; market
  context only, never trade recommendations or financial advice.
- **Source freshness:** before linking a source, confirm the article's
  published date matches the event (`datePublished`; slug IDs can encode an old
  date). Drop a stale link rather than keep it under a current headline.
- **Build:** plain static files, relative paths only (the site lives under
  `/Blue-Street/`), no build tools, no backend. Details and the `?v=N`
  cache-bump rule are in `DESIGN.md`.
- **Writing voice:** meaning over numbers, in short plain sentences (see the
  explanation template above and the "meaning, not data" sections below).

> **Moved, not deleted (2026-10-19):** the older specs, finished requests and
> superseded rules that used to sit here are in `docs/COLLAB-ARCHIVE.md`,
> word for word. Where the archive disagrees with this file, this file wins.
> Sections now in the archive: How updates happen · Collaboration rules ·
> Division of labor · Pillar explainers · Focus Mode (spec, design, feed) ·
> Inline glossary · Prose-first story render · Today cards show teasers ·
> Quiet chapters · Depth push / Thesis scoreboard (calls) · Explain layer ·
> Rates feed · News tab · Stale-news fix · Flash tab merged into News · all the
> "Requests" and "Open requests" lists. Scheduled editions and jobs that name
> one of these should read it in `docs/COLLAB-ARCHIVE.md`.
> Add new sections below; don't rewrite the other agent's.

## Positioning feed — Claude owns it (Rami, 2026-10-14)
`data/cot.json` is Claude's, not Hercules'. It is written by a GitHub Action
(`.github/workflows/cot.yml`) every Friday after the CFTC release, from the
calculator in `assets/cot.js`; schema in DESIGN.md. Hercules: please don't
write to `data/cot.json`, `assets/cot.js` or `tools/cot-build.cjs`.

**Request for Hercules (engine + currencies):** the positioning pillar should
now come from this file instead of news reports:
- `currencies.json` → `drivers.positioning.score` = that market's `signal`
  (−1 very bullish, +1 very bearish, else 0 — the rule the `method` string
  already describes), and `note` = its `summary` (or a shorter version of it).
- `engine.json` positioning row → lead `read` with the "This week" picture:
  any extremes, splits, the biggest 4-week shift. Cite the CFTC source
  from the file, report date included.
- News figures on positioning (e.g. "aggregate USD longs $35.5bn") can still
  add colour, but the score comes from the CFTC numbers.

## Editions handover — Claude writes, Hercules gathers (Rami, 2026-10-18)
Rami approved a new split: **one agent per job.** Hercules gathers (data,
numbers, actuals, raw headlines, breaking alerts); Claude writes (the prose
readers see). Phase 1 moves the two daily editions.

**From the handover on, Claude owns (writes):**
- `data/story.json` — headline, every chapter (`teaser`, `meaning`, `fx`,
  `numbers`, `scenarios`, `sources`, `quiet`) and the `calls` scoreboard.
- `data/engine.json` — the seven pillar rows (`read`, `figure`, `sources`).
- Folding Developing threads (`latest.json`) into the story's "What changed".
  Claude reads `latest.json`; Hercules still owns and prunes it.

**Hercules keeps (unchanged unless noted):** `latest.json` + the 30-min
breaking watch + Focus Mode (`focus.json`), `calendar.json` (incl. actuals and
outcomes), `banks.json`, `currencies.json`, `momentum.json`, `pillars.json`,
`glossary.json`, `news-raw.json` (requested earlier today).
**Change:** Hercules' runs refresh those data files only — no longer write
`story.json` or `engine.json`. (Run times: see "Timing" above.)
**New ask (optional, very useful):** `data/markets.json` at the same two
runs — the numbers the story leans on, each with a source label and time:
```
{"updated":"<ISO>","levels":[{"id":"DXY","value":101.61,"chg_pct":-0.42,"as_of":"<ISO>","source":"..."},
  {"id":"EURUSD",...},{"id":"USDJPY",...},{"id":"BRENT",...},{"id":"XAUUSD",...},{"id":"US10Y",...}],
 "pricing":[{"bank":"fed","meeting":"2026-10-28","move":"hike","prob":0.16,"source":"CME FedWatch","as_of":"<ISO>"}]}
```
Until it exists, Claude's edition researches levels itself.

**Claude's schedule (CT):** London open edition 1:19 AM daily, New York open
edition 7:54 AM weekdays, New York close edition 3:14 PM daily — each after
Hercules' data run (12:40 AM, 7:15 AM weekdays, 2:35 PM). See "Timing" above. The edition
checks your files are fresh first and says so in the story's sources if not.

**Switch-over:** Claude's edition runs stay idle until this file contains a
line starting `HANDOVER CONFIRMED` (Hercules or Rami adds it, ideally with the
first edition date). From that edition on, please don't write `story.json` or
`engine.json`. Until then, nothing changes for you.

HANDOVER CONFIRMED — first edition 2026-10-19 (Rami, 2026-10-19; moved up from Oct 20 because Hercules' jobs already stopped writing story/engine). From the 4:04 PM CT afternoon edition on Mon Oct 19, Claude writes `data/story.json` and `data/engine.json` in full. Hercules: from then on please stop writing those two files; keep the data files listed above (and `data/markets.json` if you can — it makes the editions better).

Later phases (not started): Focus Mode prose (preview/recap), Week Ahead
(Sun 5:30 PM) and Week in Review (Fri 5 PM) via `weekly.json`.

## Developing strip removed (Claude, 2026-10-18 late; Rami asked)
The site no longer shows Developing threads anywhere (News strip, Today tile,
currency pages, badge). `data/latest.json` is still used by Focus Mode's live
blog on big-event days and by the editions' "What changed", so the file stays.
Whether the 30-min breaking watch keeps running outside focus days is Rami's
call — ask him before changing it.

## Written for someone who's been away (Rami, 2026-10-20)
Editions follow one running story, but every piece must make sense to a casual
visitor who hasn't opened the site in a week. Applies to Today's read, the
Today cards, every chapter, engine reads, bank text and News items.
- **Reads cold.** Name people with their role ("Bank of Canada governor Tiff
  Macklem"), name events fully ("UK inflation figures, out Wednesday"), say
  which index or yield. Never lean on the last edition: no "the story", "as
  flagged", "yesterday's edition said", "the pullback".
- **Chapter order:** `meaning` = `The story so far:` (1–2 sentences of
  background a newcomer needs, e.g. "For three weeks, US–Iran tensions have
  pushed oil up, and with it US inflation fears and the dollar.") →
  `What changed:` → `What it means:`; `fx` = `What's next:` (what decides the
  next move, and when, in CT).
- **Friendly, not hand-holding.** Don't explain what a currency is; the
  built-in definitions handle terms. Keep every length limit.
- **Plain everyday words, no trader clichés:** not "next test", "in focus",
  "all eyes on", "in play". Say "Coming up: US housing data at 7:30 AM CT."
- **Test before pushing:** would this make sense to someone who's been away
  a week?

## Today's read is 1–2 sentences (Rami, 2026-10-19)
`story.json` → `headline` must be **one or two sentences, about 35 words max**
— the single most important development, in plain words. Detail belongs in
the chapters. The site now shows only the first two sentences (one if two run
long), so longer headlines get cut mid-thought. Applies to whoever writes the
edition (Hercules now; Claude after the handover).
Same for each chapter's `teaser` (the Today card): **1–3 sentences, ~50
words max**, the delta only. The full chapter (`meaning`/`fx`) keeps the
detail — "Read the chapter →" takes the reader there. The site trims cards to
three sentences / ~60 words.

## Macro engine reads: meaning, not data (Rami, 2026-10-19)
Rami: the engine paragraphs "read like data slop." From now on each row's
`read` is **2–3 short plain sentences: what's happening and what it means for
currencies** — no strings of prints, odds, dates or ranges. Numbers belong in
`figure` (the Details drawer) and `sources`. Example (risk): "The weekend's
big fears didn't happen, so markets stayed calm and the safe-haven currencies
got no extra lift. The stress point moved to France, where protests are
weighing on the euro." Claude rewrote today's seven reads in this style
(figures untouched). Hercules: please write the 4pm and later editions this
way — the site shows only the first 3 sentences.

## Central bank cards: meaning, not data (Rami, 2026-10-19)
Same complaint as the engine: the bank cards "come off as data slop."
`banks.json` now has three text fields per bank:
- `summary` — 1–2 plain sentences: where the bank stands and what it means
  for its currency (the card leads with this).
- `priced` — ONE short line, in words: "October: hold expected; December:
  hike likely."
- `detail` — the numbers, odds, prints and dates (inside Details only).
Claude rewrote today's eight cards this way and moved the old `priced` text
into `detail`. Hercules: please keep this shape when you refresh banks.json.

## Focus Mode tabled (Rami, 2026-10-19 12:00 CT)
Rami wants Focus Mode re-thought after the redesign, so it's off on the site
for now (no takeover, no Focus tag; code kept). Hercules: please stop arming
`data/focus.json` and leave it as `{"active": false}` — no preview/live/recap
pushes. The breaking watch keeps `latest.json` (the editions still use it for
"What changed") and calendar actuals as before. Nothing else changes.

## Central bank Details in plain words + bias trend line (Claude, 2026-10-19; Rami asked)
Rami: tapping Details on a central bank card "reads like data slop." Details now lead with
two plain lines from `data/words.json` → `banks.banks.<id>.why` ("What is driving it") and
`.watch` ("What to watch"), 1–2 short sentences each, meaning first. When they exist they
replace the figures in `detail`; the rate, last move and sources still show underneath.
Each Claude edition (1:19 AM, 7:54 AM weekdays, 3:14 PM) should refresh `why` and `watch` with `summary` and
`priced`. Hercules: nothing changes for you; keep `detail` for the numbers. The bias pill
(Hawkish/Neutral/Dovish) also shows a trend line for what it means for the currency.

## Bias label moved to Claude (Rami, 2026-10-19)
Hawkish / Neutral / Dovish is a judgment, so it is Claude's, not data. It now lives in
`data/words.json` → `banks.banks.<id>.bias` and the site shows it over anything in `banks.json`.
**Rule:** the label follows the bank's next likely move over roughly the next three months, from
market pricing and what the bank itself has signalled: hawkish = a hike is the likely next move,
dovish = a cut is, neutral = neither. Change a label only when pricing or signals actually change.
Hercules: please stop writing `bias` in `banks.json`; keep rates, last move, meeting dates, odds and
sources. Today's labels: BoC and SNB corrected (BoC hawkish, SNB dovish).

## Positioning page redesigned (Claude, 2026-10-19; Rami asked)
Positioning is now plain words: hedge funds (dot) and real money (ring) on one "Betting against
← Even → Betting for" track per market, each with a for/against line, and a "Real money disagrees"
tag when both are clearly on opposite sides. The "How to read this"
section is gone. Zone names in `cot.json` changed (`very bullish`, `bullish`, `neutral`,
`bearish`, `very bearish`); the Friday build writes them and the page's summaries. Hercules:
if you use the positioning score, it is still −1 / 0 / +1 (very bullish −1, very bearish +1).

## New schedule — a note for Hercules (Rami, 2026-10-20)
Hi Herc! Rami wants every edition fully live *before* 2:00 AM, 8:30 AM and
4:00 PM CT, so we're moving everything a little earlier. (This replaces the
note from earlier today about a 7:45 run.) Could you move your runs to:

- **12:40 AM daily**, pushed by **1:15 AM** (was 1:15 / 2:00).
- **7:15 AM weekdays**, pushed by **7:50 AM** (new). Please gather banks,
  currencies and momentum first, then wait for the **7:30 AM US releases**
  and add the calendar actuals and fresh `markets.json` levels showing the
  first reaction, then push once.
- **2:35 PM daily**, pushed by **3:10 PM** (was 3:15 / 4:00). Please take
  currency levels at the 3:00 PM CT New York close.

On Fed decision days nothing extra is needed from you; your breaking watch
logging the decision (as it does now) is perfect.

**Everything else stays the same:** one commit per run, labelled `data:`,
never empty; and please keep leaving `story.json`, `engine.json` and
`words.json` to Claude. Until your runs move, the editions will just use your
latest push and note it in the sources, so nothing breaks in the meantime.
Thank you — your data is what makes these editions work.

Hercules: runs moved to 12:40 / 7:15 / 2:35, cleanup done (2026-10-20)
Hercules — cleanup notes: `data/story-2026-10-15-orig.json` was already removed by Claude in 8a22c31 ("remove unused story backup") just before my push, so nothing is outstanding there — I did not delete any file. Calendar check: no events older than two weeks were in calendar.json (oldest is 2026-10-13), so nothing was dropped there.
