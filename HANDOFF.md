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
- **Dev branch:** `claude/fervent-wright-as3zro` → merged to `main` via squash PRs. **`main` is the default branch** (fixed mid-session; was a leftover `claude/*` — this matters because GitHub Actions/cron only run from the default branch). GitHub Pages serves `main`, root.
- **Current state:** PWA **build 43**, SEED **data v57** (see §13 for the session log).
- **Owner/maintainer:** João (IGL of the stack). Began as a non-GitHub user; prefers the assistant to handle git/PRs and image/data sourcing.

## 2. Files
```
index.html                  # the entire app: HTML + CSS + JS inlined (~7,300 lines). Light theme.
manifest.json                # PWA manifest (installable app, standalone, theme #e0541f)
sw.js                        # service worker — offline shell + runtime image cache (bump CACHE to refresh)
assets/icons/                # PWA/app icons (icon-192/512, maskable-512, apple icon-180, favicon-64) — orange "R6"
assets/covers/<id>.jpg       # 25 official Ubisoft map covers (gallery tiles)
assets/floors/<id>/<n>.webp  # floor-plan images, one per floor index n
assets/floors/CREDITS.txt    # attribution
README.md                    # GitHub Pages setup + "publish an update" workflow
HANDOFF.md                   # this file
```
There is **no build step**. Open `index.html` (or the Pages URL) and it runs.
**Installable PWA:** manifest + service worker make it "Add to Home Screen" / "Install" on
mobile **and** desktop — own window, app icon, works **offline** (shell + data precached;
HTML is network-first so publishes still land; same-origin map images cache as you view them;
cross-origin peek videos pass through). SW only runs on http(s), not `file://`. All paths are
relative so it works under the `/R6Tactics/` Pages subpath.
**In-app update prompt:** `index.html` carries `const APP_BUILD = N`; `version.json` holds the
latest deployed `build`. The app polls `version.json` (on load, on focus, every 60s — fetched
no-store, SW-bypassed) and shows a "🔄 New version available — Update" banner when
`build > APP_BUILD`. Tap → reload into the new code (localStorage data kept; no reinstall).
**⚠️ Every deploy, bump the build:** run `node scripts/bump-build.js` (bumps `version.json` +
`APP_BUILD` in sync) so installed apps get the prompt — otherwise standalone PWAs can sit on
the old version.
**Mobile-ready (viewing):** phone media query (≤720px) + touch pan / pinch-zoom on the map
viewer. **Verified on emulated iPhone (390×844 + landscape) and iPad (768×1024 portrait,
1080/1180 landscape, 1024×1366 Pro)** — no overflow, pinch + zoomed-pan exact, 0 errors.
iPad 768–1080 gets the stacked-tactics layout; >1080 gets the side panel. **Editing also works on touch** — pin-drag and roster drag-assign were rewritten from
mouse/HTML5-DnD to **pointer events** (`rosterPointerDrag`/`rosterDoDrop`; pin uses
`setPointerCapture`). A custom drag-ghost + `elementFromPoint` drop targeting replaces native
DnD; `.rdrag`/`.prole` get `touch-action:none`. Verified on touch + mouse.

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

