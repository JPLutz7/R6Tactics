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
/* r6data rebranded to arenyze and REMOVED its v1 API on 2026-08-17 (api.r6data.com now
   answers HTTP 410 API_V1_REMOVED, with or without a key), and the old unauthenticated
   r6data.com/api/operatorStats website endpoint 301s to a 404. Everything now comes from
   the arenyze v2 API, which needs the same `api-key` header. Docs: r6.arenyze.com/api-docs */
const V2 = "https://public-api.arenyze.com/r6/api/v2";
const USAGE_URL = "https://public-api.arenyze.com/r6/api/me/usage";

if (!KEY) { console.error("ERROR: R6DATA_API_KEY is not set."); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, params, base) {
  const qs = Object.entries(params || {}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const url = (base || V2) + path + (qs ? "?" + qs : "");
  for (let attempt = 0; attempt < 4; attempt++) {
    let r, text;
    try {
      r = await fetch(url, { headers: { "api-key": KEY, "Accept": "application/json" } });
      text = await r.text();
    } catch (e) {
      if (attempt < 3) { await sleep(1000 * Math.pow(2, attempt)); continue; }
      return { status: 0, ok: false, error: String((e && e.message) || e) };
    }
    if (r.status === 429 && attempt < 3) { await sleep(1500 * Math.pow(2, attempt)); continue; }   // backoff on rate limit
    let json = null; try { json = JSON.parse(text); } catch (_) {}
    const msg = json && (json.error || json.message);
    return { status: r.status, ok: r.ok, json, error: r.ok ? null : (msg || ("HTTP " + r.status)), text: json ? undefined : String(text).slice(0, 300) };
  }
}
/* one /profile call replaces v1's stats + fullStats + seasonalStats:
   .seasons -> {data:{segments}} (same shape flattenSegments wants)
   .history -> {data:{history:{data}}} (same shape parseRank/parseHistory want) */
const fetchProfile = (handle, platform) =>
  api("/profile", { nameOnPlatform: handle, platformType: platform, platform_families: FAM });

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

/* per-season / per-playlist operators, now from the keyed v2 /operators endpoint.
   v2 playlist names -> the app's playlist ids (the app keys ops "<playlist>|<season>").
   season number -> "Y{yr}S{s}" (41 -> "Y11S1"). */
const MODES = [{ v2: "ranked", pl: "ranked" }, { v2: "standard", pl: "unranked" }, { v2: "quick-match", pl: "quickmatch" }];
const seasonYearStr = n => "Y" + Math.ceil(n / 4) + "S" + (((n - 1) % 4) + 1);
/* Completed seasons are frozen, so only the newest few are re-fetched each run and the rest
   are carried forward — per-season operators used to come from a free unauthenticated
   endpoint, but on v2 they count against the key's monthly quota. */
const REFRESH_SEASONS = 2;
async function fetchSeasonOps(handle, platform, seasonYear, mode) {
  const r = await api("/operators", { nameOnPlatform: handle, platformType: platform, seasonYear, modes: mode });
  if (!r.ok || !r.json) return null;
  const blk = r.json.operators;                                   // { seasonYear, seasonNumber, sessionType, operators:[...] }
  const arr = Array.isArray(blk) ? blk : (blk && Array.isArray(blk.operators) ? blk.operators : null);
  if (!arr) console.log(`      (unexpected /operators shape: ${Object.keys(r.json).join(",")})`);
  return arr;
}

async function fetchPlayer(p, prev) {
  const platform = p.platform || "uplay";
  const out = { key: p.key, label: p.label, handle: p.handle, platform, ok: false };
  try {
    // ONE /profile call now carries what v1 needed three for (stats + fullStats + seasonalStats)
    const prof = await fetchProfile(p.handle, platform);
    out.status = prof.status;
    if (!prof.ok || !prof.json) { out.error = prof.error || prof.text || ("HTTP " + prof.status); return out; }
    out.ok = true;
    const j = prof.json;
    out.segments = flattenSegments(j.seasons);          // {data:{segments}}
    out.rank = parseRank(j.history);                    // {data:{history:{data}}}
    out.mmrHistory = parseHistory(j.history);
    out.seasons = [...new Set(out.segments.filter(s => s.type === "season" && s.season != null).map(s => s.season))].sort((a, b) => b - a);
    if (j.meta && j.meta.partial) console.log(`      (partial profile: ${JSON.stringify(j.meta.errors || {}).slice(0, 160)})`);
    if (!out.segments.length) console.log(`      (no segments — /profile keys: ${Object.keys(j).join(",")})`);

    // operators, keyed "<playlist>|<season>" exactly as the app's opsFor() expects.
    out.ops = {};
    const prevOps = prev && prev.ok && prev.ops;
    const allOps = await fetchSeasonOps(p.handle, platform, "all", "all");   // all-time fallback
    if (allOps && allOps.length) out.ops["all|all"] = trimOps(allOps);
    // Season window for the per-playlist ops. Normally this run's last-4 seasons; if the profile hiccupped
    // and gave us no seasons, fall back to the previous good run's window so a board-fetch failure can't
    // make us skip EVERY per-playlist (ranked/unranked/quickmatch) operator fetch.
    let opSeasons = (out.seasons || []).slice(0, 4);
    if (!opSeasons.length && prev && Array.isArray(prev.seasons)) opSeasons = prev.seasons.slice(0, 4);
    // per-season × per-playlist. Only the newest REFRESH_SEASONS are re-fetched; older seasons are
    // finished and never change, so we carry them forward instead of spending quota on them.
    for (let si = 0; si < opSeasons.length; si++) {
      const season = opSeasons[si];
      for (const m of MODES) {
        const k = `${m.pl}|${season}`;
        if (si >= REFRESH_SEASONS && prevOps && prevOps[k]) { out.ops[k] = prevOps[k]; continue; }   // frozen season, no call
        const sops = await fetchSeasonOps(p.handle, platform, seasonYearStr(season), m.v2);
        if (sops && sops.length) out.ops[k] = trimOps(sops);
        await sleep(250);   // be gentle with the rate limit
      }
    }
    // keep last-good operator scopes that didn't refresh this run (transient hiccup) so the
    // operators never fall out of sync with the rest of the player data; scoped to the same window
    // so scopes that roll off it aren't kept forever.
    if (prevOps) {
      if (!out.ops["all|all"] && prevOps["all|all"]) out.ops["all|all"] = prevOps["all|all"];
      for (const season of opSeasons)
        for (const pl of ["ranked", "unranked", "quickmatch"]) {
          const k = `${pl}|${season}`;
          if (!out.ops[k] && prevOps[k]) out.ops[k] = prevOps[k];
        }
    }
  } catch (e) { out.error = String(e && e.message || e); }
  return out;
}

/* an auth/key problem (vs a per-player handle problem) — drives the expiry alarm.
   NOTE: a preserve-on-fail record carries the PREVIOUS run's ok:true, so this used to
   return false for every failure and the alarm went blind — that's how a dead key (Jul
   2026) and then the v1 endpoint removal (Aug 2026) sat unnoticed for two months while
   the app quietly served frozen data. Always judge on THIS run's outcome. */
function failedThisRun(p) { return !!p.fetchFailed || (!p.ok && !p.unlinked); }
function isAuthFail(p) {
  if (!failedThisRun(p)) return false;
  const status = p.fetchFailed ? p.lastStatus : p.status;
  if (status === 401 || status === 403) return true;
  return /api[- ]?key|invalid key|unauthor|expired|forbidden/i.test(p.error || p.staleReason || "");
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
    const r = await fetchPlayer(p, prevOf(p.key));
    if (!r.ok) {
      const old = prevOf(p.key);
      // preserve last-good data, but mark THIS run as failed so the health check isn't fooled by old ok:true
      if (old) { console.log(`FAILED (${r.error}) — kept previous good data`); players.push({ ...old, stale: true, staleReason: r.error, fetchFailed: true, lastStatus: r.status }); await sleep(600); continue; }
    }
    console.log(r.ok ? "ok" : `FAILED: ${r.error}`);
    players.push(r);
    await sleep(600);   // be gentle with the rate limit between players
  }
  // real quota/plan straight from the API, instead of a hand-maintained expiry date that
  // drifted out of sync last time (config said Sep 8 while the key actually died Jul 11)
  let quota = null;
  const u = await api("", null, USAGE_URL);
  if (u.ok && u.json) {
    quota = { plan: u.json.plan || null, limit: u.json.limit || null, used: (u.json.usage && u.json.usage.total_calls) || null, checked: new Date().toISOString() };
    console.log(`Quota: ${quota.used}/${quota.limit} calls this month (plan ${quota.plan})`);
  } else console.log(`Quota check failed: ${u.error || u.status}`);

  /* Health. Judged on THIS run: "invalid" when every linked player auth-fails (key rejected),
     "down" when they all fail for some other reason (e.g. the API being removed — the case the
     old blind check missed), "expired" only if a recorded date has passed. */
  const linked = players.filter(p => !p.unlinked);
  const allAuthFail = linked.length > 0 && linked.every(isAuthFail);
  const allFailed = linked.length > 0 && linked.every(failedThisRun);
  const expires = cfg.api_key_expires || null;
  const pastDate = expires && (Date.now() > Date.parse(expires + "T23:59:59Z"));
  let keyStatus = "ok";
  if (allAuthFail) keyStatus = "invalid";
  else if (allFailed) keyStatus = "down";
  else if (pastDate) keyStatus = "expired";
  const syncError = allFailed ? ((linked[0] && (linked[0].staleReason || linked[0].error)) || "all player fetches failed") : null;

  const data = { updated: new Date().toISOString(), source: "arenyze.com (r6 v2)", keyExpires: expires, keyStatus, quota, syncError, players };
  fs.writeFileSync(path.join(root, "players.json"), JSON.stringify(data, null, 2) + "\n");
  const fresh = players.filter(p => p.ok && !p.fetchFailed).length;
  console.log(`Wrote players.json (${fresh}/${linked.length} refreshed, keyStatus=${keyStatus}${syncError ? ", syncError=" + syncError : ""})`);
  if (allFailed) console.error(`ERROR: no player refreshed this run — ${syncError}`);
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
