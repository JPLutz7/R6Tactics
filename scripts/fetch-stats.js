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

// recursively check whether an object contains ranked-looking fields
function looksRanked(o) {
  if (!o || typeof o !== "object") return false;
  if ("rank_points" in o || "wins" in o || "losses" in o) return true;
  return Object.values(o).some(looksRanked);
}

async function fetchType(handle, platform, type) {
  const url = `${BASE}?type=${type}&nameOnPlatform=${encodeURIComponent(handle)}&platformType=${encodeURIComponent(platform)}&platform_families=${encodeURIComponent(FAM)}`;
  const r = await fetch(url, { headers: { "api-key": KEY, "Accept": "application/json" } });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, ok: r.ok, json, text: json ? undefined : text.slice(0, 400) };
}

// the extra data types to pull in addition to the core ranked/casual boards.
const EXTRA_TYPES = ["fullStats", "operatorStats", "seasonalStats"];

async function fetchPlayer(p) {
  const platform = p.platform || "uplay";
  const out = { key: p.key, label: p.label, handle: p.handle, platform, ok: false };
  try {
    // core boards (ranked/casual/…) via the documented player endpoint
    let res = await fetchType(p.handle, platform, "stats");
    let used = "stats";
    if (!res.ok || !looksRanked(res.json)) {
      const alt = await fetchType(p.handle, platform, "fullStats");
      if (alt.ok && (looksRanked(alt.json) || !res.ok)) { res = alt; used = "fullStats"; }
    }
    out.fetchType = used;
    out.status = res.status;
    if (res.ok && res.json) { out.ok = true; out.raw = res.json; }
    else { out.error = res.json && (res.json.error || res.json.message) || res.text || ("HTTP " + res.status); }

    // best-effort: pull every other data type too, so the app can surface it all
    const more = {};
    for (const t of EXTRA_TYPES) {
      if (t === used) continue;                      // already have it as raw
      try { const r = await fetchType(p.handle, platform, t); if (r.ok && r.json) more[t] = r.json; } catch (_) {}
    }
    if (Object.keys(more).length) out.more = more;
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
