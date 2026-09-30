import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDocFromServer, getDocs, query, setDoc, where } from "firebase/firestore";
import ExcelJS from "exceljs";

test.skip(!process.env.FIRESTORE_EMULATOR_HOST, "Requires local Auth and Firestore emulators (npm run test:records).");
const localRequire = createRequire(path.join(process.cwd(), "tests", "record-edit-history.spec.ts"));
let env: RulesTestEnvironment;
let harness: { script: string; css: string };
let uid: string;
let server: Server | undefined;
const account = { email: "record-editor@example.test", password: "Test-only-password-123!" };

test.beforeAll(async () => {
  test.setTimeout(90_000);
  env = await initializeTestEnvironment({ projectId: "demo-upload-fix", firestore: { host: "127.0.0.1", port: 8180, rules: readFileSync("firestore.rules", "utf8") } });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...account, returnSecureToken: true }) });
  let body = await response.json();
  if (body.error?.message === "EMAIL_EXISTS") {
    body = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...account, returnSecureToken: true }) })).json();
  }
  expect(body.localId).toBeTruthy();
  uid = body.localId;
  harness = await localRequire("./support/records-browser-harness.cjs")();
  server = createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1:3200").pathname;
    if (pathname === "/records-harness.js") {
      response.setHeader("Content-Type", "application/javascript; charset=utf-8");
      response.end(harness.script);
    } else if (["/petrobras.png", "/Simbolo%20eng%20verde.png"].includes(pathname)) {
      response.setHeader("Content-Type", "image/png");
      response.end(readFileSync(path.join(process.cwd(), "public", decodeURIComponent(pathname.slice(1)))));
    } else {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<html lang="pt-BR"><head><meta charset="utf-8"><style>${harness.css}</style></head><body><main style="padding:24px"><div id="root"></div></main><script>window.testAccount=${JSON.stringify(account)};</script><script src="/records-harness.js"></script></body></html>`);
    }
  });
  await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(3200, "127.0.0.1", resolve); });
});
test.afterAll(async () => { await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); await env?.cleanup(); });

test.beforeEach(async ({ page }) => {
  page.on("pageerror", error => console.error("Browser error:", error.message));
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "users", uid), { name: "Técnico Teste", email: account.email, role: "tecnico", status: "ativo" });
    const fields = [
      { id: "date", key: "data", label: "Data", type: "data", required: true, order: 0 },
      { id: "equipment", key: "equipamento", label: "Equipamento", type: "texto", required: true, order: 1 },
      { id: "source", key: "tipos_de_dados_9", label: "Fonte de Dados", type: "texto", required: false, order: 2 },
    ];
    await setDoc(doc(db, "formFields", "default"), { id: "default", name: "Formulário Teste", fields });
    for (const [id, number, source, authorId] of [["own", "204/2026", "RDO", uid], ["foreign", "205/2026", "SUPERVISÓRIO IOT", "other-uid"], ["legacy", "206/2026", undefined, uid]]) {
      const record = {
        recordNumber: number,
        authorId,
        authorName: "Técnico Teste",
        status: "aprovado",
        createdAt: "2026-09-30T12:00:00Z",
        formId: "default",
        attachments: id === "own" ? [{ id: "kept-attachment", name: "manual.pdf", url: "https://firebasestorage.googleapis.com/v0/b/demo-upload-fix.appspot.com/o/attachments%2Fu1%2Fmanual.pdf?alt=media&token=test" }] : [],
        data: { ...(id !== "legacy" ? { data: "2026-09-01" } : {}), equipamento: `Equipamento ${id}`, ...(source ? { tipos_de_dados_9: source } : {}) },
      };
      await setDoc(doc(db, "records", id!), record);
      await setDoc(doc(db, "approvals", id!), { recordId: id, recordNumber: number, authorId, status: "aprovado", reviewerId: "admin" });
    }
  });
});

test("technician edits own approved flow, saves, reloads and sees the same flow in History", async ({ page }) => {
  await page.goto("/records");
  const originalRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "204/2026", exact: true }) });
  await expect(originalRow.getByRole("cell", { name: "01/09/2026", exact: true })).toBeVisible();
  await originalRow.getByRole("button", { name: "Abrir ações do registro" }).click();
  await page.getByRole("menuitem", { name: "Editar", exact: true }).click();
  await expect(page).toHaveURL(/records\/new\?id=own$/);
  const equipmentField = page.getByRole("textbox").nth(1);
  const flowDateField = page.getByRole("textbox").nth(0);
  const dataSourceField = page.getByRole("textbox").nth(2);
  await expect(equipmentField).toHaveValue("Equipamento own");
  await expect(flowDateField).toHaveValue("2026-09-01");
  await expect(dataSourceField).toHaveValue("RDO");
  await equipmentField.fill("Equipamento atualizado");
  await flowDateField.fill("2026-09-05");
  await dataSourceField.fill("SUPERVISORIO-IOT");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page).toHaveURL(/\/records$/);
  await page.reload();
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "204/2026", exact: true }) });
  await expect(row).toContainText("Equipamento atualizado");
  await expect(row.getByRole("cell", { name: "05/09/2026", exact: true })).toBeVisible();
  await expect(row.getByRole("cell", { name: "IOT", exact: true })).toBeVisible();
  const db = env.authenticatedContext(uid).firestore();
  const saved = (await getDocFromServer(doc(db, "records", "own"))).data()!;
  expect(saved.recordNumber).toBe("204/2026");
  expect(saved.authorId).toBe(uid);
  expect(saved.status).toBe("aprovado");
  expect(saved.createdAt).toBe("2026-09-30T12:00:00Z");
  expect(saved.attachments).toEqual([{ id: "kept-attachment", name: "manual.pdf", url: "https://firebasestorage.googleapis.com/v0/b/demo-upload-fix.appspot.com/o/attachments%2Fu1%2Fmanual.pdf?alt=media&token=test" }]);
  expect((await getDocs(collection(db, "records"))).size).toBe(3);
  expect((await getDocFromServer(doc(db, "approvals", "own"))).data()?.reviewerId).toBe("admin");
  await page.goto("/records/new?id=own");
  await expect(page.getByRole("textbox").nth(1)).toHaveValue("Equipamento atualizado");
});

test("technician can mark their own flow as CASE and cannot act on another technician's flow", async ({ page }) => {
  await page.goto("/records");
  const ownRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "204/2026", exact: true }) });
  await ownRow.getByRole("checkbox", { name: "Marcar como CASE o fluxo 204/2026" }).click();
  await expect(ownRow.getByRole("checkbox", { name: "Remover CASE do fluxo 204/2026" })).toBeChecked();

  const foreignRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "205/2026", exact: true }) });
  await expect(foreignRow.getByRole("checkbox")).toHaveCount(0);
  await foreignRow.getByRole("button", { name: "Abrir ações do registro" }).click();
  await expect(page.getByRole("menuitem", { name: "Editar", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  const db = env.authenticatedContext(uid).firestore();
  expect((await getDocFromServer(doc(db, "records", "own"))).data()?.isCase).toBe(true);
  await env.withSecurityRulesDisabled(async context => {
    const entries = await getDocs(query(collection(context.firestore(), "logs"), where("recordId", "==", "own")));
    const caseLog = entries.docs.map(entry => entry.data()).find(entry => entry.action === "Marcado como Case");
    expect(caseLog?.actorId).toBe(uid);
    expect(caseLog?.detail).toBe("CASE: Não -> Sim");
    expect(caseLog?.createdAt?.toDate()).toBeInstanceOf(Date);
  });
});

test("History date filters use the form date and fall back to createdAt only when missing", async ({ page }) => {
  await page.goto("/records");
  await page.getByRole("button", { name: "Filtros" }).click();
  const dateFrom = page.locator('input[title="Período de"]');
  await dateFrom.fill("2026-09-01");
  await expect(page.getByRole("cell", { name: "204/2026", exact: true })).toBeVisible();
  await dateFrom.fill("2026-09-30");
  await expect(page.getByRole("cell", { name: "204/2026", exact: true })).toHaveCount(0);
  const legacyRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "206/2026", exact: true }) });
  await expect(legacyRow.getByRole("cell", { name: "30/09/2026", exact: true })).toBeVisible();
});

test("foreign flow has no Edit action and a forged editor URL is blocked", async ({ page }) => {
  await page.goto("/records");
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "205/2026", exact: true }) });
  await row.getByRole("button", { name: "Abrir ações do registro" }).click();
  await expect(page.getByRole("menuitem", { name: "Editar", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("cell", { name: "205/2026", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
  await page.goto("/records/new?id=foreign");
  await expect(page.getByText("Você não tem permissão para editar este fluxo.")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.goto("/records/new?id=nonexistent");
  await expect(page.getByText("Fluxo não encontrado.")).toBeVisible();
  expect((await getDocs(collection(env.authenticatedContext(uid).firestore(), "records"))).size).toBe(3);
});

test("History and the downloaded Excel share row-specific sources, fallback and existing formatting", async ({ page }, testInfo) => {
  await page.goto("/records");
  await expect(page.getByRole("columnheader", { name: "Fonte de Dados" })).toBeVisible();
  for (const [id, value] of [["204/2026", "RDO-INSTALAÇÃO"], ["205/2026", "IOT"], ["206/2026", "Não informado"]]) {
    const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: id, exact: true }) });
    await expect(row.getByRole("cell", { name: value, exact: true })).toBeVisible();
  }
  await page.getByRole("cell", { name: "206/2026", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Não informado", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar Excel" }).click();
  const download = await downloadPromise;
  const file = testInfo.outputPath("history.xlsx");
  await download.saveAs(file);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.getWorksheet("Registros")!;
  expect(sheet.getRow(6).values).toEqual([undefined, "ID", "Instalação", "Sistema", "Equipamento", "Gerência", "Data", "Status", "Responsável", "FONTE DE DADOS"]);
  expect([7, 8, 9].map(row => [sheet.getCell(row, 1).value, sheet.getCell(row, 9).value])).toEqual([["204/2026", "RDO-INSTALAÇÃO"], ["205/2026", "IOT"], ["206/2026", "Não informado"]]);
  expect(sheet.getCell("I6").fill).toEqual(sheet.getCell("H6").fill);
  expect(sheet.getCell("I7").border).toEqual(sheet.getCell("H7").border);
  expect(sheet.getCell("I7").fill).toEqual(sheet.getCell("H7").fill);
  expect(sheet.getCell("F7").numFmt).toBe("dd/mm/yyyy");
  expect(sheet.getCell("F7").value).toBeInstanceOf(Date);
  expect((sheet.getCell("F7").value as Date).getDate()).toBe(1);
  expect((sheet.getCell("F7").value as Date).getMonth()).toBe(8);
  expect(sheet.getColumn(9).width).toBe(30);
  expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 6 });
  expect(sheet.autoFilter).toBe("A6:I6");
  expect(sheet.getImages()).toHaveLength(2);
  expect(sheet.model.merges).toContain("A1:I3");
  await page.screenshot({ path: testInfo.outputPath("history-desktop.png"), fullPage: true });
});
