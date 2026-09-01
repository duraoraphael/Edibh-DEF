import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const PROJECT_ID = "edibh-def-rules-test";

let testEnv: RulesTestEnvironment;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 8180,
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "admin-uid"), { name: "Admin", email: "admin@test.local", role: "admin", status: "ativo" }),
      setDoc(doc(db, "users", "gerente-uid"), { name: "Gerente", email: "gerente@test.local", role: "gerente", status: "ativo" }),
      setDoc(doc(db, "users", "tecnico-uid"), { name: "Tecnico 1", email: "tecnico1@test.local", role: "tecnico", status: "ativo" }),
      setDoc(doc(db, "users", "tecnico2-uid"), { name: "Tecnico 2", email: "tecnico2@test.local", role: "tecnico", status: "ativo" }),
      setDoc(doc(db, "users", "visualizador-uid"), { name: "Visualizador", email: "visu@test.local", role: "visualizador", status: "ativo" }),
      // Fresh self-signup: no admin has reviewed this account yet.
      setDoc(doc(db, "users", "pending-uid"), { name: "Pendente", email: "pendente@test.local", role: "visualizador", status: "pendente" }),
      setDoc(doc(db, "users", "rejected-uid"), { name: "Rejeitado", email: "rejeitado@test.local", role: "visualizador", status: "rejeitado" }),
      // Pre-existing account created before the `status` field existed —
      // must still work exactly like an approved account (grandfathered).
      setDoc(doc(db, "users", "legacy-uid"), { name: "Legado", email: "legado@test.local", role: "tecnico" }),

      setDoc(doc(db, "records", "rec-pendente"), {
        authorId: "tecnico-uid", authorName: "Tecnico 1", status: "pendente", data: { instalacao: "A" },
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      setDoc(doc(db, "records", "rec-rascunho"), {
        authorId: "tecnico-uid", authorName: "Tecnico 1", status: "rascunho", data: {},
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      setDoc(doc(db, "records", "rec-reajuste"), {
        authorId: "tecnico-uid", authorName: "Tecnico 1", status: "reajuste", data: { instalacao: "A" },
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      setDoc(doc(db, "records", "rec-tecnico2"), {
        authorId: "tecnico2-uid", authorName: "Tecnico 2", status: "pendente", data: {},
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      }),

      setDoc(doc(db, "approvals", "rec-pendente"), {
        recordId: "rec-pendente", recordNumber: "001/2026", authorId: "tecnico-uid", status: "pendente",
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      setDoc(doc(db, "approvals", "rec-reajuste"), {
        recordId: "rec-reajuste", recordNumber: "003/2026", authorId: "tecnico-uid", status: "reajuste",
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      }),

      setDoc(doc(db, "logs", "log1"), {
        action: "Criado", actorId: "tecnico-uid", actorName: "Tecnico 1", actorRole: "tecnico",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);
  });
});

function ctx(uid: string | null, claims?: Record<string, unknown>) {
  return uid ? testEnv.authenticatedContext(uid, claims).firestore() : testEnv.unauthenticatedContext().firestore();
}

// ---------- F1: approval gate ----------

test("F1: unauthenticated user cannot read records", async () => {
  await assertFails(getDoc(doc(ctx(null), "records", "rec-pendente")));
});

test("F1: a freshly self-registered (pending) user cannot read records", async () => {
  await assertFails(getDoc(doc(ctx("pending-uid"), "records", "rec-pendente")));
});

test("F1: a pending user cannot read logs", async () => {
  await assertFails(getDoc(doc(ctx("pending-uid"), "logs", "log1")));
});

test("F1: a pending user cannot read approvals", async () => {
  await assertFails(getDoc(doc(ctx("pending-uid"), "approvals", "rec-pendente")));
});

test("F1: a pending user cannot list or read other users' profiles", async () => {
  const db = ctx("pending-uid");
  await assertFails(getDocs(collection(db, "users")));
  await assertFails(getDoc(doc(db, "users", "admin-uid")));
});

test("F1: a pending user CAN still read their own profile (sees their own pending status)", async () => {
  await assertSucceeds(getDoc(doc(ctx("pending-uid"), "users", "pending-uid")));
});

test("F1: a rejected/deactivated account is denied exactly like a pending one", async () => {
  await assertFails(getDoc(doc(ctx("rejected-uid"), "records", "rec-pendente")));
});

test("F1: a legacy account with no `status` field is grandfathered in as approved", async () => {
  await assertSucceeds(getDoc(doc(ctx("legacy-uid"), "records", "rec-pendente")));
});

test("F1: an approved user can read the content their role permits", async () => {
  await assertSucceeds(getDocs(collection(ctx("tecnico-uid"), "records")));
  await assertSucceeds(getDoc(doc(ctx("visualizador-uid"), "records", "rec-pendente")));
});

// ---------- F1 mass-assignment on self-signup ----------

test("F1: self-signup cannot set role or status to anything but visualizador/pendente", async () => {
  const db = ctx("new-user-uid", { email: "novo@test.local" });
  await assertFails(setDoc(doc(db, "users", "new-user-uid"), {
    name: "Novo", email: "novo@test.local", role: "admin", status: "pendente",
  }));
  await assertFails(setDoc(doc(db, "users", "new-user-uid"), {
    name: "Novo", email: "novo@test.local", role: "visualizador", status: "ativo",
  }));
  await assertSucceeds(setDoc(doc(db, "users", "new-user-uid"), {
    name: "Novo", email: "novo@test.local", role: "visualizador", status: "pendente",
  }));
});

// ---------- RBAC / F2 ----------

test("RBAC: visualizador cannot create a record", async () => {
  await assertFails(setDoc(doc(ctx("visualizador-uid"), "records", "new-rec"), {
    authorId: "visualizador-uid", status: "rascunho", data: {},
  }));
});

test("RBAC: tecnico cannot alter a record authored by another tecnico", async () => {
  await assertFails(updateDoc(doc(ctx("tecnico-uid"), "records", "rec-tecnico2"), { data: { instalacao: "hack" } }));
});

test("RBAC: tecnico can edit permitted fields of their own record without touching status", async () => {
  await assertSucceeds(updateDoc(doc(ctx("tecnico-uid"), "records", "rec-pendente"), {
    data: { instalacao: "B" },
    updatedAt: "2026-01-02T00:00:00.000Z",
  }));
});

test("F2: tecnico cannot self-approve their own record", async () => {
  await assertFails(updateDoc(doc(ctx("tecnico-uid"), "records", "rec-pendente"), {
    status: "aprovado",
    updatedAt: "2026-01-02T00:00:00.000Z",
  }));
});

test("F2: tecnico cannot self-reject their own record", async () => {
  await assertFails(updateDoc(doc(ctx("tecnico-uid"), "records", "rec-pendente"), {
    status: "rejeitado",
    updatedAt: "2026-01-02T00:00:00.000Z",
  }));
});

test("F2: tecnico cannot forge the approvals doc to 'aprovado' either (direct SDK bypass of the UI)", async () => {
  await assertFails(updateDoc(doc(ctx("tecnico-uid"), "approvals", "rec-pendente"), {
    status: "aprovado", reviewerId: "tecnico-uid", updatedAt: "2026-01-02T00:00:00.000Z",
  }));
});

test("F2: tecnico cannot self-trigger 'reajuste' on their own pendente record (admin/gerente-only decision)", async () => {
  await assertFails(updateDoc(doc(ctx("tecnico-uid"), "records", "rec-pendente"), {
    status: "reajuste",
    updatedAt: "2026-01-02T00:00:00.000Z",
  }));
});

test("F2: gerente can approve a pending record (record + approval together)", async () => {
  const db = ctx("gerente-uid");
  const batch = writeBatch(db);
  batch.update(doc(db, "records", "rec-pendente"), { status: "aprovado", updatedAt: "2026-01-02T00:00:00.000Z" });
  batch.update(doc(db, "approvals", "rec-pendente"), {
    status: "aprovado", reviewerId: "gerente-uid", reviewerName: "Gerente", updatedAt: "2026-01-02T00:00:00.000Z",
  });
  await assertSucceeds(batch.commit());
});

test("F2: admin can reject a pending record", async () => {
  const db = ctx("admin-uid");
  const batch = writeBatch(db);
  batch.update(doc(db, "records", "rec-pendente"), { status: "rejeitado", updatedAt: "2026-01-02T00:00:00.000Z" });
  batch.update(doc(db, "approvals", "rec-pendente"), {
    status: "rejeitado", reviewerId: "admin-uid", reviewerName: "Admin", updatedAt: "2026-01-02T00:00:00.000Z",
  });
  await assertSucceeds(batch.commit());
});

test("F2: tecnico CAN resubmit their own record from 'reajuste' back to 'pendente'", async () => {
  const db = ctx("tecnico-uid");
  await assertSucceeds(updateDoc(doc(db, "records", "rec-reajuste"), {
    status: "pendente", data: { instalacao: "corrigido" }, updatedAt: "2026-01-03T00:00:00.000Z",
  }));
  // saveRecordWithFixedNumber() replaces the whole approvals doc (set
  // without merge) — since it already exists (created on first submission),
  // this is an *update* for rules purposes, exactly the regression this
  // covers.
  await assertSucceeds(setDoc(doc(db, "approvals", "rec-reajuste"), {
    recordId: "rec-reajuste", recordNumber: "003/2026", authorId: "tecnico-uid", status: "pendente",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z",
  }));
});

test("RBAC: a user cannot change their own role", async () => {
  await assertFails(updateDoc(doc(ctx("tecnico-uid"), "users", "tecnico-uid"), { role: "admin" }));
});

test("RBAC: a user cannot self-approve their own account's status", async () => {
  await assertFails(updateDoc(doc(ctx("pending-uid"), "users", "pending-uid"), { status: "ativo" }));
});

test("RBAC: admin CAN approve a pending account", async () => {
  await assertSucceeds(updateDoc(doc(ctx("admin-uid"), "users", "pending-uid"), { status: "ativo" }));
});
