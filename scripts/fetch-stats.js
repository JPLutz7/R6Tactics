#!/usr/bin/env node
/* Fetch each stack member's ranked stats from the r6data API and write
   players.json (read by the app's Players tab). Runs in GitHub Actions every
   12h so the api-key stays a repo secret and CORS never matters (the browser
   only ever reads the committed players.json from its own origin).

   Env: R6DATA_API_KEY  (GitHub secret)
   Usage: node scripts/fetch-stats.js  */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "scripts/players.config.json"), "utf8"));
const KEY = process.env.R6DATA_API_KEY || "";
const FAM = cfg.platform_families || "pc";
const BASE = "https://api.r6data.com/api/stats";

if (!KEY) { console.error("ERROR: R6DATA_API_KEY is not set."); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchType(handle, platform, type, extra) {
  let url = `${BASE}?type=${type}&nameOnPlatform=${encodeURIComponent(handle)}&platformType=${encodeURIComponent(platform)}&platform_families=${encodeURIComponent(FAM)}`;
  if (extra) for (const k in extra) url += `&${k}=${encodeURIComponent(extra[k])}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { "api-key": KEY, "Accept": "application/json" } });
    if (r.status === 429 && attempt < 3) { await sleep(1500 * Math.pow(2, attempt)); continue; }   // backoff on rate limit
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (_) {}
    return { status: r.status, ok: r.ok, json, text: json ? undefined : text.slice(0, 400) };
  }
}

const numv = x => (x && typeof x === "object") ? (typeof x.value === "number" ? x.value : null) : (typeof x === "number" ? x : null);
// playlist id -> the API's sessionType for operator scoping + the segment gamemode
const PLAYLISTS = { ranked: { st: "ranked", gm: "pvp_ranked" }, unranked: { st: "standard", gm: "pvp_standard" }, quickmatch: { st: "quick-match", gm: "pvp_casual" } };

function flattenSegments(full) {
  const segs = full && full.data && full.data.segments;
  if (!Array.isArray(segs)) return [];
  return segs.map(s => ({
    type: s.type, season: (s.attributes && s.attributes.season != null) ? s.attributes.season : null,
    gamemode: (s.attributes && s.attributes.gamemode) || null,
    won: numv(s.stats && s.stats.matchesWon), lost: numv(s.stats && s.stats.matchesLost),
    kills: numv(s.stats && s.stats.kills), deaths: numv(s.stats && s.stats.deaths),
    rankPoints: numv(s.stats && s.stats.rankPoints), maxRankPoints: numv(s.stats && s.stats.maxRankPoints),
  }));
}
function parseRank(ss) { try { const c = ss.data.history.data[0][1]; return { name: c.metadata.rank, color: c.metadata.color, img: c.metadata.imageUrl, points: c.value }; } catch (_) { return null; } }
function parseHistory(ss) { try { return ss.data.history.data.map(e => ({ ts: e[0], value: e[1].value, rank: e[1].metadata && e[1].metadata.rank })); } catch (_) { return []; } }
function trimOps(arr) {
  arr = Array.isArray(arr) ? arr : Object.values(arr || {});
  return arr.filter(o => o && (o.roundsPlayed || o.matchesPlayed))
    .map(o => ({ op: o.operator, side: o.side, rp: o.roundsPlayed, wp: o.winPercent, kd: o.kd, hs: o.headshotPercent, hsc: o.headshots, w: o.wins, l: o.losses, k: o.kills, d: o.deaths }));
}

async function fetchPlayer(p) {
  const platform = p.platform || "uplay";
  const out = { key: p.key, label: p.label, handle: p.handle, platform, ok: false };
  try {
    const stats = await fetchType(p.handle, platform, "stats");
    out.status = stats.status;
    if (!stats.ok) { out.error = (stats.json && (stats.json.error || stats.json.message)) || stats.text || ("HTTP " + stats.status); return out; }
    out.ok = true;

    const [full, seasonal] = await Promise.all([
      fetchType(p.handle, platform, "fullStats"),
      fetchType(p.handle, platform, "seasonalStats"),
    ]);
    out.segments = full.ok ? flattenSegments(full.json) : [];
    out.rank = seasonal.ok ? parseRank(seasonal.json) : null;
    out.mmrHistory = seasonal.ok ? parseHistory(seasonal.json) : [];
    out.seasons = [...new Set(out.segments.filter(s => s.type === "season" && s.season != null).map(s => s.season))].sort((a, b) => b - a);

    // operators: all-time baseline, then per playlist × {all-seasons + recent seasons}.
    // Bounded (recent seasons only) + spaced out so veterans don't trip the rate
    // limit. Each scope is kept only if the API echoes the requested sessionType
    // (and seasonNumber), so the app can trust the scope; else it falls back.
    out.ops = {};
    const RECENT = out.seasons.slice(0, 4);   // cap per-season operator fetches (budget)
    const DBG = process.env.R6_DEBUG_OPS === "1";   // temporary: probe how r6data scopes operators
    const base = await fetchType(p.handle, platform, "operatorStats");
    if (base && base.ok && base.json && base.json.operators) out.ops["all|all"] = trimOps(base.json.operators);
    if (DBG) console.log(`  [ops/${p.label}] seasons=${JSON.stringify(out.seasons)} base: status=${base&&base.status} keys=${base&&base.json?Object.keys(base.json).join(","):"-"} sessionType=${base&&base.json&&base.json.sessionType} seasonNumber=${base&&base.json&&base.json.seasonNumber} nOps=${base&&base.json&&base.json.operators?(Array.isArray(base.json.operators)?base.json.operators.length:Object.keys(base.json.operators).length):"-"}`);
    // one-time param-name/value probe to find what actually scopes operators (sessionType=ranked is ignored)
    if (DBG && !global.__probed) {
      global.__probed = true;
      const season = out.seasons[0];
      const trials = [
        { sessionType: "pvp_ranked", seasonNumber: season },
        { sessionType: "pvp_ranked" },
        { gameMode: "pvp_ranked", seasonNumber: season },
        { board_id: "pvp_ranked", seasonNumber: season },
        { board_id: `ranked|${season}` },
        { playlist: "ranked", season: season },
      ];
      for (const t of trials) {
        await sleep(1500);
        try {
          const r = await fetchType(p.handle, platform, "operatorStats", t);
          const n = r&&r.json&&r.json.operators ? (Array.isArray(r.json.operators)?r.json.operators.length:Object.keys(r.json.operators).length) : "-";
          console.log(`  [probe] ${JSON.stringify(t)} -> status=${r&&r.status} echo sessionType=${r&&r.json&&r.json.sessionType} seasonNumber=${r&&r.json&&r.json.seasonNumber} nOps=${n}`);
        } catch (e) { console.log(`  [probe] ${JSON.stringify(t)} -> error ${e&&e.message}`); }
      }
    }
    for (const plId of Object.keys(PLAYLISTS)) {
      const st = PLAYLISTS[plId].st;
      for (const season of [null, ...RECENT]) {
        await sleep(1500);   // stay under the per-minute burst limit
        try {
          const extra = { sessionType: st }; if (season != null) extra.seasonNumber = season;
          const r = await fetchType(p.handle, platform, "operatorStats", extra);
          const nOps = r&&r.json&&r.json.operators ? (Array.isArray(r.json.operators)?r.json.operators.length:Object.keys(r.json.operators).length) : "-";
          if (DBG && plId === "ranked") console.log(`  [ops/${p.label}] ranked|${season==null?"all":season}: status=${r&&r.status} keys=${r&&r.json?Object.keys(r.json).join(","):"-"} echo sessionType=${r&&r.json&&r.json.sessionType} seasonNumber=${r&&r.json&&r.json.seasonNumber} nOps=${nOps}`);
          if (r && r.ok && r.json && Array.isArray(r.json.operators)
              && String(r.json.sessionType) === st
              && (season == null || String(r.json.seasonNumber) === String(season))) {
            out.ops[`${plId}|${season == null ? "all" : season}`] = trimOps(r.json.operators);
          }
        } catch (_) {}
      }
    }
  } catch (e) { out.error = String(e && e.message || e); }
  return out;
}

// an auth/key problem (vs a per-player handle problem) — drives the expiry alarm
function isAuthFail(p) {
  if (p.ok) return false;
  if (p.status === 401 || p.status === 403) return true;
  return /api[- ]?key|invalid key|unauthor|expired|forbidden/i.test(p.error || "");
}

(async () => {
  // previous snapshot — so a rate-limited run keeps each player's last good data
  let prev = [];
  try { prev = (JSON.parse(fs.readFileSync(path.join(root, "players.json"), "utf8")).players) || []; } catch (_) {}
  const prevOf = key => prev.find(x => x.key === key && x.ok);

  const players = [];
  for (const p of (cfg.players || [])) {
    if (!p.handle || !String(p.handle).trim()) {   // reserved slot, no handle yet → no API calls
      console.log(`${p.label}: not linked (no handle) — skipped`);
      players.push({ key: p.key, label: p.label, handle: "", platform: p.platform || "uplay", ok: false, unlinked: true });
      continue;
    }
    process.stdout.write(`Fetching ${p.label} (${p.handle}/${p.platform})… `);
    const r = await fetchPlayer(p);
    if (!r.ok) {
      const old = prevOf(p.key);
      if (old) { console.log(`FAILED (${r.error}) — kept previous good data`); players.push({ ...old, stale: true, staleReason: r.error }); await sleep(600); continue; }
    }
    console.log(r.ok ? "ok" : `FAILED: ${r.error}`);
    players.push(r);
    await sleep(600);   // be gentle with the rate limit between players
  }
  // key health: "invalid" if every player auth-fails (key rejected); "expired" if past the recorded date
  const anyOk = players.some(p => p.ok);
  const allAuthFail = players.length > 0 && players.every(isAuthFail);
  const expires = cfg.api_key_expires || null;
  const pastDate = expires && (Date.now() > Date.parse(expires + "T23:59:59Z"));
  let keyStatus = "ok";
  if (allAuthFail) keyStatus = "invalid";
  else if (!anyOk && pastDate) keyStatus = "expired";
  else if (pastDate) keyStatus = "expired";

  const data = { updated: new Date().toISOString(), source: "r6data.com", keyExpires: expires, keyStatus, players };
  fs.writeFileSync(path.join(root, "players.json"), JSON.stringify(data, null, 2) + "\n");
  console.log("Wrote players.json (" + players.filter(p => p.ok).length + "/" + players.length + " ok, keyStatus=" + keyStatus + ")");
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
