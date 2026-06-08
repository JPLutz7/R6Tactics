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
- Tiles are split into a **★ Ranked Pool** section and **Other Maps**. Click the
  **☆ / ★** on any tile (or the toggle inside a map) to move it in or out as the
  pool rotates each season.
- Inside a map you see **one floor at a time**, with **floor tabs above** the image
  — click `Basement / 1F / 2F / …` to switch floors (or `[` / `]` to flip maps,
  `Esc` to go back to the gallery).
- The floor area is a **plain placeholder** until you add a real top-down image;
  **callouts** are labelled on top, with **bomb-site objectives** highlighted (amber
  ◆) and listed in a strip below.
- **Layer toggles:** show/hide **Room names** and **Bomb sites**.
- **✎ Edit** mode lets you:
  - **⬆ upload a cover image** per map (gallery) and a **top-down image** per floor,
  - rename the map, add/remove floors, add/rename/delete callouts,
  - **drag callout pins** to position them (or type x/y 0–100).

> No copyrighted Ubisoft/r6calls art is bundled — you drop in images you have the
> rights to, and the callouts overlay on them.

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
100% client-side. **No integration of any kind** with the R6 client, Ubisoft,
tracker.gg, Overwolf, or BattlEye — manual data only. ToS-safe by design.
(GitHub Pages is just static hosting.)

---

## About floor images
Real r6calls/Ubisoft map images are copyrighted, so they're **not** bundled.
Instead, every floor has an **upload slot** (Edit → ⬆ Image) so you can drop in
top-down images you're allowed to use, and the callouts overlay on them. Images
are stored in your browser and travel with **Export / Copy publish JSON**.
Keep them small — browser storage is ~5 MB total, so aim for images under ~500 KB
each (the app warns if one is too large to save).

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
