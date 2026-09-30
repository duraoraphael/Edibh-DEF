import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRecordDataSource, recordDataSources } from "../src/lib/data-source.ts";
import { canEditRecord } from "../src/lib/access-policy.ts";
import { buildDistributionData } from "../src/lib/dashboard-distributions.ts";
import type { AppRecord, FormField } from "../src/types/index.ts";

const field: FormField = { id: "source", key: "tipos_de_dados_9", label: "Fonte de Dados", type: "selecao", required: true, order: 10 };

test("real configured key and legacy values share the same display normalization", () => {
  for (const [raw, expected] of [["RDO", "RDO-INSTALAÇÃO"], ["RDO - Instalação", "RDO-INSTALAÇÃO"], ["SUPERVISORIO-IOT", "IOT"], ["SUPERVISÓRIO-IOT", "IOT"], ["SUPERVISORIO IOT", "IOT"], ["SUPERVISÓRIO IOT", "IOT"], ["Supervisório - BMS", "Supervisório - BMS"]]) {
    assert.equal(formatRecordDataSource({ data: { tipos_de_dados_9: raw } }, [field]), expected);
    assert.equal(formatRecordDataSource({ data: { tipos_de_dados_9: raw } }), expected);
  }
});

test("missing, malformed and old blank values never leak object/undefined/null strings", () => {
  for (const raw of [undefined, null, "", "  ", "-", "—", "undefined", "null", "[object Object]", {}, 42, false, [null, {}]]) {
    assert.equal(formatRecordDataSource({ data: { tipos_de_dados_9: raw } }, [field]), "Não informado");
  }
  assert.equal(formatRecordDataSource({}), "Não informado");
});

test("custom configured key, legacy keys and multiple selections remain supported", () => {
  assert.equal(formatRecordDataSource({ data: { arbitrary_key: "RDO" } }, [{ ...field, key: "arbitrary_key" }]), "RDO-INSTALAÇÃO");
  for (const key of ["fonteDados", "fonte_de_dados", "fonteDeDados", "fonte_dados"]) {
    assert.equal(formatRecordDataSource({ data: { [key]: "SUPERVISORIO IOT" } }, [field]), "IOT");
  }
  assert.deepEqual(recordDataSources({ data: { tipos_de_dados_9: ["IOT", "SUPERVISÓRIO IOT", "RDO", {}] } }, [field]), ["IOT", "RDO-INSTALAÇÃO"]);
});

test("dashboard continues to use the real source and macro field definitions", () => {
  const record: AppRecord = { id: "1", authorId: "u", status: "pendente", data: { tipos_de_dados_9: "RDO", sistemas_macro_11: "Climatização" } };
  assert.equal(buildDistributionData([record], "fonteDados", [field])[0].name, "RDO-INSTALAÇÃO");
  assert.equal(buildDistributionData([record], "sistemaMacro", [{ ...field, key: "sistemas_macro_11", label: "Sistemas MACRO" }])[0].name, "Climatização");
});

test("edit permission uses authenticated UID and approved role, never a display name", () => {
  const record = { authorId: "tech-a" };
  assert.equal(canEditRecord({ role: "tecnico", status: "ativo" }, "tech-a", record), true);
  assert.equal(canEditRecord({ role: "tecnico", status: "ativo" }, "tech-b", record), false);
  assert.equal(canEditRecord({ role: "tecnico", status: "pendente" }, "tech-a", record), false);
  assert.equal(canEditRecord({ role: "tecnico", approved: false }, "tech-a", record), false);
  assert.equal(canEditRecord({ role: "visualizador", status: "ativo" }, "tech-a", record), false);
  for (const role of ["admin", "gerente"] as const) assert.equal(canEditRecord({ role }, "manager", record), true);
  assert.equal(canEditRecord(null, "tech-a", record), false);
  assert.equal(canEditRecord({ role: "admin" }, undefined, record), false);
});
