# HANDOFF — R6 Stack Command Center

Living context doc so a new chat / developer can pick up where we left off.
**If you're a new AI session: read this file first, then continue.**

---

## 1. What this is
A browser dashboard a Rainbow Six Siege 5-stack uses to prep ranked rounds:
interactive map callouts (r6calls.com-style) + a roster. Pure client-side,
hosted on GitHub Pages. **ToS-safe by design** — see the rule below.

**Rule (data / ToS).** The line is *live, in-match opponent intel*, not data in
general. **Not allowed:** anything that reads the running game / BattlEye /
Overwolf, or auto-pulls real-time, opponent-specific information about the team
you're currently facing (a live tracker overlay, instant opponent lookups, etc.).
**Allowed:** static or periodically-refreshed **reference** data baked into the
seed and updated manually / every few hours — callouts, map data, peek videos,
**and tracker stats** such as operator & map win-rates. It's the same info anyone
can look up between matches, so it gives no unfair in-match advantage. Tracker
stats are fine under this rule **as long as they're static/delayed, never live**.

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

## 4. Data model (embedded `SEED_DATA`, currently **version 36**)
Lives in `index.html` between `/* ====== BEGIN EMBEDDED DATA … */` and
`/* ====== END EMBEDDED DATA ====== */`. It's pretty-printed JSON.
```
{
  version, publishedAt,
  maps: [ { id, name, coverImage, notes,
            floors: [ { name, layoutImage, callouts: [ CALLOUT ] } ],
            bombsites: [ {id,name,rooms} ], tactics:{attack:{[siteId]:TAC},defense:{[siteId]:TAC}} } ],
  operators: [ {id,name,side,winRate,role,notes,howToCounter} ], // 75. winRate = real win-rate %, see §11
  roles:     [ {id,name,side,desc,ops:[]} ],   // 13 SIDE-SPECIFIC roles (6 attack, 7 defense); ops render ordered by winRate desc (§11)
  roster:    [ {name,attackRoles:[roleId],defenseRoles:[roleId]} ], // two priority lists/player (order=priority); drag role cards onto a player's ATK or DEF list
  playerStats: [],                                          // optional, unused for now
  pools:     [ {id,name,note,mapIds:[]} ],                  // Pro / Seasonal / Showcased
  suggester: { archetypes, archetypeLabels, matchups, approachLabels, approachAdvice, defenders } // §12 — tunable attack-suggester config
}
CALLOUT = { name, x, y,            // x,y are PERCENT (0–100) of the floor image
            type? , site? , rate? , video? , steps? , tip? , difficulty? , risk? }
  type: undefined/absent = room label | "peek" = spawn peek | "site" = bomb site
  site: digit "1".."4" (bomb-site group)   rate: peek success-rate %
  peek extras (from PeekabooR6): video (hotlinked .mov URL), steps[] (how-to),
    tip, difficulty (1–5), risk — shown in the click-to-open peek popup.
TAC = { ...legacy flat fields, strats: [ STRAT ] }          // see §12
STRAT = { id, name, summary, slots:[ {role, ops:[opId], pos} ], reinforce:[], rotations:[], breach:[], approach? }
  (attack strats carry approach = hardbreach|vertical|flank|utility, used by the suggester §12)
  role = a SIDE-SPECIFIC role id (matches the tactic's side); ops = 2–4 op options for that
  slot; pos = that player's gadget/job (rendered in the "Gadgets & jobs — by player" section).
  reinforce/rotations = defense bullet groups; breach = attack "Open up" walls. The Tactics
  panel assigns each rostered player a slot by their role priority.
bombsite also carries `site` (the "1".."4" digit) so a tactic can focus the site filter.
```
Current counts: 25 maps, 75 operators, 5 roles, 5 roster, 3 pools, **99 bomb-site
markers, 105 spawn peeks** as overlays. As of v15 **every map** uses r6calls
building-focused floor plates (PeekabooR6 retired). **Room names AND bomb sites are baked into the image** (the r6calls `txt` and
`N-bmb` layers are kept visible when capturing). Bomb-site + spawn-peek overlay
markers (with the per-site dropdown) are still emitted and toggle ON ON TOP of the
baked-in sites; room names are baked-only (no overlay).

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
- **Floor images + overlays — ALL 25 maps now come from r6calls (v14 rewrite).**
  PeekabooR6 is retired. r6calls is a SPA: map metadata at
  `https://r6calls.com/data/mainData.json` (`mapData[key] = {imgUrlPrefix, minFloor,
  maxFloor, scaleFactor}`), and each map is **one self-contained SVG** at
  `https://r6calls.com/img/maps/<imgUrlPrefix>.svg` (viewBox `0 0 1447.271 814.09`).
  - Per-floor structure inside the SVG: top-level group `g#"Floor N"` (N = r6 floor
    index, can be negative). It contains `image#N-pic` (the floor plan raster —
    **1024×1024**, this is the resolution ceiling; the whole-map `g#Background` is a
    single 3840×2160 PNG) plus vector sub-layers: `N-txt` (room labels), `N-bmb`
    (bomb markers `bomb-1A`…`bomb-4B`), `N-bw/cam/ld/fh/ch/...` (walls, cameras,
    ladders, hatches — kept baked in). **Gotcha:** `N-pic` ships with inline
    `display="none"`; force `.style.display='inline'` or the plate renders blank.
  - **Capture** (`/tmp/capmap.js`): load the SVG via `setContent`, show `Background`
    + the target `Floor N` (+ `N-pic`) for the r6calls ground composite (realistic
    terrain + crisp white wall outlines), **keep `N-txt` baked in (room names)**, hide
    only `N-bmb/cmp/lg`. Size the `<svg>` so the building (`N-pic`
    getBoundingClientRect) is ~2400px long edge, screenshot that rect +5% margin →
    webp q88 (this crops away the far exterior = "building-focused"). **Roof** (= the
    SEED map's last floor / r6 maxFloor): crop the whole map (~2600px wide).
  - SEED floor i ↔ r6 floor `(minFloor + i)`; floor name (Basement/1st…/Roof) lines
    up positionally. Map-id→prefix+minFloor table lived in `/tmp/mapcfg.js`.
  - **Consistent per-map frame + floor stacking (v16):** the crop rect is the
    **union** of every floor's building-content alpha bbox (so all floors of a map
    share one full-building frame and nothing jumps/looks cut off). Partial upper
    floors are rendered by **stacking** floors `minFloor..N` (lower ones at 0.72
    opacity, the active floor on top at full opacity with its room labels) so the
    whole building shows. Page bg is dark (`#0c0c0c`) so any concave-edge bleed reads
    as r6calls' void. Cap the svg raster at ~8000px — two stacked 1024px floor PNGs
    upscaled past ~9k blank the frame; add a paint wait before screenshotting.
  - **Room names: baked into the image** (not callouts) as of v15. The capture still
    measures `N-txt` centers, but only to anchor the spawn-peek affine fit (below) —
    no room-name overlay callouts are emitted.
  - **Bomb sites** (`type` site): `bomb-<digit><A/B>` markers in `N-bmb`; group by
    leading digit = the sites; one marker per site at the spots' centroid; name = the
    nearest room label.
  - **Spawn peeks** (`type` peek): peeks are PeekabooR6-only data and were NOT
    re-extracted — their old (peekaboo-space) %coords were **transformed** into the
    new r6calls crop space by a per-floor **axis-aligned per-axis linear fit**
    (independent x and y scale+offset) anchored on room labels common to both sets.
    PeekabooR6 and r6calls share orientation but differ in aspect, so a full affine
    added shear that mis-extrapolated the perimeter peeks; the per-axis fit is the
    correct model (RMSE ≤0.12%, consistent x/y scales across each map's floors).
    PeekabooR6's source images are busy 3D screenshots, so auto wall/building
    detection on them is unreliable — room-label correspondences are the anchor.
- Image paths carry the cache-bust query **`?r6`** (was `?pk1`/`?bf`); bump it
  whenever the floor images are re-rendered.

⚠️ **Gotcha:** JS `Set.add()` returns the Set (truthy) — a `filter(t=>!(seen.has||seen.add))`
dedup silently removes everything (Python's `set.add` returns None, so a ported snippet
"works" in Python but not JS). Use an explicit `if(seen.has) return false; seen.add; return true`.

## 7. Done ✓
- 25 maps with covers + readable floor plans; pools (Pro/Seasonal/Showcased).
- Pan/zoom viewer, on-map toggles, anchored constant-size markers.
- **All 25 maps** on r6calls building-focused plates with **room names baked in**;
  bomb-site (per-site dropdown) + spawn-peek overlays on top. Spawn peeks on the 9.
- Spawn peeks carry PeekabooR6 success-rate %, how-to video, steps, tip, difficulty/risk; clicking a peek label opens a popup with the video (hotlinked from PeekabooR6's R2 CDN, attributed). Matched by map+name; videos are .mov (Firefox shows an "Open video" fallback).
- **Roster tab (v26): side-specific roles.** Roles are now split by side — **6 attack
  roles** (IGL, Entry Fragger, Hard Breacher, Support, Intel/Recon, Flex) and **7 defense
  roles** (IGL, Anchor, Roamer, Trapper, Anti-Breach/Support, Intel, Flex). Each role has a
  `side`, a `desc`, and a single `ops` pool (rendered ordered by win-rate). The Roles area
  shows two grouped sections (Attack roles / Defense roles). Each **player has two priority
  lists** (`attackRoles` + `defenseRoles`), shown as separate ATK/DEF rows; assign by
  **dragging a role card's ⠿ handle onto the matching-side list** (drops only accept the
  matching side), reorder by dragging chips, remove with ✕.
- **Operator pools ordered by real win-rate** (highest→lowest) with a win-rate % on each
  `.opchip` (`rolePoolHTML()`/`wrOf()`); per-operator `winRate` baked into the seed — §11.
- **Click any operator chip → detail popup** (`openOpModal()`): round win-rate, side,
  role, "what they do" (`notes`) and "how to counter" (`howToCounter`). Reuses the `.modal`
  pattern; close via ✕ / backdrop / Esc.
- **Tactics system (v27, §12):** map detail now has a right-hand **Tactics panel** —
  strats grouped by side → site. Tap one → the map jumps to that site's floor and the
  panel shows the strat: a per-player operator assignment (2–4 options each, picked from
  the player's prioritised roster roles), reinforcements, and ordered steps. **Clubhouse
  is fully seeded** (2 defense + 3 attack per site, all 4 sites = 20 strats).
- Import/export, versioned publish model, README. **Data/ToS rule clarified (§1):**
  static or periodically-refreshed reference data (incl. tracker win-rates) is fine;
  only *live, in-match opponent intel* is banned.
- Seed at **v26**.

## 8. Known limitations / good next steps
- r6calls' per-floor source art is only **1024×1024** (whole-map background is
  3840×2160). Plates are rendered/upscaled to ~2400px — sharper than the old images
  but not true 4K; that's the ceiling for this source.
- **Room names are baked into the image** (native r6calls placement). Earlier attempts
  to render them as overlay callouts read worse, so we dropped them. **Bomb sites** are
  exact (from the r6calls SVG). **Spawn peeks** were re-projected from the old
  PeekabooR6 coords by a per-axis (axis-aligned scale) fit on room labels — now
  land on their windows/doors, still draggable in Edit. Site
  names come from the nearest room, so 1–2 may read slightly off.
- **Roofs** are intentionally the whole-map (not building-focused) view, no overlays.
- The recommender + operators table from the original Phase-1 build are **set aside**
  (data still embedded) — the owner wanted to "eventually integrate the recommender and
  the ops into the maps."
- Tactics fields (attack/defense per bombsite) are scaffolded but mostly empty — the
  owner fills these from VOD review.

## 9. Conventions
- Develop on the session's assigned `claude/*` branch; open a PR to `main`; merge to
  deploy. (The owner is new to GitHub — handle git/PRs for them; don't push to `main`
  directly. The owner is fine with you opening + squash-merging PRs per change.)
- Bump SEED `version` whenever the embedded data changes (the app adopts a higher
  version on load). The owner publishes their own in-app edits via Data → *Copy publish
  JSON* and pastes the JSON back to you to commit.
- Don't create a PR unless asked, but here the established flow is PR-per-change then merge.
- Verify changes: `node --check`-style syntax via `vm.Script` on the inlined script,
  a jsdom smoke test, and a puppeteer screenshot before deploying.
- Cache-bust changed images by editing the `?query` on `layoutImage`/`coverImage` paths.

---

## 10. PROMPT FOR THE NEXT CHAT
Paste this into a fresh Claude Code session on the `jplutz7/R6Tactics` repo:

> Continue work on the R6 Stack Command Center (Rainbow Six Siege prep dashboard).
> **First read `HANDOFF.md` in the repo root** — full state, data model, file layout,
> image/label extraction pipelines, conventions, the data/ToS rule (§1), and known
> limitations. Single-file app (`index.html`) + `assets/`, deployed to GitHub Pages from
> `main`; develop on the session's assigned `claude/*` branch and merge via PR. Live at
> https://jplutz7.github.io/R6Tactics/ (case-sensitive). Validate with vm.Script syntax
> checks + a puppeteer screenshot before deploying; cache-bust changed images with a
> `?query`; bump SEED `version` when the embedded data changes.
>
> Then ask me what I want to do next (likely candidates: **refresh the operator
> win-rates with exact numbers** from a logged-in R6 Tracker — see §11; add `pickRate`;
> fine-tune label positions; fill tactics per bombsite; or fold the recommender/operators
> into the Maps tab).

---

## 11. Operator win-rates (`DB.operators[].winRate`) — source & refresh
- **What:** a `winRate` (0–100, one decimal) on every operator. The Roster pools sort by
  it (desc) and each `.opchip` shows the %. It's **per-operator**, so an op reads the same
  % in every role/pool it appears in. Allowed under §1 (static reference data — *not* live
  in-match intel).
- **Source (current values):** Ubisoft's **official Ranked · PC · Platinum & above**
  balance data — the "win-delta per operator vs. presence" release (Y10S3), republished by
  EsportsTales: https://www.esportstales.com/rainbow-six-siege/most-picked-and-banned-operators
  (`winRate ≈ 50 + win_delta`).
- **⚠️ These are APPROXIMATE (±1%).** Every clean tabular source (R6 Tracker, EsportsTales'
  raw numbers, r6data) is Cloudflare/JS-gated and **unreachable from a web session** — even
  via headless Chromium, because the environment's TLS-intercepting egress proxy makes
  Cloudflare wall every request (cert error → "Just a moment…" that never clears). The
  official data is only published as a **scatter of portrait icons**, read by eye and
  cross-checked against current meta. Refresh occasionally, never live.
- **To refresh with exact numbers:** grab a clean per-operator win-rate table from a
  **logged-in R6 Tracker on a normal machine** (this env can't), update the `winRate`
  values in the seed (`DB.operators`), bump SEED `version`. Render code: `wrOf()` /
  `rolePoolHTML()` in `index.html`.

## 12. Tactics system — structure, sourcing & how to extend
- **UX:** in a map's detail view, a right-hand **Tactics panel** lists strats grouped by
  **side → bomb site**. Tap a strat → the map jumps to that site's floor (`siteFloorIndex()`
  — uses the floor token in the site name, e.g. "2F · …", highest floor if it spans two) and
  the panel swaps to the strat detail (back button top-left). Detail is **activity-grouped
  bullets** (v31): **Operators — who picks what** (per-player op options), then **Reinforce**
  + **Rotations** (defense) / **Open up** (attack), then **Gadgets & jobs — by player** (each
  player's slot `pos`). Op chips reuse the click-to-open operator popup (§7). Code:
  `renderTacticsPanel()` / `openTactic()` /
  `renderTacticDetail()` / `assignTactic()`; two-column layout `.detail-cols` in
  `renderMapDetail()`. Panel only renders when the map has `bombsites`. Opening a strat also
  **focuses the site filter** on that bomb site (`UI.maps.siteFilter = bombsite.site`); back
  resets it to "all".
- **On-map markers:** an earlier pass added per-strat overlay markers (reinforce walls /
  gadget spots / attack entry arrows) but it was **reverted** (positions were approximate —
  no room-label coords exist to anchor them). If revisited, make them **drag-editable in ✎
  Edit** first so positions can be tuned, and consider bundling operator logos.
- **Read-&-counter suggester (prep tool).** In the Tactics panel the **Attack** group has a
  **🎯 Suggest** button → a prep view: pick the **site** + the **defenders you've seen** (chips,
  partial is fine, 0–5). It **predicts which of the site's stored defense setups they're
  running** and **counters each**:
  - **Prediction** (`predictDefense`): scores each defense strat by how the picked ops fit its
    op pools — `coverage + 0.6·distinctiveFraction + 0.4·archCosine(comp, strat-role-profile)`.
    Distinctive ops (in one setup's pool but not the other) are the strong "tell". Shows the
    **Most likely** setup + **Also possible** ones when the scores are close OR info is thin;
    confidence (High/Med/Low) from #ops-known + the gap. Works with **0 known ops** (pure prep
    — shows both setups) up to 5.
  - **Counter:** for each predicted setup it fills the enemy team out to 5 from that setup's
    pools (`predictedTeam`), then picks the best attack strat vs that team (`bestCounter` →
    `scoreAttackStrat`) with an archetype-aware reason. Click a counter → opens that attack strat.
  - Scoring config is **tunable in the seed** (`DB.suggester`: per-defender archetype weights +
    approach×archetype `matchups` + `archetypeAdvice`). Each attack strat has an `approach`
    (hardbreach/vertical/flank/utility). Archetypes: anti-breach / traps / intel / roamers /
    anchors. Code: `renderSuggester` / `predictDefense` / `predictedTeam` / `bestCounter` /
    `scoreAttackStrat` / `compArchetypes`. **ToS:** labelled **prep** — for defenders you've
    *seen/expect* (scrims/VOD), **not** live in-match enemy input (safe side of §1).
- **Known nit — attack "Open up" vs by-player overlap:** on a single-breach attack strat
  (hard breacher only, no vertical/flank slot), the one wall in **Open up** is the same line
  shown under the hard breacher in **Gadgets & jobs — by player**. Minor duplication; could
  suppress the by-player line when it's already in Open up, or just leave it.
- **Op assignment:** `assignTactic(strat, side)` greedily matches each rostered player to a
  strat slot by the player's prioritised roles for that side (`attackRoles`/`defenseRoles`,
  by rank), then fills leftovers. Each player sees their slot's 2–4 op options + position;
  players with no matching slot get a "flex — pick from your pool" note. So picks
  auto-adapt to whatever the Roster says.
