# Blue Street logo

This folder holds the latest version of every Blue Street logo. Don't copy a
logo from anywhere else.

To change the logo, edit `tools/brand-build.py` and run
`python3 tools/brand-build.py`. That rewrites everything here and the icons in
`assets/`. Don't hand-edit the files. The letters are saved as shapes, so the
logo looks the same on any device.

Use ivory files on blue or dark backgrounds, and blue or black files on ivory (Rami prefers ivory to plain white).

| File | What it is | Where it's used |
|---|---|---|
| `sign-ivory.svg`, `sign-blue.svg` | Full logo: post, arrow, "BLUE" with a raised "ST" | Loading splash, home-screen icon, link preview |
| `symbol-ivory.svg`, `symbol-blue.svg`, `symbol-black.svg` | Sign without words | Browser tab, masthead, side menu |
| `lockup-ivory.svg`, `lockup-blue.svg`, `lockup-black.svg` | Sign without words, with "Blue Street" beside it | Banners and headers (not on the site yet) |
| `wordmark-ivory.svg`, `wordmark-blue.svg` | "BLUE" with a raised "ST", no sign | Anywhere the name stands alone |

Exported from these files: `assets/icon-512.png`, `icon-192.png`,
`apple-touch-icon.png`, `favicon.png` and `og.png` (the 1200×630 link preview).

## `png/`: images to save or post

These are high-res images of every version, sorted by look and built by the
same script.

- `sign/`: the full logo on blue or ivory
- `symbol/`: the sign without words (blue, ivory, black)
- `lockup/`: the sign with "Blue Street" beside it (blue, ivory, black)
- `wordmark/`: BLUE ST on its own
- `banners/<style>/`: social headers at 2x size for X (1500×500),
  LinkedIn profile (1584×396), LinkedIn company page (1128×191) and
  Facebook (820×312). The logo sits in the middle, so profile photos and
  phone crops don't cover it.
  - `blue-sign`: the full sign on blue
  - `ivory-sign`: the blue sign on ivory
  - `black-lockup`: the black sign with "Blue Street" on ivory
  - `ivory-lockup`: the blue sign with "Blue Street" on ivory
