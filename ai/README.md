# Blue Street AI link

Lets a reader connect their own AI (Claude, ChatGPT, or any app that speaks
MCP) to Blue Street and ask it questions in plain language:

- "What's driving the dollar today?"
- "Give me the evidence on EUR/USD."
- "What's on the calendar for the pound this week, and what's expected?"

Started 2026-11-16 (Rami asked). Owned by Claude.

## What's here
| Path | What it is |
|---|---|
| `ai/mcp/server.mjs` | The connector. One file, no dependencies, Node 18+. |
| `llms.txt` (site root) | A plain-text guide for any AI that reads the site without the connector. |
| `ai/README.md` | This file. |

## The rules it follows
1. **Read-only.** It can't change anything.
2. **Plain words or nothing.** It serves the words the site shows. Text that
   reads like desk shorthand is dropped, never passed on. The filter lives in
   `plain()` and mirrors the site's own.
3. **Evidence, not calls.** No tool returns a trade recommendation. Every
   answer carries that note, and the connector tells the AI the same.
4. **No new data files.** It reads the site's own `data/*.json`, so it is
   always as fresh as the site and adds nothing to maintain.

## The six tools
| Tool | Answers |
|---|---|
| `get_today` | Today's read, the seven drivers, the strength ranking, next big events |
| `get_currency` | One market in full: drivers, central bank, story, scenarios, positioning, headlines |
| `get_pair` | Both sides of a pair, the score gap, the interest-rate gap, next events |
| `get_calendar` | What's coming and what's expected; recent results and what they did |
| `get_news` | Headlines with a summary and which way each pushes; one story in full by id |
| `get_positioning` | What hedge funds and real money are betting on, and how extreme it is |

Markets: USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD, XAU (gold), OIL.

## Connect it (today: runs on your own computer)
1. Install Node 18 or newer.
2. Download `ai/mcp/server.mjs` (or clone this repo).
3. In your AI app's settings for local MCP servers, add a server that runs:
   `node /full/path/to/ai/mcp/server.mjs`

Most desktop apps take that as a small config entry like this:
```json
{ "mcpServers": { "blue-street": { "command": "node", "args": ["/full/path/to/ai/mcp/server.mjs"] } } }
```
Check your app's own help page for where that entry goes; it differs by app
and version.

By default it reads the live site. To point it at a local copy (for testing):
`BLUE_STREET_DATA=./data node ai/mcp/server.mjs`

## Test it
```sh
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_pair","arguments":{"pair":"EUR/USD"}}}' \
 | BLUE_STREET_DATA=./data node ai/mcp/server.mjs
```

## What comes next
- **Hosted version.** A web address a reader pastes into their AI app, with no
  download. Needs a real host (GitHub Pages can't run it). Comes with the paid
  step, behind a login.
- **Learn tool.** Once the Learn hub is built, a tool that explains a term or
  a driver.
- **Score history.** Once Scoring v2 is live, how a score has moved over time.

## When the site's data changes shape
The connector reads `currencies`, `words`, `story`, `engine`, `banks`,
`calendar`, `news`, `cot` and `rates`. If a field in one of those is renamed,
update the matching lines in `server.mjs` and re-run the test above.