- **Data shape:** `map.tactics[side][siteId].strats = [ STRAT ]` (see §4). Slots reference
  side-specific role ids (§4 roles). The old flat `ATK_FIELDS`/`DEF_FIELDS` are kept in data
  (unused by this UI).
- **Coverage:** **ALL 25 maps are seeded — 490 strats** (2 defense + 3 attack per site; 3
  sites on Presidential Plane & Stadium). Clubhouse is hand-written/bespoke; the other 24 use
  the meta template (correct rooms/floors, standard op pools) — a solid editable baseline.
  Good follow-ups: tighten a few off-reading site names (e.g. Consulate "Piano/Expo", Kafe
  "Cocktail Entrance/Wood Stairs"), and deepen the template maps toward bespoke per VOD review.
- **Sourcing:** **r6guides.com is dead** (now a parked "FIFA World Cup" page — verified; no
  Wayback guide snapshots, and archive.org is egress-blocked here). r6strat = login-gated
  private builder; Fandom = 403. So there is **no reachable structured strat DB** — strats are
  **composed from current meta** + reputable map guides. Clubhouse is hand-written; the other
  Pro maps use a consistent template that fills each site's **real room names + floor context**
  (reinforce the site walls, rotate between the bomb rooms, deny the actual adjacent-floor
  vertical) with standard meta op pools. A solid editable baseline — refine specifics in ✎ Edit.
