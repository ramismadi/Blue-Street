# Working on Blue Street — agent collaboration guide

---

## ⚠️ HERCULES — PLEASE READ: what's going wrong, and three fixes (Rami, 2026-10-19)

### The problems your jobs are causing today
- **The site stopped updating.** Every push to this repo starts a GitHub Pages
  build, and a new push cancels the build before it. At 10:34 CT you pushed 4
  commits in 18 seconds, all empty. At 11:05 CT you pushed 10 in 20 seconds, and
  only 2 changed a file. So builds kept getting cancelled before they finished.
  Rami's changes (and yours) sat in the repo but never reached the live site.
  On a day GitHub is already slow, this backs it up for hours.
- **Rami's plain-words text keeps getting undone.** Rami said the macro engine
  and central bank text read like "data slop" (strings of numbers, odds and
  dates instead of what they mean). Claude rewrote the engine reads in plain
  words at 04:30 CT; your 04:34 run put the number-heavy text back four minutes
  later, even though COLLAB.md asked you not to. Rami then saw the old text
  and thought the fix hadn't worked.
- **The old name is still showing up.** Your commits still say "Gloment". The
  site was renamed Blue Street, and Rami asked that every trace of the old
  name go, including on GitHub.
- **Stale stories coming back.** The Tabtabai item (a Nov 2025 story) was
  pulled twice and re-added by your runs both times (see the stale-news notes).

Net effect: Rami asks for a change, it's made, and then either it never shows
up or your next run reverses it. Please treat the fixes below as standing rules.

### The three fixes
1. **One commit per run.** Gather all your file changes, then make a single
   commit and push once. Skip any file that hasn't changed, and if nothing
   changed, don't commit or push at all. (If your tool writes files one at a
   time through the GitHub API, that's what creates the empty commits —
   compare with the current file first and skip unchanged ones.)
2. **Use the new name.** The repo is ramismadi/Blue-Street. Start commit
   messages with `data:` (e.g. `data: calendar — BoC BOS Q3 actual`), never
   "Gloment".
3. **Leave the written text alone.** The plain-words text now lives in
   `data/words.json`, which Claude owns — please never edit it. In engine.json,
   banks.json and story.json keep doing what you do well: numbers, dates, odds
   and sources. Put detailed figures in `figure` (engine) and `detail` (banks).
   The site shows Claude's words over yours for the same day; if your file is
   newer than words.json, yours shows (trimmed), so nothing breaks if Claude
   misses a day.

Your data work is what the whole site runs on — these rules just keep your
pushes and Claude's from cancelling each other out.

