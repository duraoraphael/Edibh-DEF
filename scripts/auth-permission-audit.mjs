// Read-only production diagnosis. Never emits tokens, emails or password hashes.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
const require = createRequire(import.meta.url);
const session = JSON.parse(await fs.readFile(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
const token = (await require('firebase-tools/lib/auth').getAccessToken(session.tokens?.refresh_token, [])).access_token;
const local = parseEnv(await fs.readFile('.env.local', 'utf8'));
const project = local.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
async function get(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) { console.log(JSON.stringify({ endpoint: new URL(url).hostname, status: r.status })); return {}; }
  return r.json();
}
const [billing, config, appcheck, profiles, accounts, releases] = await Promise.all([
  get(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`),
  get(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`),
  get(`https://firebaseappcheck.googleapis.com/v1/projects/${project}/services`),
  get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users?pageSize=1000`),
  get(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=1000`),
  get(`https://firebaserules.googleapis.com/v1/projects/${project}/releases`),
]);
const users = accounts.users || [];
const docs = profiles.documents || [];
const ids = new Set(users.map(u => u.localId));
const profileIds = new Set(docs.map(d => d.name.split('/').at(-1)));
const roles = {};
for (const d of docs) { const key = `${d.fields?.role?.stringValue || 'missing'}/${d.fields?.status?.stringValue || 'legacy'}`; roles[key] = (roles[key] || 0) + 1; }
console.log(JSON.stringify({ project, billingEnabled: billing.billingEnabled, emailPassword: config.signIn?.email, authorizedDomains: config.authorizedDomains, appcheck: appcheck.services, counts: { auth: users.length, profiles: docs.length, disabled: users.filter(u=>u.disabled).length, withoutPassword: users.filter(u=>!u.passwordHash).length, authWithoutProfile: users.filter(u=>!profileIds.has(u.localId)).length, profileWithoutAuth: docs.filter(d=>!ids.has(d.name.split('/').at(-1))).length, duplicateEmails: users.length - new Set(users.map(u=>u.email?.toLowerCase())).size }, roles, partial: !!(accounts.nextPageToken || profiles.nextPageToken) }, null, 2));
for (const release of releases.releases || []) {
  const rules = await get(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  for (const file of rules.source?.files || []) {
    if (!['firestore.rules', 'storage.rules'].includes(file.name)) continue;
    await fs.mkdir('recovery/auth-audit', { recursive: true });
    await fs.writeFile(`recovery/auth-audit/production-${file.name}`, file.content);
    console.log(JSON.stringify({ rules: file.name, matchesLocal: (await fs.readFile(file.name, 'utf8')).replace(/\r/g,'') === file.content.replace(/\r/g,'') }));
  }
}
const html = await (await fetch('https://fluxocriticos.vercel.app/login')).text() + await (await fetch('https://fluxocriticos.vercel.app/records/new')).text();
const chunks = [...new Set([...html.matchAll(/src="([^\"]+\.js[^\"]*)"/g)].map(m=>m[1]))];
const js = (await Promise.all(chunks.map(async p=>(await fetch(new URL(p,'https://fluxocriticos.vercel.app'))).text()))).join('\n');
console.log(JSON.stringify({ bundleConfigMatchesLocal: Object.fromEntries(Object.entries(local).filter(([k])=>k.startsWith('NEXT_PUBLIC_FIREBASE_')).map(([k,v])=>[k,js.includes(v)])) }));
console.log(JSON.stringify({ productionSubmissionFields: Object.fromEntries(['sequenceCounterId', 'sequenceValue', 'lastRecordId', 'lastRecordNumber'].map(k=>[k,js.includes(k)])) }));
