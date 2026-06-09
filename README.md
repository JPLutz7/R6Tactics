# R6 Stack // Callouts

A clean, **light**, client-side **map-callouts reference + roster** for a Rainbow
Six Siege 5-stack — organized like [r6calls.com](https://www.r6calls.com/): pick a
map, read its room callouts floor-by-floor, with bomb-site objectives highlighted.
Plus a roster tab showing who plays what and each role's operator pool.

It's a **single self-contained `index.html`** — all CSS/JS inlined, no build step,
no dependencies, no external calls. Open the file (or the Pages URL) and it runs.

> **Live URL:** **https://jplutz7.github.io/R6Tactics/** &nbsp;_(note the capital **R**/**T** — the path is case-sensitive)_

---

## The two tabs

### 🗺 Maps  (callouts reference, r6calls-style)
- A **table of contents**: a gallery of **map cover tiles** for **every Siege map**
  (all 25, including **Calypso Casino**). Click a tile to open that map.
- Tiles are grouped into named **pools** — **Pro Pool** (locked all season),
  **Seasonal Pool** (rotates between updates), **Showcased** (the spotlight map) —
  then **Other Maps**. In **Edit**, use the dropdown on each tile to move a map
  between pools, rename a pool or its description, or add/remove pools as the
  rotation changes.
- Inside a map you see **one floor at a time**, with **floor tabs above** the image
  — click `Basement / 1F / 2F / …` to switch floors (or `[` / `]` to flip maps,
  `Esc` to go back to the gallery).
- Each floor is a real top-down plan you can **drag to pan** and **scroll / +−** to
  **zoom** (use ⟲ to reset). Labels and the on-map toggles stay put while you move.
- **On-map toggles** (top-left): **Room names**, **Bomb sites**, and **Spawn peeks**.
  Spawn-peek markers (red) come from [peekaboor6.com](https://peekaboor6.com) for the
  maps it covers — names + approximate spots you can fine-tune.
- **✎ Edit** mode lets you:
  - **⬆ upload a cover image** per map (gallery) and a **top-down image** per floor,
  - rename the map, add/remove floors,
  - add **＋ room** or **＋ spawn peek** labels and **drag the pins** to position them
    (or type x/y) — dragging works at any zoom.

> **Cover art** is Ubisoft's official map images (from ubisoft.com) in `assets/covers/`.
> **Top-down floor plans** are current layouts captured from
> [r6calls.com](https://r6calls.com) in `assets/floors/<map>/<n>.webp` (see
> `assets/floors/CREDITS.txt`; map data © Ubisoft). To swap one, **Edit → ⬆ Upload
> image** on a floor, or replace the file.

### 👥 Roster
- **Players** occupy **roles**; the recommended **operator pools live on the role**
  (not the person). Cards show each role's attack/defense label, occupant, and the
  attack (orange) / defense (blue) op pools.
- **✎ Edit** to rename players/roles, reassign roles, edit labels/notes, and
  add/remove operators from each pool.

> The operators, counters and per-site tactics from the original build are still
> **embedded under the hood** — set aside for now so we can fold a between-rounds
> **recommender** straight into the Maps tab later.

### ⚙ Data menu (top-right)
Export JSON (backup), Import JSON, **Copy publish JSON** (to push to the whole
stack), and Reset to the published seed.

### Keyboard
`1` / `2` switch tabs · `[` / `]` cycle maps.

### Hard guarantees
100% client-side, ToS-safe by design. **No *live* integration** with the running
R6 client, BattlEye, Overwolf, or any real-time, opponent-specific intel during a
match. Static / periodically-refreshed **reference** data is fine — callouts, map
data, peek videos, and tracker stats (operator & map win-rates) — it's the same
info anyone can look up between matches, baked into the app and updated manually,
with no in-match advantage. (GitHub Pages is just static hosting.)

---

## About images
- **Map covers:** Ubisoft's official map art, committed as files under
  `assets/covers/<id>.jpg` and referenced by path (so they don't bloat browser
  storage). This is why the project is no longer *strictly* one file — it's
  `index.html` + an `assets/` folder, still pure static hosting.
- **Top-down floor plans:** add per floor via **Edit → ⬆ Upload image**. These are
  stored in your browser (as data URLs) and travel with **Export / Copy publish
  JSON** — so keep them small (under ~500 KB each; the app warns if one is too big).
  For the whole stack to share floor images long-term, send them to me and I'll
  commit them under `assets/` and reference them by path like the covers.

---

## How data & updates work
- The **seed data is embedded** in `index.html`, so the maps/roster travel with the
  app. Your in-app edits save to **your browser** (`localStorage`).
- **Auto-refresh:** the seed has a `version`. When you publish a newer version,
  teammates who haven't edited locally pick it up automatically on next load.
  Anyone with local edits gets a "load update / keep mine" banner — never wiped.

### Publish an update to the whole stack (maintainer)
1. Make changes in-app, then **⚙ Data → Copy publish JSON** (it bumps `version` for you).
2. In `index.html`, replace the object between `BEGIN EMBEDDED DATA` / `END
   EMBEDDED DATA` with what you copied.
3. Commit & push to `main`:
   ```bash
   git add index.html && git commit -m "Update callouts (publish vN)" && git push
   ```
4. GitHub Pages redeploys (~1 min); the stack is current on next load.

> New to GitHub? Just send me the exported JSON (or describe the change) and I'll
> do the commit/push for you.

---

## One-time GitHub Pages setup
1. Repo must be **public** (free) — Settings → General → Change visibility, if needed.
2. **Settings → Pages** → **Source: Deploy from a branch** → **Branch: `main`**,
   folder **`/ (root)`** → **Save**.
3. ~1 min later it's live at `https://jplutz7.github.io/R6Tactics/`
   (**case-sensitive** — match the capital **R**/**T**). Share that with the stack.

No pipeline, no Actions — Pages just serves the single static file.

## Editing locally
Open `index.html` in a browser. If `localStorage` is blocked on `file://`, run a
quick static server instead: `python3 -m http.server` then open
`http://localhost:8000`.

---

## Roadmap
- Fold a **between-rounds recommender** + the **operator counters** into the Maps
  tab (data is already embedded).
- Bomb-site editing in the Maps editor (rename sites / set objective rooms).
- Per-player stats (best/worst maps & ops) from imported `playerStats`.
- Session notes / VOD-review log.