## 4. Data model (embedded `SEED_DATA`, currently **version 40**)
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
- **To publish to the stack — in-app button (primary):** Data → **✓ Make changes
  permanent** (`publishLive()`). With a stored GitHub **fine-grained token** (this repo,
  Contents:read+write; in `localStorage["r6stack.gh_token"]`, never exported), it does an
  atomic **git-data API** commit to `main`: reads the live `index.html` + `version.json` via
  the **blob API** (contents API can't return >1 MB and index.html is ~1.3 MB), splices the
  current `DB` (version bumped) between the BEGIN/END markers, bumps `APP_BUILD` +
  `version.json.build`, writes both blobs → tree (base = current) → commit → moves the ref.
  Pages redeploys (~1 min) and every client's update-checker (§ PWA note) prompts. Token
  setup UI is `showTokenModal()`. ⚠️ Owner data commits land on `main` directly — when I push
  code, rebase onto fresh `main` first (the seed block / `APP_BUILD` / `version.json` may have
  moved). Manual fallback below.
- **Manual publish:** Data → *Copy publish JSON* (auto-bumps version) → replace the object
  between the BEGIN/END markers in `index.html` → commit & push → Pages redeploys.
  Cache-bust image changes with a `?query` on the path (see below).

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

> Continue work on the **R6 Stack Command Center** (Rainbow Six Siege prep dashboard for a
> 5-stack). **First read `HANDOFF.md`** in full — especially §1 (data/ToS rule), the data
> model, and **§13 (the recent session log)** which has the newest systems and open threads.
>
> Single-file app (`index.html`, ~1.6 MB, all HTML/CSS/JS inlined) + `assets/` + `players.json`
> + `scripts/` + `.github/workflows/`. Deployed to GitHub Pages from **`main`** (the default
> branch). Develop on the session's assigned `claude/*` branch, **squash-merge via PR**, and I
> like you to **auto-create + auto-merge** PRs. Live at https://jplutz7.github.io/R6Tactics/
> (case-sensitive R/T).
>
> **Workflow that's been working:** make the change → run a headless **puppeteer** test
> (puppeteer-core at `/tmp/node_modules`, Chrome at `/root/.cache/puppeteer/...`; serve the
> repo over a tiny http server, stub `/players.json`) → `node scripts/bump-build.js` to bump
> the PWA build (keeps `version.json` + `APP_BUILD` in sync; drives the in-app update banner)
> → commit → `git rebase origin/main` (main gets bot `players.json` commits, so rebase first)
> → force-push → PR → squash-merge. **Bump SEED `version` only for data/content changes**
> (it triggers the "new data — adopt" flow for users; warn that unpublished local round-logs
> are replaced on adopt).
>
> Then ask me what's next. **Open threads:** (1) confirm the **06:00 UTC stats sync** worked —
> i.e. whether **Max** (`lnteligent.`) resolves and whether r6data honours **per-season ranked
> operator scoping** (`ops` keys like `ranked|42`); if it does, the suggester's operator term
> and the Players-tab per-season operators activate (and I can drop the redundant all-time op
> call to save ~250 calls/mo). (2) Link **Lora** and the 5th member (`scripts/players.config.json`)
> once I give you their Ubisoft handles. (3) Operator pools in the tactics are my **convention
> picks**, not a sourced meta — a real pick-rate source could improve them.

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
  sites on Presidential Plane & Stadium). ALL 25 maps are now hand-written/bespoke (v38–v40): every strat references its site's real geography (walls, stairs, windows, hatches, balconies) with site-tailored op picks. Refine further from VOD review.
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

## 13. Session log — Players tab, personalization, tactic content (builds 13→34, data v43→v48)
Big additions since §12. Read this to understand the newest systems.

