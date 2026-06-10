#!/usr/bin/env node
/* Bump the PWA build number in BOTH version.json and index.html's APP_BUILD,
   in sync. Run this once per deploy (any code/content change) so installed
   apps show the in-app "New version available — Update" prompt.
   Usage: node scripts/bump-build.js  */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const vjPath = path.join(root, "version.json");
const idxPath = path.join(root, "index.html");

const vj = JSON.parse(fs.readFileSync(vjPath, "utf8"));
const next = (vj.build | 0) + 1;
vj.build = next;
fs.writeFileSync(vjPath, JSON.stringify(vj) + "\n");

let idx = fs.readFileSync(idxPath, "utf8");
const re = /const APP_BUILD = \d+;/;
if (!re.test(idx)) { console.error("ERROR: 'const APP_BUILD = N;' not found in index.html"); process.exit(1); }
idx = idx.replace(re, `const APP_BUILD = ${next};`);
fs.writeFileSync(idxPath, idx);

console.log("PWA build bumped ->", next);