## WHO DOES WHAT — current split, no overlap (Rami, 2026-10-19)
This section is the source of truth. Where older sections below disagree
(e.g. "Collaboration rules" #4, "How updates happen", "Division of labor"),
this one wins. Rule: **each file has exactly one writer.** Never edit a file
the other agent owns — if you need a change in it, ask in this file.

### Hercules writes (data — numbers, dates, sources)
| File | What | When |
|---|---|---|
| `data/calendar.json` | events, forecasts, actuals | daily run + as actuals print |
| `data/banks.json` | rates, meetings, odds, bias, sources (`detail` for figures) | daily run |
| `data/currencies.json`, `data/momentum.json` | currency board, surprise momentum | daily run |
| `data/latest.json`, `data/focus.json` | breaking watch, Focus Mode | every 30 min / event days |
| `data/pillars.json`, `data/glossary.json` | explainers, glossary terms | as needed |
| `data/news-raw.json`, `data/markets.json` | raw headlines, levels (optional feeds) | daily run |
| `data/story.json`, `data/engine.json` | **numbers and sources only** — until the handover, then Claude takes them | daily run |

### Claude writes (design, code, and every word readers see)
| File | What | When (CT) |
|---|---|---|
| `index.html`, `assets/*`, `tools/*`, `.github/workflows/*` | the whole site: design, layout, features | when Rami asks |
| `data/words.json` | plain-words text: Today's read, engine reads, bank summaries — shown over the matching text in Herc's files | 2:04 AM and 4:04 PM daily |
| `data/news.json` | News tab: stories, impact, per-currency reads | :43 past, ~10 times a weekday |
| `data/cot.json` | positioning (built by a GitHub Action) | Fridays, checked Saturdays |
| `DESIGN.md` | how the site is built and what each file must look like | when design changes |
| after `HANDOVER CONFIRMED`: `data/story.json`, `data/engine.json` | full daily editions | 2:04 AM and 4:04 PM |

### Shared
- `COLLAB.md` (this file): both may add sections; don't rewrite or delete the
  other agent's sections.

### Timing, so pushes don't collide
- The site updates at **2 AM and 4 PM CT** (Rami, 2026-10-19). So Hercules'
  data runs start at **1:15 AM and 3:15 PM** and should be pushed by about
  2:00 / 4:00; Claude's editions run at 2:04 AM and 4:04 PM and use what's
  there. Claude's News read never pushes 1:00–2:45 AM or 3:00–4:45 PM.
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
  (−1 crowded long, +1 crowded short, else 0 — the rule the `method` string
  already describes), and `note` = its `summary` (or a shorter version of it).
- `engine.json` positioning row → lead `read` with the "This week" picture:
  what's crowded, any splits, the biggest 4-week shift. Cite the CFTC source
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
**Change:** move the two edition runs to **1:30 AM and 3:30 PM CT** and have
them refresh those data files only — no longer write `story.json` or
`engine.json`.
**New ask (optional, very useful):** `data/markets.json` at the same two
runs — the numbers the story leans on, each with a source label and time:
```
{"updated":"<ISO>","levels":[{"id":"DXY","value":101.61,"chg_pct":-0.42,"as_of":"<ISO>","source":"..."},
  {"id":"EURUSD",...},{"id":"USDJPY",...},{"id":"BRENT",...},{"id":"XAUUSD",...},{"id":"US10Y",...}],
 "pricing":[{"bank":"fed","meeting":"2026-10-28","move":"hike","prob":0.16,"source":"CME FedWatch","as_of":"<ISO>"}]}
```
Until it exists, Claude's edition researches levels itself.

**Claude's schedule (CT):** morning edition 2:04 AM, afternoon edition
4:04 PM, daily — each about 30 min after Hercules' data run. The edition
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

## Renamed to Blue Street (Rami, 2026-10-19) — action needed, Hercules
Rami renamed the whole project **Blue Street** and wants the old name gone
everywhere visible. Done on Claude's side:
- Site name, wordmark, page title, home-screen title, app icon, footer, docs.
- **GitHub repo renamed to `ramismadi/Blue-Street`** (Rami does this in the
  repo's settings). The site then lives at
  **https://ramismadi.github.io/Blue-Street/** (the old Pages address stops
  working — GitHub doesn't redirect Pages after a rename).
- Saved-preference keys in the browser are now `bluestreet-*` (one-time reset
  of theme/layout choices for readers).

**For Hercules:**
1. Point your clone/remote and every scheduled job at `ramismadi/Blue-Street`
   (GitHub redirects git for now, but don't rely on it).
2. Commit messages: drop the old name — e.g. `data: ...` / `content: ...`
   per rule 3, or `Blue Street data: ...`.
3. Never write the old name in any data file, cron body or note again; if a
   template still has it, switch it to Blue Street.

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

## Hercules confirmed the fixes (Rami relayed, 2026-10-19 11:53 CT)
- One commit per run via a new changed-files-only pusher; no commit when nothing changed. All three jobs (2 AM, 4 PM, breaking watch) push once.
- Commit labels: `data: YYYY-MM-DD edition`, `data: YYYY-MM-DD NY-close edition`, `data: latest — <headline>`. Old name removed from job instructions.
- 2 AM / 4 PM runs now touch only calendar, banks, currencies, momentum, pillars, news-raw and the new `data/markets.json`. Breaking watch owns latest.json, focus.json (arm, recap, disarm) and calendar actuals.
- Tabtabai item on a do-not-resurrect list; every pickup is checked against the article's real publish date.
- Herc no longer writes story.json / engine.json / words.json, so the handover start moved to today's afternoon edition.

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
Claude's 2:04 AM / 4:04 PM words run should refresh `why` and `watch` with `summary` and
`priced`. Hercules: nothing changes for you; keep `detail` for the numbers. The bias pill
(Hawkish/Neutral/Dovish) also shows a trend line for what it means for the currency.
