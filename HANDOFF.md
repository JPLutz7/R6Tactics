# HANDOFF — R6 Stack Command Center

Living context doc so a new chat / developer can pick up where we left off.
**If you're a new AI session: read this file first, then continue.**

---

## 1. What this is
A browser dashboard a Rainbow Six Siege 5-stack uses to prep ranked rounds:
interactive map callouts (r6calls.com-style) + a roster. Pure client-side,
hosted on GitHub Pages. **No game/Ubisoft/tracker integration — manual data only,
ToS-safe by design.**

- **Live URL:** https://jplutz7.github.io/R6Tactics/  (path is **case-sensitive** — capital R/T)
- **Repo:** `jplutz7/R6Tactics`
- **Dev branch:** `claude/wizardly-tesla-6j23tl` → merged to `main` via PRs (GitHub Pages serves `main`, root).
- **Owner/maintainer:** João (IGL of the stack). Began as a non-GitHub user; prefers the assistant to handle git/PRs and image/data sourcing.

## 2. Files
```
index.html                  # the entire app: HTML + CSS + JS inlined (~7,300 lines). Light theme.
assets/covers/<id>.jpg       # 25 official Ubisoft map covers (gallery tiles)
assets/floors/<id>/<n>.webp  # floor-plan images, one per floor index n
assets/floors/CREDITS.txt    # attribution
README.md                    # GitHub Pages setup + "publish an update" workflow
HANDOFF.md                   # this file
```
There is **no build step**. Open `index.html` (or the Pages URL) and it runs.

## 3. App structure (two tabs)
- **Maps** — table-of-contents gallery of cover tiles, grouped into pools
  (**Pro Pool / Seasonal Pool / Showcased / Other Maps**). Click a tile → detail
  view: floor tabs above a **pan/zoom viewer** (drag = pan, scroll/±/⟲ = zoom).
  Fixed on-map overlay toggles: **Room names · Bomb sites (+ per-site dropdown) ·
  Spawn peeks** (each toggle only appears when that floor has that data). Markers
  are anchored to the map AND counter-scaled (stay constant-size when zooming).
  **✎ Edit** mode: rename/add/delete maps & floors, upload cover/floor images,
  add **＋room / ＋spawn peek** labels, drag any pin (works at any zoom).
- **Roster** — players occupy roles; recommended operator pools live on the role.

Top-right **Data** menu: Export JSON · Import JSON · **Copy publish JSON** · Reset.

## 4. Data model (embedded `SEED_DATA`, currently **version 13**)
Lives in `index.html` between `/* ====== BEGIN EMBEDDED DATA … */` and
`/* ====== END EMBEDDED DATA ====== */`. It's pretty-printed JSON.
```
{
  version, publishedAt,
  maps: [ { id, name, coverImage, notes,
            floors: [ { name, layoutImage, callouts: [ CALLOUT ] } ],
            bombsites: [ {id,name,rooms} ], tactics:{attack:{},defense:{}} } ],
  operators: [ {id,name,side,role,notes,howToCounter} ],   // 75, recommender field = howToCounter
  roles:     [ {id,name,attackRoleLabel,defenseRoleLabel,attackOps:[],defenseOps:[],notes} ],
  roster:    [ {name,roleId,notes} ],
  playerStats: [],                                          // optional, unused for now
  pools:     [ {id,name,note,mapIds:[]} ]                   // Pro / Seasonal / Showcased
}
CALLOUT = { name, x, y,            // x,y are PERCENT (0–100) of the floor image
            type? , site? , rate? }
  type: undefined/absent = room label | "peek" = spawn peek | "site" = bomb site
  site: digit "1".."4" (bomb-site group)   rate: peek success-rate %
```
Current counts: 25 maps, 75 operators, 5 roles, 5 roster, 3 pools, **748 room
labels, 105 spawn peeks, 37 bomb-site markers**.

The app normalizes any partial/old data at load (`normalizeDB`) so the editor
always sees the full structure.

## 5. Persistence & the publish model
- Embedded `SEED_DATA` is what every visitor gets by default (tactics travel WITH the app).
- In-app edits save a **working copy in localStorage** (`r6stack.data.v1`); per-browser
  bookkeeping (`r6stack.meta.v1`) holds `{seedVersion, dirty}` and never goes into exports.
- On load: if `SEED_DATA.version` > stored seedVersion and the user **hasn't edited**,
  the new seed is adopted silently; if they **have** edits, a non-destructive
  "load update / keep mine" banner shows.
- **To publish to the stack:** Data → *Copy publish JSON* (auto-bumps version) →
  replace the object between the BEGIN/END markers in `index.html` → commit & push →
  Pages redeploys. Cache-bust image changes with a `?query` on the path (see below).

## 6. Where the images/labels came from (pipelines)
All extraction was done with headless **puppeteer** + **curl** in `/tmp` (ephemeral,
NOT committed). Network access is available in the web session. Key facts to rebuild:
- **Covers** (`assets/covers/`): official Ubisoft art from each map page
  `ubisoft.com/.../maps/<slug>` → `staticctf.ubisoft.com/...` (prefer `_EXT`; for
  modernized maps the exterior is the `_meta` image).
