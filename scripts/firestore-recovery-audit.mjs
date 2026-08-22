import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const projectId = process.argv[2] || "cim-normatel-ac5b7";
const firebaseToolsRoot = path.join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools");
const require = createRequire(path.join(firebaseToolsRoot, "package.json"));
const auth = require(path.join(firebaseToolsRoot, "lib", "auth.js"));
const session = JSON.parse(await fs.readFile(path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"), "utf8"));
const token = (await auth.getAccessToken(session.tokens?.refresh_token, [])).access_token;
if (!token) throw new Error("Sessão do Firebase CLI indisponível");

const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const api = async (url, init = {}) => {
  const response = await fetch(url, { ...init, headers: { ...headers, ...init.headers } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response.json();
};
const encodeDocPath = (value) => value.split("/").map(encodeURIComponent).join("/");

function decodeValue(value) {
  if (!value || typeof value !== "object") return value;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("stringValue" in value) return value.stringValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return value;
}
function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

async function listCollectionIds(parent = "") {
  const suffix = parent ? `/${encodeDocPath(parent)}` : "";
  const result = await api(`${base}${suffix}:listCollectionIds`, { method: "POST", body: JSON.stringify({ pageSize: 1000 }) });
  return result.collectionIds || [];
}

async function listDocuments(parent, collectionId) {
  const documents = [];
  let pageToken;
  do {
    const prefix = parent ? `${base}/${encodeDocPath(parent)}/${encodeURIComponent(collectionId)}` : `${base}/${encodeURIComponent(collectionId)}`;
    const url = new URL(prefix);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await api(url);
    documents.push(...(result.documents || []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return documents;
}

const firestore = [];
async function walk(parent = "") {
  for (const collectionId of await listCollectionIds(parent)) {
    for (const document of await listDocuments(parent, collectionId)) {
      const documentPath = document.name.split("/documents/")[1];
      firestore.push({
        path: documentPath,
        id: documentPath.split("/").at(-1),
        collection: collectionId,
        createTime: document.createTime,
        updateTime: document.updateTime,
        data: decodeFields(document.fields),
        raw: document,
      });
      await walk(documentPath);
    }
  }
}
await walk();

const storage = [];
let storagePageToken;
const bucket = `${projectId}.firebasestorage.app`;
do {
  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${bucket}/o`);
  url.searchParams.set("maxResults", "1000");
  if (storagePageToken) url.searchParams.set("pageToken", storagePageToken);
  const result = await api(url);
  storage.push(...(result.items || []).map(({ name, size, contentType, timeCreated, updated, md5Hash, metadata }) => ({
    name, size, contentType, timeCreated, updated, md5Hash, metadata,
  })));
  storagePageToken = result.nextPageToken;
} while (storagePageToken);

const records = firestore.filter((item) => item.path.split("/").length === 2 && item.collection === "records");
const byRecordId = new Map(records.map((record) => [record.id, record]));
const numberOwners = new Map();
for (const record of records) {
  const number = String(record.data.recordNumber || "").trim();
  if (!numberOwners.has(number)) numberOwners.set(number, []);
  numberOwners.get(number).push(record.id);
}

const references = new Map(records.map((record) => [record.id, []]));
for (const item of firestore) {
  const recordId = item.data.recordId;
  if (typeof recordId === "string" && references.has(recordId)) references.get(recordId).push(item);
}
const mapping = records.map((record) => {
  const current = String(record.data.recordNumber || "").trim();
  const evidence = references.get(record.id)
    .filter((item) => item.data.recordNumber && String(item.data.recordNumber).trim() !== current)
    .map((item) => ({ path: item.path, recordNumber: String(item.data.recordNumber).trim(), createdAt: item.data.createdAt || item.createTime }));
  const candidates = [...new Set(evidence.map((item) => item.recordNumber))];
  return {
    internalId: record.id,
    previousIdCandidates: candidates,
    currentId: current,
    restoredId: candidates.length === 1 ? candidates[0] : null,
    status: record.data.status,
    deletedAt: record.data.deletedAt || null,
    createdAt: record.data.createdAt || record.createTime,
    updatedAt: record.data.updatedAt || record.updateTime,
    attachmentCount: Array.isArray(record.data.attachments) ? record.data.attachments.length : 0,
    referenceCount: references.get(record.id).length,
    evidence,
  };
});
const renumberEvents = firestore
  .filter((item) => item.collection === "logs" && /renumera/i.test(String(item.data.action || "")))
  .map((item) => ({ path: item.path, ...item.data, createTime: item.createTime }));
const duplicates = [...numberOwners.entries()].filter(([number, owners]) => number && owners.length > 1).map(([number, owners]) => ({ number, owners }));
const targetMatches = mapping.filter((item) => ["204", "205", "206"].some((n) =>
  item.currentId.replace(/^0+/, "").split("/")[0] === n || item.previousIdCandidates.some((candidate) => candidate.replace(/^0+/, "").split("/")[0] === n)
));
const orphanReferences = firestore.filter((item) => typeof item.data.recordId === "string" && !byRecordId.has(item.data.recordId));

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(process.cwd(), "recovery", timestamp);
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "firestore-backup.json"), JSON.stringify({ projectId, exportedAt: new Date().toISOString(), documents: firestore }, null, 2));
await fs.writeFile(path.join(outputDir, "storage-inventory.json"), JSON.stringify({ projectId, exportedAt: new Date().toISOString(), objects: storage }, null, 2));
await fs.writeFile(path.join(outputDir, "recovery-report.json"), JSON.stringify({
  projectId,
  generatedAt: new Date().toISOString(),
  counts: { firestoreDocuments: firestore.length, records: records.length, storageObjects: storage.length, orphanReferences: orphanReferences.length },
  renumberEvents,
  duplicates,
  targetMatches,
  orphanReferences: orphanReferences.map((item) => ({ path: item.path, recordId: item.data.recordId, recordNumber: item.data.recordNumber || null })),
  mapping,
}, null, 2));
console.log(JSON.stringify({ outputDir, records: records.length, firestoreDocuments: firestore.length, storageObjects: storage.length, renumberEvents: renumberEvents.length, duplicates: duplicates.length, targetMatches: targetMatches.length, orphanReferences: orphanReferences.length }));
