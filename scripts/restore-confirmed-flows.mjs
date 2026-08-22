import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

if (process.argv[2] !== "--apply" || !process.argv[3]) {
  throw new Error("Uso: node scripts/restore-confirmed-flows.mjs --apply <recovery-report.json>");
}
const reportPath = path.resolve(process.argv[3]);
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const projectId = report.projectId;
const firebaseToolsRoot = path.join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools");
const require = createRequire(path.join(firebaseToolsRoot, "package.json"));
const auth = require(path.join(firebaseToolsRoot, "lib", "auth.js"));
const session = JSON.parse(await fs.readFile(path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"), "utf8"));
const token = (await auth.getAccessToken(session.tokens?.refresh_token, [])).access_token;
const database = `projects/${projectId}/databases/(default)`;
const base = `https://firestore.googleapis.com/v1/${database}/documents`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const get = async (documentPath) => {
  const response = await fetch(`${base}/${documentPath}`, { headers });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
};

const targets = report.targetMatches.filter((item) => item.previousIdCandidates?.length === 1);
const expected = new Set(["204/2026", "205/2026", "206/2026"]);
if (targets.length !== 3 || targets.some((item) => !expected.has(item.restoredId))) {
  throw new Error("O relatório não contém exatamente os três mapeamentos confirmados 204/205/206");
}
const occupied = new Map(report.mapping.map((item) => [item.currentId, item.internalId]));
for (const target of targets) {
  const owner = occupied.get(target.restoredId);
  if (owner && owner !== target.internalId) throw new Error(`Número ${target.restoredId} ocupado por ${owner}`);
}

const writes = [];
const restoredAt = new Date().toISOString();
for (const target of targets) {
  const current = await get(`records/${target.internalId}`);
  const currentNumber = current.fields?.recordNumber?.stringValue || "";
  if (currentNumber !== target.currentId) throw new Error(`Registro ${target.internalId} mudou após o backup`);
  writes.push({
    update: {
      name: `${database}/documents/records/${target.internalId}`,
      fields: {
        recordNumber: { stringValue: target.restoredId },
        updatedAt: { stringValue: restoredAt },
      },
    },
    updateMask: { fieldPaths: ["recordNumber", "updatedAt"] },
    currentDocument: { updateTime: current.updateTime },
  });
  const auditId = crypto.randomUUID();
  writes.push({
    update: {
      name: `${database}/documents/logs/${auditId}`,
      fields: {
        id: { stringValue: auditId },
        recordId: { stringValue: target.internalId },
        recordNumber: { stringValue: target.restoredId },
        action: { stringValue: "Recuperação de ID após renumeração" },
        actorId: { stringValue: "firebase-admin-recovery" },
        actorName: { stringValue: "Recuperação administrativa" },
        actorRole: { stringValue: "admin" },
        detail: { stringValue: `${target.currentId} -> ${target.restoredId}; backup: ${path.basename(path.dirname(reportPath))}` },
        changes: { mapValue: { fields: { recordNumber: { mapValue: { fields: {
          before: { stringValue: target.currentId }, after: { stringValue: target.restoredId },
        } } } } } },
        createdAt: { stringValue: restoredAt },
      },
    },
    currentDocument: { exists: false },
  });
}

const counter = await get("settings/recordCounter_2026");
const currentCounter = Number(counter.fields?.value?.integerValue || 0);
writes.push({
  update: {
    name: `${database}/documents/settings/recordCounter_2026`,
    fields: { value: { integerValue: String(Math.max(currentCounter, 206)) }, year: { integerValue: "2026" } },
  },
  updateMask: { fieldPaths: ["value", "year"] },
  currentDocument: { updateTime: counter.updateTime },
});

const response = await fetch(`https://firestore.googleapis.com/v1/${database}/documents:commit`, {
  method: "POST", headers, body: JSON.stringify({ writes }),
});
if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
const result = await response.json();
console.log(JSON.stringify({ restored: targets.map(({ internalId, currentId, restoredId }) => ({ internalId, currentId, restoredId })), counter: Math.max(currentCounter, 206), commitTime: result.commitTime }));
