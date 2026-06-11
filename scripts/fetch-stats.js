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

    // operators: r6data operatorStats has NO playlist/season scoping — every
    // sessionType / seasonNumber / gameMode / board_id / playlist param is ignored
    // and returns the same all-time, all-playlist data (verified by probe: all echo
    // sessionType=all, seasonNumber=null, identical counts). So one call is enough.
    out.ops = {};
    const base = await fetchType(p.handle, platform, "operatorStats");
    if (base && base.ok && base.json && base.json.operators) out.ops["all|all"] = trimOps(base.json.operators);
    // TEMP: map where r6data's site gets per-season/playlist operators (it does — verified on the site)
    if (process.env.R6_DEBUG_OPS === "1" && !global.__d) {
      global.__d = true;
      const op0 = base && base.json && base.json.operators && (Array.isArray(base.json.operators) ? base.json.operators[0] : Object.values(base.json.operators)[0]);
      console.log("  [opObj] keys=" + (op0 ? Object.keys(op0).join(",") : "-") + " sample=" + JSON.stringify(op0).slice(0, 400));
      for (const ty of ["stats", "fullStats"]) {
        const st = await fetchType(p.handle, platform, ty);
        let n = 0;
        (function walk(o, path, d) {
          if (n > 70 || d > 8 || o == null) return;
          if (Array.isArray(o)) { console.log(`  [${ty}] ${path}[] len=${o.length}`); n++; if (o.length) walk(o[0], path + "[0]", d + 1); return; }
          if (typeof o === "object") { const ks = Object.keys(o); console.log(`  [${ty}] ${path} {${ks.join(",")}}`); n++; for (const k of ks) { if (/board_id|^season$|playlist|gamemode/i.test(k)) console.log(`  [${ty}] ${path}.${k}=${JSON.stringify(o[k]).slice(0, 80)}`); walk(o[k], path + "." + k, d + 1); } }
        })(st.json, ty[0].toUpperCase(), 0);
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
