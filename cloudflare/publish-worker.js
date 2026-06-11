/* R6 Stack — publish proxy (Cloudflare Worker).
 *
 * Lets the whole stack hit "✓ Make changes permanent" in the app using ONE shared
 * team password, instead of each person creating a personal GitHub token / being
 * added to the repo. The bot token + password live here as Worker secrets (never in
 * the app). The Worker validates the password and commits index.html + version.json
 * to the repo — exactly what the app's publishLive() used to do client-side.
 *
 * Worker → Settings → Variables and Secrets:
 *   Secrets (encrypted):
 *     GH_TOKEN        a GitHub fine-grained PAT, Contents: Read and write on the repo
 *     TEAM_PASSWORD   the shared password you give the stack
 *   (optional plain Variables, else the defaults below are used):
 *     GH_REPO         "JPLutz7/R6Tactics"
 *     GH_BRANCH       "main"
 *     ALLOW_ORIGIN    "https://jplutz7.github.io"   (the live app origin)
 */
const DEFAULTS = { GH_REPO: "JPLutz7/R6Tactics", GH_BRANCH: "main", ALLOW_ORIGIN: "https://jplutz7.github.io" };

const b64enc = (str) => { const b = new TextEncoder().encode(str); let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
const b64dec = (b64) => { const bin = atob((b64 || "").replace(/\s+/g, "")); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return new TextDecoder().decode(b); };

async function gh(env, path, opts = {}) {
  const r = await fetch("https://api.github.com" + path, {
    ...opts,
    headers: { "Authorization": "Bearer " + env.GH_TOKEN, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "r6tactics-publish-worker", ...(opts.headers || {}) },
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("GitHub " + r.status + (t ? ": " + t.slice(0, 200) : "")); }
  return r.json();
}

export default {
  async fetch(req, env) {
    const cfg = (k) => (env && env[k]) || DEFAULTS[k];
    const cors = { "Access-Control-Allow-Origin": cfg("ALLOW_ORIGIN"), "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
    if (!env.TEAM_PASSWORD || String(body.password || "") !== String(env.TEAM_PASSWORD)) return json({ ok: false, error: "wrong team password" }, 401);
    if (!body.data || typeof body.data !== "object") return json({ ok: false, error: "missing data" }, 400);
    if (!env.GH_TOKEN) return json({ ok: false, error: "server not configured (GH_TOKEN)" }, 500);

    const [owner, name] = cfg("GH_REPO").split("/");
    const branch = cfg("GH_BRANCH");
    try {
      const ref = await gh(env, `/repos/${owner}/${name}/git/ref/heads/${branch}`);
      const baseSha = ref.object.sha;
      const baseCommit = await gh(env, `/repos/${owner}/${name}/git/commits/${baseSha}`);
      const tree = await gh(env, `/repos/${owner}/${name}/git/trees/${baseCommit.tree.sha}`);
      const idxEntry = tree.tree.find((t) => t.path === "index.html");
      if (!idxEntry) throw new Error("index.html not in repo root");
      const verEntry = tree.tree.find((t) => t.path === "version.json");
      const curIndex = b64dec((await gh(env, `/repos/${owner}/${name}/git/blobs/${idxEntry.sha}`)).content);
      let curBuild = 0;
      if (verEntry) { try { curBuild = (JSON.parse(b64dec((await gh(env, `/repos/${owner}/${name}/git/blobs/${verEntry.sha}`)).content)).build | 0); } catch {} }
      const newBuild = curBuild + 1;

      const BEGIN = "/* ====== BEGIN EMBEDDED DATA", END = "/* ====== END EMBEDDED DATA";
      const bi = curIndex.indexOf(BEGIN), ble = curIndex.indexOf("\n", bi) + 1, ei = curIndex.indexOf(END);
      if (bi < 0 || ei < 0) throw new Error("data markers not found in index.html");
      const deployedVer = +((curIndex.slice(bi).match(/"version":\s*(\d+)/) || [])[1]) || 0;

      // race-free clobber guard: reject a publish whose edits were based on an older
      // version than what's currently live (someone published in between), unless forced.
      if (body.baseVersion != null && deployedVer > (body.baseVersion | 0) && !body.force)
        return json({ ok: false, conflict: true, deployedVer, error: "newer version already published" }, 409);

      const out = body.data;
      out.version = Math.max(deployedVer, out.version | 0) + 1;
      out.publishedAt = new Date().toISOString().slice(0, 10);

      let newIndex = curIndex.slice(0, ble) + JSON.stringify(out, null, 2) + "\n" + curIndex.slice(ei);
      if (!/const APP_BUILD = \d+;/.test(newIndex)) throw new Error("APP_BUILD not found in index.html");
      newIndex = newIndex.replace(/const APP_BUILD = \d+;/, "const APP_BUILD = " + newBuild + ";");
      const newVer = JSON.stringify({ build: newBuild }) + "\n";

      const bIdx = await gh(env, `/repos/${owner}/${name}/git/blobs`, { method: "POST", body: JSON.stringify({ content: b64enc(newIndex), encoding: "base64" }) });
      const bVer = await gh(env, `/repos/${owner}/${name}/git/blobs`, { method: "POST", body: JSON.stringify({ content: b64enc(newVer), encoding: "base64" }) });
      const nt = await gh(env, `/repos/${owner}/${name}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: [
        { path: "index.html", mode: "100644", type: "blob", sha: bIdx.sha },
        { path: "version.json", mode: "100644", type: "blob", sha: bVer.sha },
      ] }) });
      const commit = await gh(env, `/repos/${owner}/${name}/git/commits`, { method: "POST", body: JSON.stringify({ message: `Publish from app — data v${out.version}, build ${newBuild}`, tree: nt.sha, parents: [baseSha] }) });
      await gh(env, `/repos/${owner}/${name}/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });

      return json({ ok: true, version: out.version, build: newBuild });
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e) }, 500);
    }
  },
};