- **Floor images** (`assets/floors/`):
  - **9 PeekabooR6 maps** (clubhouse, oregon, border, chalet, coastline, consulate,
    nighthaven-labs, skyscraper, calypso-casino): use **peekaboor6.com** building-
    focused images (R2 CDN `pub-…r2.dev/floors/<floor_id>-…webp`). Paths carry `?pk1`.
  - **16 other maps:** captured from **r6calls.com** (renders maps as SVG). Method:
    open map, select floor, set `svg viewBox="0 0 1447.271 814.09"` + `preserveAspectRatio
    xMidYMid meet`, then **screenshot clipped to the building group's on-screen rect**
    (`svg g[id^="Floor"]` getBoundingClientRect, +6% margin) at deviceScaleFactor 3.
    Paths carry `?bf`.
- **Room names** (`type` room): r6calls SVG `<text>` elements (use
  `getBoundingClientRect` — screen coords, NOT getBBox which is per-element local).
  Map onto the PeekabooR6 image via the same building-clip (building bbox + 6% margin →
  percent). Filter out objective letters (`/^\d?[A-Z]$/`) and ALL-CAPS exterior callouts.
- **Spawn peeks** (`type` peek): peekaboor6 floor pages. Data is in escaped JSON:
  regex `\\"name\\":\\"([^\\"]+?)\\",\\"x_pct\\":([\d.]+),\\"y_pct\\":([\d.]+)` — these
  are native % on the PeekabooR6 image (exact).
- **Bomb sites** (`type` site): r6calls objective markers matching `/^\d[A-Z]$/`
  (e.g. 1A/1B…4A/4B). Group A/B spots by leading digit = the 4 sites; name each by the
  nearest room label; one marker per site at the spots' centroid.

⚠️ **Gotcha:** JS `Set.add()` returns the Set (truthy) — a `filter(t=>!(seen.has||seen.add))`
dedup silently removes everything (Python's `set.add` returns None, so a ported snippet
"works" in Python but not JS). Use an explicit `if(seen.has) return false; seen.add; return true`.

## 7. Done ✓
- 25 maps with covers + readable floor plans; pools (Pro/Seasonal/Showcased).
- Pan/zoom viewer, on-map toggles, anchored constant-size markers.
- 9 maps layered with room names + bomb sites (per-site dropdown) + spawn peeks.
- Roster/roles, import/export, versioned publish model, README.
- 14 PRs merged (see `git log`). Seed at v13.

## 8. Known limitations / good next steps
- On the 9 PeekabooR6 maps, **room-name & bomb-site positions are APPROXIMATE**
  (PeekabooR6 vs r6calls crop differently) and **draggable** in Edit. Spawn peeks are
  exact. Site names come from the nearest room, so 1–2 may read slightly off.
- The **16 other maps** have room names **baked into the image** (no overlay/toggle).
  Could be unified by overlaying r6calls room data on them too.
- **Bank** isn't on PeekabooR6 (no peeks/overlays).
- **Roofs** were intentionally left as the older wide r6calls images (not building-focused).
- The recommender + operators table from the original Phase-1 build are **set aside**
  (data still embedded) — the owner wanted to "eventually integrate the recommender and
  the ops into the maps."
- Tactics fields (attack/defense per bombsite) are scaffolded but mostly empty — the
  owner fills these from VOD review.

## 9. Conventions
- Develop on `claude/wizardly-tesla-6j23tl`; open a PR to `main`; merge to deploy.
  (The owner is new to GitHub — handle git/PRs for them; don't push to `main` directly.)
- Don't create a PR unless asked, but here the established flow is PR-per-change then merge.
- Verify changes: `node --check`-style syntax via `vm.Script` on the inlined script,
  a jsdom smoke test, and a puppeteer screenshot before deploying.
- Cache-bust changed images by editing the `?query` on `layoutImage`/`coverImage` paths.

---

## 10. PROMPT FOR THE NEXT CHAT
Paste this into a fresh Claude Code session on the `jplutz7/R6Tactics` repo:

> Continue work on the R6 Stack Command Center (Rainbow Six Siege prep dashboard).
> **First read `HANDOFF.md` in the repo root** — it has the full state, data model,
> file layout, image/label extraction pipelines, conventions, and known limitations.
> It's a single-file app (`index.html`) + `assets/`, deployed to GitHub Pages from
> `main`; develop on branch `claude/wizardly-tesla-6j23tl` and merge via PR. Live at
> https://jplutz7.github.io/R6Tactics/ (case-sensitive). Validate with vm.Script syntax
> checks + a puppeteer screenshot before deploying, and cache-bust changed images with a
> `?query`. Then ask me what I want to do next (likely candidates: fine-tune label
> positions, fill in tactics per bombsite, fold the recommender/operators into the Maps
> tab, add room-name overlays to the 16 baked-in maps, or add Bank).