### Players tab (live ranked stats, ToS-safe via §1)
- **3rd main tab** (`📊 Players`). Reads `players.json` (same-origin) — **never** calls r6data
  from the browser (the API needs an `api-key` header AND sends no CORS headers, so a static
  PWA can't call it; the key must stay server-side).
- **Pipeline:** `.github/workflows/player-stats.yml` (cron `0 6 * * *`, **once daily** to fit
  r6data's **2,500 calls/month** budget — ~51 calls/run) runs `scripts/fetch-stats.js` using
  the **`R6DATA_API_KEY`** repo secret, writes `players.json`, commits it. `scripts/players.config.json`
  lists members (`joao`=JPLutz7, `leme`=Mtaro., `max`=lnteligent., `lora`/`unknown`=unlinked, empty
  handle ⇒ skipped, no API cost). Fetch is **preserve-on-fail** (a rate-limited run keeps each
  player's last-good data) with 429 retry/backoff + spacing.
- **Data shape** per player: normalized `segments` (per-season × per-gamemode board stats),
  `rank` (current), `mmrHistory`, `seasons`, and `ops` keyed `playlist|season` (e.g. `ranked|42`,
  `all|all`). r6data's real `type=stats` is deeply nested (`platform_families_full_profiles[]
  .board_ids_full_profiles[]{board_id, full_profiles[]{profile}}`). Per-op data is trimmed.
- **UI:** player toggle; **playlist** toggle (Ranked/Unranked=`pvp_standard`/Quick Match=`pvp_casual`);
  **season** toggle relabeled **"Last 4 seasons"** — aggregates the last 4 seasons only (boards
  sum, win%/KD recomputed from totals; ops aggregate per-season scopes). Season labels are
  **Year/Season** (`Y{ceil(n/4)} S{((n-1)%4)+1}`; S42=Y11 S2). Rank badge maps RP→rank via a
  hardcoded R6 threshold table (`R6_RANKS`, client-side, no API). Operator table, MMR sparkline.
- **API-key expiry** (90-day fine-grained key, expires ~2026-09-08, tracked in `players.config.json`
  `api_key_expires`): the workflow **opens a GitHub Issue** (renewal link + steps) and the Players
  tab shows a banner when ≤14 days / expired. **Can't auto-renew** (it's João's r6data account).
- **PENDING:** per-season **ranked** operator scoping is unconfirmed (every completed sync only
  returned `all|all`; the suggester op term is ranked-only and stays dormant until `ranked|<season>`
  scopes appear). The next clean 06:00 UTC run (after the burst-limit cools) reveals it.

### Device identity + IGL
- **Local per-device identity** (`localStorage r6stack.me`): first-launch "Who's on this device?"
  modal + Data-menu picker. Personalizes only the local view (never published): Players tab defaults
  to your card; roster lists you first; **"(me)"** tag everywhere (`meTag()`); **Refresh button on
  Players is João-only**.
- **IGL is a player flag, NOT a role** (user's call — IGL ops were just intel ops; real IGLs play
  any role). `igl:true` on **one** roster player at a time (initially João), toggled in roster edit
  (`setIgl()`, one-at-a-time), shown as an **"IGL" badge** (`iglTag()`) in roster + tactic picks.
  The `igl-atk`/`igl-def` **roles were removed**; their 487 tactic slots were converted
  (`igl-atk→intel-atk`, `igl-def→anchor-def` — matches their job/ops).

### Tactic content
- **`★ Your job` card** (top of every tactic detail, for the device member): role + per-operator
  **"what to do here"** lines — when the task text names an op, that op gets its own clause; else the
  shared task + the op's gadget note. From `assignTactic()` + `opById().notes`.
- **Paragraph `desc` per tactic** (`st.desc`, a **bullet array**), composed from the tactic's own
  summary + setup + role/op tasks (`scripts/gen-desc.js`). Rendered as `<ul class="tp-desc">`.
  Regenerate after any op/role change.
- **Operators tailored per tactic, all maps** ("follow Clubhouse"): scaffold maps reused one op set
  per strat-type across sites; now varied per site via type-aware **convention** pools in
  `scripts/tailor.js` (kept Thermite/Hibana/Ace, Smoke/Goyo/Melusi etc. fixed; varied the deep-pool
  roles). **Convention picks, not a sourced meta** (a data-driven win-rate version was tried and is
  *worse* — op `role` is too coarse for defense sub-roles and win-rate ≠ pick-rate). Clubhouse was
  already well-tailored and is the model.
- **Sites order like the game** (by bombsite `site` field 1→4); the old (wrong) per-site win-rate
  badges were removed.

### Attack-tactic variety + flex second-role labels (build 36, data v50)
The flex slot was the repetitive weak point (always a vertical/soft-breach "support", narrow
Buck/Sledge/Gridlock pool, and on Bank the **same op-set appeared in two flex slots**). Reworked
**all 294 attack strats** so the flex's job varies:
- **Every attack strat now has the canonical 5 slots** `[hardbreach, entry, support, intel, flex]`
  (the old "double-intel" hard-breach strats had their 2nd `intel-atk` converted to `flex-atk`).
- **The flex carries a `sub`** ∈ `{entry, support, intel, breach}` = its **second job** ("2 entries / 2
  supports / 2 intel / 2 breachers"). Assigned by a per-site rotation: **3 distinct jobs within every
  site**, the dropped 4th **rotates across sites** for map-level variety (global spread ~73–74 each).
  Vertical strats bias to `breach` and **lead with a floor-opener (Buck/Sledge)**, not a hard breacher.
- **Flex ops** come from competitive per-job pools, rotated so they vary across strats/maps and the
  flex lead ≠ the primary same-role lead. **Core slots** keep their meta lead + geography `pos`; only
  **identical option-sets within a site were de-duplicated** (0 remain) so the 3 strats read differently.
- **`st.desc` regenerated** for every attack strat (it embeds `Role (op1/op2) — pos`; flex bullet reads
  `Flex — 2nd <Job> (...)`). Flex desc/label consistency: 294/294.
- **UI:** `assignTactic` now labels a flex pick **`Flex — 2nd <Job>`** (`flexSecondJob()` reads `sl.sub`,
  falls back to op-role inference where Buck/Sledge/hard-breach → "breach"). Relabels the chip in the
  **Operators**, **Gadgets & jobs**, and **★ Your job** sections at once.
- Op pools are still **convention picks, not a sourced meta** (per §13 — op `role` is too coarse and
  win-rate ≠ pick-rate). Defense tactics untouched; the owner's round records + roster are preserved
  (this was rebased onto their in-app **v49** publish → **v50**). Verified: vm.Script syntax, data-
  integrity + flex-consistency pass, jsdom boot + DOM render, puppeteer screenshot (no page errors).
- Transform run from `/tmp/vary-tactics.js` (+ `/tmp/fix-dups.js` for the final core de-dup).

### Defense role-pool coverage (data v51) — prereq for a future defense-flex pass
Audit before touching defense: `flex-def` exists and is in the roster, but **0/196 defense strats
use a flex slot**, and the `flex-def` ops pool (Bandit/Jäger/Mute/Smoke/Maestro/Ela) is **fully
redundant** (each is already in a concrete role). The real gap was **8 defenders in no role pool at
all** — now added: **Anchor** ← Castle, Clash, Warden, Sentry, Azami; **Anti-Breach/Support** ←
Thunderbird; **Trapper** ← Fenrir; **Roamer** ← Skopós (per João's call; Azami "mainly anchor but
flexible" so also in Flex). Non-flex roles now cover **37/37** defenders (pools render win-rate-sorted,
so append order is cosmetic). Note `operator.role` is coarse (18 anchor/9 support/9 roamer/1 intel —
trappers + most intel folded in), so the **role `.ops` pools** are the real per-sub-role classification.
A defense-flex variety pass (rotate a `flex-def` slot's 2nd job: 2nd anchor/roamer/trapper/intel/anti-
breach, since the default double-up is already "2 anchors") is the natural follow-up — **not yet done**.

### Defense roles → two-axis model: Position × Job (data v52) — Stage 1 of 2
The flat defense role list conflated a *position* word (Anchor) with *job* words (Anti-breach/Trapper/
Intel), implying only anchors stay on site — wrong: everyone except roamers anchors. Split into **two
axes** (owner's call):
- **Positions** (`group:"position"`): **Anchor** (34 ops — every defender except the pure roamers) ·
  **Roamer** (13). Most defenders anchor; only Vigil/Caveira/Oryx are pure roamers.
- **Jobs** (`group:"job"`): **Anti-Breach / Utility** (17) · **Trapper** (7) · **Intel** (10) ·
  **Support** = heal/armour (3: Doc/Rook/Thunderbird) · **Flex** (8). **Flex = versatile ops that can
  ANCHOR (and may also roam) — never pure roamers** (owner rule). Every defender = one position + one
  job; an op can sit in several pools (Bandit = Anchor+Roamer + Anti-Breach/Utility + Flex).
  `operator.role` holds the **job**; position is derived from position-pool membership.
  - **v54 refinement (owner):** the old separate **Utility/Denial** job (one-ways/shields/gas/barricades)
    was **merged into Anti-Breach** → **"Anti-Breach / Utility"** (deny the breach *and* deny space), and
    **Melusi moved to Trapper**. The defense tactic flex still carries a "2nd Utility" double as the
    space-denial *flavor* of that job (vs "2nd Anti-Breach" = wall-denial); both draw from the merged pool.
    (Oryx, the gadget-less pure-frag roamer, landed in Anti-Breach/Utility — the one still-awkward fit.)
- **Schema:** roles gained a `group` field (`normalizeDB` defaults it; attack roles are all `job`).
  Roster role-grid renders three sections (Attack roles · Defense — Positions · Defense — Jobs); the
  op-modal shows position tag(s) + job. Added roles `support-def`, `utility-def`; reframed all defense
  role descs. Existing roster/tactics ids untouched (non-breaking). Transform: `/tmp/def-roles.js`.
### Defense tactic variety + flex second-role labels (data v53) — Stage 2 of 2 (DONE)
Mirrors the attack pass for the **196 defense strats** (2 per site). Each strat's redundant 2nd-anchor
slot became a **`flex-def`** slot whose **second role varies** across the site's two strats and across
maps: **2nd Anchor / 2nd Roamer / 2nd Trapper / 2nd Intel / 2nd Anti-Breach / 2nd Utility / 2nd Support**
(`sl.sub`). This produces the doubles the owner asked for — 2 anchors, **2 roamers**, **2 trappers**,
2 intel, 2 anti-breach — competitively (flex ops from the matching role pool, lead ≠ the base same-role
lead; base slots keep their geography `pos`, identical op-sets de-duped within a site). Spread:
anchor 42 / trapper 28 / roamer 28 / intel 28 / antibreach 28 / utility 28 / support 14; 0 sites with a
repeated double; flex desc↔label 196/196. **UI:** `FLEX_SUB_LABEL` gained the defense subs and
`assignTactic` labels `flex-def` too → chip reads e.g. **"Flex — 2nd Roamer"**. Base = anchor + anti-
breach + recon(intel/trapper) + roamer + the varying flex. Transform: `/tmp/vary-def.js`.

### Smoke/Mira → Support, Flex = every op, tactics re-synced (data v55)
Owner refinements after the two-axis defense model settled:
- **Smoke & Mira → Support** job (heal/armour pool now Doc/Rook/Thunderbird/**Smoke/Mira**); their
  `op.role` is `support`. They stay Anchor by position. (So the merged Anti-Breach/Utility loses them.)
- **Flex = "the role that doubles another role" → every op is in its side's Flex pool** (`flex-atk` = all
  38 attackers, `flex-def` = all 37 defenders). This supersedes the earlier "anchor-capable only" rule:
  a flex player doubling the roamer slot just picks a roamer, etc. (the tactic flex's `sub` decides what's
  doubled; the role pool is now the whole side).
- **Re-ran both tactic generators** so everything is consistent: defense `2nd Support` doubles now feature
  Smoke/Mira and `2nd Utility` doubles don't; descriptions regenerated with the merged role names. Attack
  re-ran too (its internal de-dup shifted 6 maps slightly; `/tmp/fix-dups.js` re-applied → 0 duplicate
  core op-sets). Flex desc↔label 294/294 attack + 196/196 defense; 0 unknown op refs.
- Scripts: `/tmp/reclassify.js` (Smoke/Mira + flex=all) → `/tmp/vary-def.js` → `/tmp/vary-tactics.js` →
  `/tmp/fix-dups.js` (the generators' own version bump was removed; version set once).

### Role grid: "Anchor" becomes a subsection, not a role (data v56)
Owner: Anchor isn't a pickable role — it's where most defenders play. So the **role grid** is now
3-level: `Attack` · `Defense → [Anchor subsection · Roamer · Flex]`, where the **Anchor subsection**
holds every site job (**Anti-Breach/Utility, Trapper, Intel, Support**) and **Roamer + Flex** are its
siblings. There is **no standalone "Anchor" card**. Implementation: `role.group` re-tagged — the site
jobs → `"anchor"`, `roamer-def` → `"roamer"`, `flex-def` → `"flex"`; the old Anchor *position* role
(`anchor-def`) is kept in data as `group:"position"` (hidden from the grid) because the **defense
tactics' base "Anchor" slot** and the op-modal's roam-flag still resolve through it. `renderRoleGrid`
rewritten (new `.rolesub` CSS); op-modal now shows `Defense · <Job>` + a `Roamer` flag (no Anchor tag,
since anchor is the default). `normalizeDB` preserves the new group values.
- **Anchor fully removed from data (v57):** the generic lead "anchor" tactic slot was **relabelled to
  Support** (Doc/Rook/Thunderbird/Smoke/Mira — the lead site anchor; op-agnostic hold pos regenerated),
  the **"2nd Anchor" flex double folded into the 6 remaining doubles** (Support/Roamer/Trapper/Intel/
  Anti-Breach/Utility — even 33/33/33/33/32/32 spread, `siteSubs` fixed for 6 subs), the **`anchor-def`
  role deleted**, and **anchor-def dropped from João + Lora** (João → [trapper,flex]; **Lora → [] —
  open, pick her a new defense role**). `grep anchor-def` over the SEED = **0**. ("anchor" survives only
  as the grid **subsection header** and as a verb in pos/strat-names, e.g. "anchor hold".)

### Helper scripts (in `/tmp` during the session, re-creatable from this log)
`scripts/gen-desc.js` (descriptions, **committed**). `scripts/fetch-stats.js`, `players.config.json`,
the workflow — **committed**. `tailor.js` / `igl.js` / `vary-tactics.js` transforms were run from `/tmp` (logic captured above).
