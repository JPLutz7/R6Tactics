# R6 Stack // Command Center

A browser-based prep dashboard for a Rainbow Six Siege 5-stack: interactive map
references, our tactics per map/site, and a fast manual strat recommender you
alt-tab to between ranked rounds.

It is a **single self-contained `index.html`** — all CSS/JS inlined, no build
step, no dependencies. Open the file (or the GitHub Pages URL) and it just runs.

> **Live URL:** **https://jplutz7.github.io/R6Tactics/** &nbsp;_(live — note the capital **R**/**T**; the path is case-sensitive)_

---

## What it does (Phase 1)

- **⚡ Round Prep / Recommender** — pick the map, your side, and (optionally) the
  bombsite, then click the enemy operators you've seen. You instantly get a focused
  brief: the relevant site tactics for that side **plus** each enemy op's
  *how-to-counter* note, **plus** performance flags if you've imported stats.
  Built to be fast between rounds (see shortcuts below).
- **🗺 Maps** — browse maps, view each floor's schematic with callout pins, and
  read attack + defense tactics per bombsite. Doubles as the **tactics editor**
  (✎ Edit): add/remove maps, floors, callouts (drag pins to position), bombsites,
  and edit every tactics field in place.
- **👥 Roster & Roles** — players occupy roles; the recommended **operator pools
  live on the role**, not the person. Edit pools, role labels, notes, and who sits
  where.
- **🎯 Operators** — the full operator table (seeded with 75 of ~79). Each is
  tagged side + role with a *how-to-counter* note — **this is the field the
  recommender reads.** Add the rest as you face them.
- **💾 Data** — export/import everything as JSON, and the maintainer "publish"
  workflow below.

### Hard guarantees
100% client-side. **No integration of any kind** with the R6 client, Ubisoft,
tracker.gg, R6 Tracker, Overwolf, or BattlEye — no hooks, no overlay, no screen
reading, no logins, no scraping. **All data is entered manually** (UI or JSON
import). The app never touches the game process or fetches game data. ToS-safe by
design. (GitHub Pages here is *only* static file hosting.)

---

## Keyboard shortcuts (Round Prep)

| Key | Action |
| --- | --- |
| `1`–`5` | Switch tabs |
| `A` / `D` | Set side Attack / Defense |
| `[` / `]` | Previous / next map |
| `Q` `W` `E` … | Toggle bombsite by position |
| `/` | Focus the enemy-operator search |
| `X` / `Esc` | Clear selected enemy operators |
| `?` | Show all shortcuts |

---

## One-time GitHub Pages setup

1. Make sure `index.html` is at the **repo root** on the `main` branch (it is).
2. On GitHub: **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Set **Branch** to `main` and folder to **`/ (root)`**, then **Save**.
5. Wait ~1 minute. Your site goes live at
   `https://jplutz7.github.io/R6Tactics/` — **case-sensitive**, so match the repo
   name's capital **R**/**T**. Share that link with the stack.

No pipeline, no Actions, no build — Pages just serves the static file.

---

## How data & updates work

- The **seed tactics are embedded** inside `index.html` (a JSON constant). That's
  what every visitor sees by default, so **the tactics travel with the app**.
- The in-app editor saves a **working copy in each browser's `localStorage`**.
  Personal stuff (notes, imported stats) lives there too.
- **Export** writes a JSON file; **Import** loads one (covers all data).
- **Auto-refresh:** the embedded seed has a `version` number. When you publish a
  newer version, teammates who **haven't made local edits** silently pick it up on
  next load — no import step. Anyone who **has** local edits gets a small banner
  offering **Load update** (match the stack) or **Keep mine** (preserve their
  edits) — their work is never silently wiped.

### Publishing an update to the whole stack (maintainer)

1. Make your changes in the app (Maps / Roster / Operators tabs).
2. **Data tab → "Copy publish JSON."** This copies your full dataset to the
   clipboard **with the `version` already bumped** (e.g. `1 → 2`).
3. In `index.html`, replace the object between the
   `BEGIN EMBEDDED DATA` / `END EMBEDDED DATA` markers with what you copied.
   _(Keep the bumped `version` — that's what triggers teammates' auto-refresh.)_
4. Commit & push to `main`:
   ```bash
   git add index.html
   git commit -m "Update tactics (publish vN)"
   git push
   ```
5. GitHub Pages redeploys in ~1 minute. The stack opens the same URL and is
   current on next load.

> Tip: keep a backup with **Data → Export JSON** before big changes. To throw away
> your local working copy and reload the published seed, use **Data → Reset to
> published seed**.

---

## Editing locally

Just open `index.html` in a browser — no server needed. (If your browser is
strict about `localStorage` on `file://`, run a quick static server instead:
`python3 -m http.server` and open `http://localhost:8000`.)

---

## Roadmap (data model already scaffolded; not built yet)

- Map schematic editor: upload/draw real top-down floor layouts under the callout
  pins (the `layoutImage` + `x/y` callout coords are already in the model).
- Per-player stats dashboard (best/worst maps & ops) from imported `playerStats`.
- Per-site default-setup checklists (reinforce order, starting positions).
- Session notes / VOD-review log.