- **Bomb sites (v28) — how they were built:** derived from the in-map r6calls objective
  markers (`type:"site"` callouts). Each site = one digit group; its two rooms = the A/B
  spots' room labels; floor = the highest floor its spots sit on (name prefixed, e.g.
  "2F · Bedroom / Gym"). **The digit grouping is the authoritative pairing** — it matches
  the game (verified) and the map images. The 5 previously hand-curated maps were
  **rebuilt** from markers because their manual pairings were wrong (e.g. Clubhouse was
  Bedroom/CCTV+Gym/Cash; correct is Bedroom/**Gym**+CCTV/**Cash**) — and the Clubhouse
  tactics were **re-keyed** to the corrected site ids. Room **names** were overridden with
  confident fixes on the curated maps + obvious typos; the other 20 use the marker names
  (match the map labels; a few may read slightly off — all editable in ✎ Edit).
- **Sourcing:** content was **composed from current meta** (cross-checked with map guides),
  *not* scraped. R6Strat (r6strat.com) is a **login-gated private strategy builder**, not a
  public library; r6guides.com is a parked domain — so there is no machine-readable strat
  database to pull. Treat strats as a solid editable baseline; refine from VOD/scrims.
- **Read-&-counter suggester — DONE** (see the suggester bullet above): predicts the enemy's
  likely defense setup(s) from the ops you've seen + the site, and counters each. Possible
  next: an in-app editor for the `DB.suggester` weights, and tuning the per-archetype advice.
