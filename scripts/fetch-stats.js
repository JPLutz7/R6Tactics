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

async function fetchType(handle, platform, type, extra) {
  let url = `${BASE}?type=${type}&nameOnPlatform=${encodeURIComponent(handle)}&platformType=${encodeURIComponent(platform)}&platform_families=${encodeURIComponent(FAM)}`;
  if (extra) for (const k in extra) url += `&${k}=${encodeURIComponent(extra[k])}`;
  const r = await fetch(url, { headers: { "api-key": KEY, "Accept": "application/json" } });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, ok: r.ok, json, text: json ? undefined : text.slice(0, 400) };
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
    .map(o => ({ op: o.operator, side: o.side, rp: o.roundsPlayed, wp: o.winPercent, kd: o.kd, hs: o.headshotPercent, w: o.wins, l: o.losses, k: o.kills, d: o.deaths }));
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

    // operators: all-time baseline + scoped per playlist (+season) when the API honours sessionType/seasonNumber
    out.ops = {};
    const base = await fetchType(p.handle, platform, "operatorStats");
    if (base.ok && base.json && base.json.operators) out.ops["all|all"] = trimOps(base.json.operators);
    for (const plId of Object.keys(PLAYLISTS)) {
      const st = PLAYLISTS[plId].st;
      for (const season of [null, ...out.seasons]) {
        const extra = { sessionType: st }; if (season != null) extra.seasonNumber = season;
        try {
          const r = await fetchType(p.handle, platform, "operatorStats", extra);
          if (r.ok && r.json && Array.isArray(r.json.operators)) {
            const echoOk = String(r.json.sessionType) === st && (season == null || String(r.json.seasonNumber) === String(season));
            if (echoOk) out.ops[`${plId}|${season == null ? "all" : season}`] = trimOps(r.json.operators);
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
  const players = [];
  for (const p of (cfg.players || [])) {
    process.stdout.write(`Fetching ${p.label} (${p.handle}/${p.platform})… `);
    const r = await fetchPlayer(p);
    console.log(r.ok ? `ok [${r.fetchType}]` : `FAILED: ${r.error}`);
    players.push(r);
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
