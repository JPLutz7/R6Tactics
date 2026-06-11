# Shared-password publish proxy (Cloudflare Worker)

This lets the whole stack hit **"✓ Make changes permanent"** in the app using **one shared
team password** — no personal GitHub token, no being added to the repo. The bot token and the
password live only in the Worker (server-side secrets), never in the app.

`publish-worker.js` does exactly what the app's old `publishLive()` did, just server-side:
validate the password → commit `index.html` + `version.json` to the repo.

## One-time setup (≈10 min, owner does this)

### 1. Make the "bot" GitHub token
- <https://github.com/settings/personal-access-tokens/new> (signed in as the repo owner, **JPLutz7**)
- **Repository access** → *Only select repositories* → `JPLutz7/R6Tactics`
- **Permissions** → Repository → **Contents → Read and write**
- Pick an expiry, **Generate token**, copy the `github_pat_…` (this is `GH_TOKEN` below).
  *(Fine-grained tokens expire — when it does, just regenerate and update the Worker secret.)*

### 2. Create the Worker
- Sign up free at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Create Worker**.
- Name it e.g. `r6tactics-publish` → **Deploy** (the placeholder) → **Edit code**.
- Delete the placeholder, paste **all** of `publish-worker.js`, **Deploy**.

### 3. Add the secrets
Worker → **Settings** → **Variables and Secrets** → **Add**:
- Type **Secret** · name `GH_TOKEN` · value = the `github_pat_…` from step 1.
- Type **Secret** · name `TEAM_PASSWORD` · value = a password you choose for the stack.

*(Optional plain Variables if anything differs from the defaults: `GH_REPO`, `GH_BRANCH`,
`ALLOW_ORIGIN`. You normally don't need these.)*
Re-**Deploy** after adding secrets.

### 4. Get the URL and send it to me
- Copy the Worker URL — looks like `https://r6tactics-publish.<your-subdomain>.workers.dev`.
- Give it to me; I set `PUBLISH_PROXY_URL` in `index.html` and ship. Done.

### 5. Tell the stack the password
Each member: app → **Data → "✓ Make changes permanent"** → first time, paste the **team password** →
publish. That's it — no GitHub anything on their end.

## Notes
- Security is the team password (a public Worker URL is fine — the password gates everything).
  Pick something non-trivial; you can rotate it anytime by changing the `TEAM_PASSWORD` secret.
- All proxy publishes are committed by the bot token's account (shows as the owner).
- The personal-token flow still works as a fallback when `PUBLISH_PROXY_URL` is empty, and
  **Copy publish JSON** remains the no-infrastructure escape hatch.
