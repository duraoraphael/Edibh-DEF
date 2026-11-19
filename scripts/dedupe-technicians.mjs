// Unifies technician name variants ("João Silva" / "joao silva" / "João  Silva ") in Firestore.
// Dry-run by default: reads only and writes a report to recovery/dedupe-technicians/.
// --apply rewrites ONLY name strings (records.authorName, records.deletedByName, approvals.reviewerName).
// It never changes authorId, never deletes anything and never touches users or logs (logs are immutable).
// Requires `firebase login` on this machine (same auth as scripts/repair-auth-profiles.mjs).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const project = 'cim-normatel-ac5b7';
const apply = process.argv.includes('--apply');
const session = JSON.parse(await fs.readFile(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
const token = (await require('firebase-tools/lib/auth').getAccessToken(session.tokens?.refresh_token, [])).access_token;
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`API ${new URL(url).hostname}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

async function listAll(collection) {
  const documents = [];
  let pageToken = '';
  do {
    const page = await api(`${base}/${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    documents.push(...(page.documents || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return documents;
}

const idOf = (document) => document.name.split('/').at(-1);
const str = (document, field) => document.fields?.[field]?.stringValue ?? '';
const clean = (value) => value.replace(/\s+/g, ' ').trim();
const keyOf = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const richness = (value) => [...value].reduce((score, char) => score + (char !== char.toLowerCase() ? 1 : 0) + (char.charCodeAt(0) > 127 ? 1 : 0), 0);

// Spellings the owner confirmed are the same person (different spelling, not just case/accents/spaces).
// Left as-is: "Davi Costa Moreira" vs "David Luciano Lacerda" (different people).
const ALIASES = new Map([
  ['Ataide Fernades de Oliveira Neto', 'Ataide Fernandes'],
  ['Ataide Fernandes de Oliveira Neto', 'Ataide Fernandes'],
  ['Daniel Gomes de Souza', 'Daniel Gomes'],
  ['Ryan Moreira de Oliveira', 'Ryan Oliveira'],
].map(([from, to]) => [keyOf(from), to]));
const resolve = (label) => ALIASES.get(keyOf(label)) ?? label;

const users = await listAll('users');
const records = await listAll('records');
const approvals = await listAll('approvals');

// Name fields to unify per collection. Only these string fields are ever written.
const targets = [
  { collection: 'records', documents: records, fields: ['authorName', 'deletedByName'] },
  { collection: 'approvals', documents: approvals, fields: ['reviewerName'] },
];

// Registered, non-inactive users define the preferred spelling.
const registered = new Map();
for (const user of users) {
  const name = clean(str(user, 'name'));
  if (name && str(user, 'status') !== 'inativo') registered.set(keyOf(name), name);
}

// Count every variant seen, per person key.
const variants = new Map();
for (const { documents, fields } of targets) {
  for (const document of documents) {
    for (const field of fields) {
      const label = resolve(clean(str(document, field)));
      if (!label) continue;
      const key = keyOf(label);
      const counts = variants.get(key) ?? new Map();
      counts.set(label, (counts.get(label) ?? 0) + 1);
      variants.set(key, counts);
    }
  }
}

const canonical = new Map();
for (const [key, counts] of variants) {
  const best = [...counts].sort((a, b) => b[1] - a[1] || richness(b[0]) - richness(a[0]) || a[0].localeCompare(b[0], 'pt-BR'))[0][0];
  canonical.set(key, registered.get(key) ?? best);
}

const groups = [...variants]
  .filter(([key, counts]) => counts.size > 1 || [...counts.keys()].some((label) => label !== canonical.get(key)))
  .map(([key, counts]) => ({ canonical: canonical.get(key), registeredUser: registered.has(key), variants: Object.fromEntries(counts) }));

const changes = [];
for (const { collection, documents, fields } of targets) {
  for (const document of documents) {
    const set = {};
    for (const field of fields) {
      const current = str(document, field);
      if (!current) continue;
      const wanted = canonical.get(keyOf(resolve(current)));
      if (wanted && wanted !== current) set[field] = { from: current, to: wanted };
    }
    if (Object.keys(set).length) changes.push({ collection, id: idOf(document), updateTime: document.updateTime, set });
  }
}

// Users that look like the same person (same normalized name): reported only, never modified.
const usersByName = new Map();
for (const user of users) {
  const key = keyOf(str(user, 'name'));
  if (!key) continue;
  usersByName.set(key, [...(usersByName.get(key) ?? []), { uid: idOf(user), email: str(user, 'email'), status: str(user, 'status'), role: str(user, 'role') }]);
}
const duplicateUsers = [...usersByName].filter(([, list]) => list.length > 1).map(([name, list]) => ({ name, accounts: list }));

const report = {
  project, mode: apply ? 'apply' : 'dry-run',
  totals: { users: users.length, records: records.length, approvals: approvals.length, nameGroupsToUnify: groups.length, documentsToChange: changes.length },
  groups, duplicateUsers, changes,
};
await fs.mkdir('recovery/dedupe-technicians', { recursive: true });
const file = `recovery/dedupe-technicians/report-${Date.now()}.json`;
await fs.writeFile(file, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, changes: `${changes.length} documents (see ${file})` }, null, 2));

if (!apply) {
  console.log('\nDry run: nothing was written. Review the report, then re-run with --apply.');
} else {
  // Back up the exact documents about to change, so any write can be reverted by hand.
  const changed = new Set(changes.map((change) => `${change.collection}/${change.id}`));
  const backup = [...records, ...approvals].filter((document) => changed.has(document.name.split('/documents/')[1]));
  const backupFile = `recovery/dedupe-technicians/backup-${Date.now()}.json`;
  await fs.writeFile(backupFile, JSON.stringify(backup, null, 2));
  console.log(`Backup of ${backup.length} documents: ${backupFile}`);

  let written = 0;
  for (let i = 0; i < changes.length; i += 400) {
    const writes = changes.slice(i, i + 400).map((change) => ({
      update: {
        name: `projects/${project}/databases/(default)/documents/${change.collection}/${change.id}`,
        fields: Object.fromEntries(Object.entries(change.set).map(([field, { to }]) => [field, { stringValue: to }])),
      },
      updateMask: { fieldPaths: Object.keys(change.set) },
      // Fails (instead of overwriting) if the document changed since it was read.
      currentDocument: { updateTime: change.updateTime },
    }));
    await api(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
    written += writes.length;
    console.log(`Wrote ${written}/${changes.length}`);
  }
}
