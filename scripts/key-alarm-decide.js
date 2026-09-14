/* Decide whether the stats sync needs attention, and build the issue text (with the
   fix link + steps) that gets emailed to the owner. Pure function so it's unit-testable;
   the workflow's github-script step calls it.

   States: "bad"  — sync is DOWN right now (key rejected, or every fetch failing for some
                    other reason such as the provider removing an endpoint)
           "soon" — a recorded key-expiry date is within 14 days
           "ok"   — healthy
   The "down" case matters: r6data killed its v1 API in Aug 2026 and, because the old check
   only looked at auth, nothing alarmed for two months while the app served frozen data. */
function decide(d, now) {
  now = now || Date.now();
  const exp = (d && d.keyExpires) || null;
  const days = exp ? Math.ceil((Date.parse(exp + "T00:00:00Z") - now) / 86400000) : null;
  const past = exp ? (now > Date.parse(exp + "T23:59:59Z")) : false;
  const status = (d && d.keyStatus) || "";
  const rejected = status === "invalid" || status === "expired" || past;
  const down = status === "down";
  const bad = rejected || down;
  const soon = !bad && days != null && days <= 14;
  const state = bad ? "bad" : (soon ? "soon" : "ok");
  const err = (d && d.syncError) || null;
  const stale = (d && d.updated) || null;
  let title = null, body = null;
  if (bad || soon) {
    title = rejected
      ? "🔑 Stats API key rejected — Players sync is down"
      : down
        ? "🚨 Players stats sync is down — every fetch is failing"
        : `🔑 Stats API key expires in ${days} day(s) (on ${exp})`;
    body = [
      rejected
        ? "**The stats API key was rejected, so the Players tab has stopped updating.**"
        : down
          ? `**Every player fetch failed this run, so the Players tab is serving stale data.**${err ? `\n\nReported error: \`${err}\`` : ""}`
          : `**Heads up — the stats API key expires on ${exp} (${days} day(s) left).**`,
      "",
      "### Fix it (~2 min)",
      "1. Get / renew a key → https://r6.arenyze.com/dashboard  (free tier is 3,000 calls/month; we use well under that).",
      "2. Repo → **Settings → Secrets and variables → Actions** → edit **`R6DATA_API_KEY`** and paste the new key.",
      "3. Repo → **Actions → Refresh player stats → Run workflow** to confirm it syncs, then close this issue.",
      "",
      down
        ? "_If the key is fine, the provider may have changed the API again — check https://r6.arenyze.com/api-docs against `scripts/fetch-stats.js`._"
        : "_Arenyze keys don't carry the 90-day expiry the old r6data keys did; `api_key_expires` in `scripts/players.config.json` can stay null._",
      "",
      `_keyStatus=${status || "?"}${stale ? `, last updated ${stale}` : ""}. Auto-opened by the stats workflow._`,
      "cc @JPLutz7",
    ].join("\n");
  }
  return { state, days, title, body };
}
module.exports = { decide };
