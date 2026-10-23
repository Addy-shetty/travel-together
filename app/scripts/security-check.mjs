#!/usr/bin/env node
// Security gate (docs/security/SSDLC.md, step 5):
//  1. npm audit: fail on any advisory not in security/accepted-advisories.json, or past its reviewBy date.
//  2. Secret scan: fail if a secret-looking value is present in tracked source files.
// Uses only Node built-ins so the gate itself adds no dependencies.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const appDir = new URL('..', import.meta.url).pathname;
const repoDir = join(appDir, '..');
let failed = false;
const fail = (msg) => { failed = true; console.error(`✗ ${msg}`); };

// ── 1. Dependency audit ──────────────────────────────────────────
let audit;
try {
  audit = JSON.parse(execFileSync('npm', ['audit', '--json'], { cwd: appDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch (e) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  audit = JSON.parse(e.stdout);
}
const accepted = JSON.parse(readFileSync(join(appDir, 'security/accepted-advisories.json'), 'utf8')).advisories;
const today = new Date().toISOString().slice(0, 10);

const found = new Map();
for (const [pkg, v] of Object.entries(audit.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== 'object') continue;
    const id = via.url.split('/').pop();
    found.set(id, { pkg, severity: via.severity, title: via.title });
  }
}
for (const [id, a] of found) {
  const ok = accepted.find((x) => x.id === id);
  if (!ok) fail(`New ${a.severity} advisory ${id} in ${a.pkg}: ${a.title}`);
  else if (ok.reviewBy < today) fail(`Accepted advisory ${id} (${a.pkg}) passed its review date ${ok.reviewBy}`);
}
for (const a of accepted) {
  if (!found.has(a.id)) console.log(`ℹ ${a.id} (${a.package}) no longer reported — remove it from accepted-advisories.json`);
}
console.log(`Dependency audit: ${found.size} advisories, ${[...found.keys()].filter((id) => accepted.some((a) => a.id === id)).length} accepted.`);

// ── 2. Secret scan ───────────────────────────────────────────────
const patterns = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*?(cm9sZSI6InNlcnZpY2Vfcm9sZS|InJvbGUiOiJzZXJ2aWNlX3JvbGUi)[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/, 'Supabase service_role JWT'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'Private key'],
  [/\bSK[0-9a-fA-F]{32}\b/, 'Twilio API key'],
  [/\bAC[0-9a-fA-F]{32}\b/, 'Twilio Account SID'],
  [/sbp_[0-9a-f]{40}/, 'Supabase personal access token'],
];
const skipDirs = new Set(['node_modules', '.git', '.expo', 'ios', 'android', 'dist', '.temp', '.branches']);
const exts = /\.(ts|tsx|js|mjs|cjs|json|sql|toml|md|env|yml|yaml)$|^\.env/;
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  if (skipDirs.has(name)) return [];
  return statSync(p).isDirectory() ? walk(p) : exts.test(name) ? [p] : [];
});
let scanned = 0;
for (const file of walk(repoDir)) {
  if (file.endsWith('package-lock.json')) continue;
  const text = readFileSync(file, 'utf8');
  scanned++;
  for (const [re, label] of patterns) {
    if (re.test(text)) fail(`${label} found in ${relative(repoDir, file)}`);
  }
}
console.log(`Secret scan: ${scanned} files checked.`);

if (failed) {
  console.error('\nSecurity check FAILED. See docs/security/SSDLC.md.');
  process.exit(1);
}
console.log('\nSecurity check passed.');
