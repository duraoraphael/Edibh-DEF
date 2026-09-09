// Dry-run by default. --apply-missing only creates verified absent profiles as pending viewers.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const project = 'cim-normatel-ac5b7';
const session = JSON.parse(await fs.readFile(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
const token = (await require('firebase-tools/lib/auth').getAccessToken(session.tokens?.refresh_token, [])).access_token;
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`API ${new URL(url).hostname}: HTTP ${response.status}`);
  return response.json();
}
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const accounts = await api(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=1000`);
const profiles = await api(`${base}/users?pageSize=1000`);
if (accounts.nextPageToken || profiles.nextPageToken) throw new Error('Incomplete inventory: stop before repair');
const users = accounts.users || [];
const docs = profiles.documents || [];
const ttl = await api(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/users/fields?filter=${encodeURIComponent('ttlConfig:*')}`);
const ids = new Set(docs.map(d=>d.name.split('/').at(-1)));
const authIds = new Set(users.map(u=>u.localId));
const missing = users.filter(u=>!ids.has(u.localId));
const plan = {
  project, missingProfiles: missing.map(u=>({ uid: u.localId, disabled: !!u.disabled, alternateProfileIds: docs.filter(d=>d.fields?.email?.stringValue?.toLowerCase() === u.email?.toLowerCase()).map(d=>d.name.split('/').at(-1)) })),
  firestoreOnly: docs.filter(d=>!authIds.has(d.name.split('/').at(-1))).map(d=>d.name.split('/').at(-1)),
  incomplete: docs.filter(d=>!d.fields?.name?.stringValue || !d.fields?.email?.stringValue || !['admin','gerente','tecnico','visualizador'].includes(d.fields?.role?.stringValue)).map(d=>d.name.split('/').at(-1)),
  uidMismatch: docs.filter(d=>d.fields?.uid && d.fields.uid.stringValue !== d.name.split('/').at(-1)).map(d=>d.name.split('/').at(-1)),
  ttlFields: (ttl.fields || []).filter(field=>field.ttlConfig).map(field=>({ field: field.name.split('/').at(-1), state: field.ttlConfig.state })),
};
console.log(JSON.stringify(plan, null, 2));
await fs.mkdir('recovery/auth-repair', { recursive: true });
await fs.writeFile(`recovery/auth-repair/plan-${Date.now()}.json`, JSON.stringify(plan, null, 2));
if (process.argv.includes('--apply-missing')) {
  for (const candidate of plan.missingProfiles) {
    if (candidate.disabled || candidate.alternateProfileIds.length) { console.log(JSON.stringify({ uid: candidate.uid, action: 'manual-review-required' })); continue; }
    const account = users.find(u=>u.localId === candidate.uid);
    if (!account?.email) continue;
    const fields = Object.fromEntries(Object.entries({ uid: account.localId, name: account.displayName || 'Usuário', email: account.email.toLowerCase(), role: 'visualizador', status: 'pendente', avatarUrl: '', department: '' }).map(([k,v])=>[k,{ stringValue: v }]));
    fields.approved = { booleanValue: false };
    await api(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes: [{ update: { name: `projects/${project}/databases/(default)/documents/users/${account.localId}`, fields }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'lastActive', setToServerValue: 'REQUEST_TIME' }] }] }) });
    console.log(JSON.stringify({ uid: account.localId, action: 'created-pending-viewer', approved: false }));
  }
}
if (process.argv.includes('--authorize-production-domain')) {
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
  const config = await api(url);
  const domain = 'fluxocriticos.vercel.app';
  if (!(config.authorizedDomains || []).includes(domain)) {
    await api(`${url}?updateMask=authorizedDomains`, { method: 'PATCH', body: JSON.stringify({ authorizedDomains: [...(config.authorizedDomains || []), domain] }) });
  }
  console.log(JSON.stringify({ authorizedDomain: domain, verified: (await api(url)).authorizedDomains.includes(domain) }));
}
