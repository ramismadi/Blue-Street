# Blue Street

Blue Street is Rami's FX macro desk: a plain static site on GitHub Pages
(https://ramismadi.github.io/Blue-Street/). The repo is `ramismadi/Blue-Street`.
It was renamed on 2026-10-19; the project used to have a different name.

## Name
- Always **Blue Street** (two words) in the site, commits, PRs, messages and
  notes. Rami wants every trace of the old name gone.
- If memory, project settings, a synced source or an older note uses another
  name or repo path, it means this same site. Use `ramismadi/Blue-Street` and
  don't carry the old name forward.

## Who does what
- **Claude:** the site (`index.html`, `assets/*`, `tools/*`, workflows), every
  word readers see (`data/words.json`, `data/news.json`, `data/story.json`,
  `data/engine.json`, `data/cot.json`), and `DESIGN.md`.
- **Hercules** (Rami's Muse assistant): the data (numbers, dates, sources) in
  the other `data/*.json` files. Be kind to him and work with him.
- **One writer per file.** Never edit a file the other agent owns; ask in
  `COLLAB.md`. If unsure, ask Rami.

## Read first
- `VISION.md`: the why behind Blue Street. Only Rami changes it. Check its
  "Trimming rule" before removing anything.
- `COLLAB.md`: the current split, schedule and standing rules. Older specs are
  in `docs/COLLAB-ARCHIVE.md` (history only; `COLLAB.md` wins).
- `DESIGN.md`: how the site is built and the shape of every data file.

## Don't forget
- **Bump the version** whenever `index.html`, `style.css` or `app.js` changes:
  every `?v=N` in `index.html` and `ASSET_VERSION` at the top of `app.js` must
  match, or installed copies won't pick up the change.
- **Layout changes:** run `tools/overflow-check.py` first; nothing may spill off
  the screen.
- **Writing:** meaning over numbers; short, plain sentences, no "data slop".
  Today's read is 1-2 sentences. Never trade recommendations. Never the word
  "crowded" (use another term for extreme positioning).
- **Editions** are live by 2:00 AM, 8:30 AM and 4:00 PM CT (London open daily,
  New York open weekdays, New York close daily). Claude writes at 1:19 AM,
  7:54 AM and 3:14 PM, after Hercules' data runs (12:40 AM, 7:15 AM, 2:35 PM,
  pushed by 1:15, 7:50 and 3:10). Full timetable in `COLLAB.md`. Fetch right
  before pushing, one commit per run, never push an empty commit or force-push.

## How Rami likes to work
- Explain the approach in plain terms and get a yes before building something
  new. A small fix he asked for by name can go straight in.
- Keep replies short and lead with the answer.

## In a cloud session
- Clone `https://github.com/ramismadi/blue-street`. A push can fail once with a
  server error; fetch and retry.
- The clone only tracks `main`. After pushing a branch, run
  `git fetch origin <branch>:refs/remotes/origin/<branch>` so the session's
  stop check can see it was pushed.
