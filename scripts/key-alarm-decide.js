/* Decide whether the r6data API key needs attention, and build the issue text
   (with the renewal link + steps) that gets emailed to the owner. Pure function
   so it's unit-testable; the workflow's github-script step calls it. */
function decide(d, now) {
  now = now || Date.now();
  const exp = (d && d.keyExpires) || null;
  const days = exp ? Math.ceil((Date.parse(exp + "T00:00:00Z") - now) / 86400000) : null;
  const past = exp ? (now > Date.parse(exp + "T23:59:59Z")) : false;
  const bad = (d && (d.keyStatus === "invalid" || d.keyStatus === "expired")) || past;
  const soon = !bad && days != null && days <= 14;
  const state = bad ? "bad" : (soon ? "soon" : "ok");
  let title = null, body = null;
  if (bad || soon) {
    title = bad
      ? "🔑 r6data API key expired — Players stats sync is down"
      : `🔑 r6data API key expires in ${days} day(s) (on ${exp})`;
    body = [
      bad
        ? "**The r6data API key was rejected, so the Players tab has stopped updating.**"
        : `**Heads up — the r6data API key expires on ${exp} (${days} day(s) left).**`,
      "",
      "### Renew it (~2 min)",
      "1. Get a new key → https://r6data.com  (sign in, then the API / get-key page).",
      "2. Repo → **Settings → Secrets and variables → Actions** → edit **`R6DATA_API_KEY`** and paste the new key.",
      "3. Edit **`scripts/players.config.json`** → set **`api_key_expires`** to the new expiry date (~90 days out).",
      "4. Repo → **Actions → Refresh player stats → Run workflow** to confirm it syncs, then close this issue.",
      "",
      `_keyStatus=${(d && d.keyStatus) || "?"}. Auto-opened by the stats workflow._`,
      "cc @JPLutz7",
    ].join("\n");
  }
  return { state, days, title, body };
}
module.exports = { decide };
