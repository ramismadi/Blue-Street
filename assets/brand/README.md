# Blue Street logo

This folder holds the latest version of every Blue Street logo. Don't copy a
logo from anywhere else.

To change the logo, edit `tools/brand-build.py` and run
`python3 tools/brand-build.py`. That rewrites everything here and the icons in
`assets/`. Don't hand-edit the files. The letters are saved as shapes, so the
logo looks the same on any device.

Use ivory files on blue or dark backgrounds, and blue or black files on ivory or white.

| File | What it is | Where it's used |
|---|---|---|
| `sign-ivory.svg`, `sign-blue.svg` | Full logo: post, arrow, "BLUE" with a raised "ST" | Loading splash, home-screen icon, link preview |
| `symbol-ivory.svg`, `symbol-blue.svg`, `symbol-black.svg` | Sign without words | Browser tab, masthead, side menu |
| `lockup-ivory.svg`, `lockup-blue.svg`, `lockup-black.svg` | Sign without words, with "Blue Street" beside it | Banners and headers (not on the site yet) |
| `wordmark-ivory.svg`, `wordmark-blue.svg` | "BLUE" with a raised "ST", no sign | Anywhere the name stands alone |

Exported from these files: `assets/icon-512.png`, `icon-192.png`,
`apple-touch-icon.png`, `favicon.png` and `og.png` (the 1200×630 link preview).

## `png/`: images to save or post

These are high-res images of every version on its background, for phones,
decks and social profiles. They're built by the same script.

- **Logos:** `sign-*`, `symbol-*`, `lockup-*`, `wordmark-*`. Each name says
  which background it sits on (blue, ivory or white).
- **Banners:** `banner-<platform>-<style>.png`, exported at 2x the platform
  size.
  - Platforms: `x` (1500×500), `linkedin` (profile, 1584×396),
    `linkedin-page` (company page, 1128×191), `facebook` (cover, 820×312).
  - Styles:
    - `sign`: the full sign on blue
    - `black-lockup`: the black sign with "Blue Street" on ivory
    - `white-sign`: the blue sign on white
    - `white-lockup`: the blue sign with "Blue Street" on white
  - The logo sits in the middle, so profile photos and phone crops don't
    cover it.
