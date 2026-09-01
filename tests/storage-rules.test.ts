import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { setDoc, doc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const PROJECT_ID = "edibh-def-storage-rules-test";

let testEnv: RulesTestEnvironment;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: "rules_version = '2'; service cloud.firestore { match /databases/{db}/documents { match /{document=**} { allow read, write: if true; } } }",
      host: "127.0.0.1",
      port: 8180,
    },
    storage: {
      rules: readFileSync(new URL("../storage.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 9299,
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  // Storage rules read role/status via firestore.get(), so seed with an
  // intentionally wide-open Firestore ruleset above (this file only tests
  // storage.rules, not firestore.rules — those have their own suite).
  const db = testEnv.unauthenticatedContext().firestore();
  await Promise.all([
    setDoc(doc(db, "users", "owner-uid"), { role: "tecnico", status: "ativo" }),
    setDoc(doc(db, "users", "admin-uid"), { role: "admin", status: "ativo" }),
    setDoc(doc(db, "users", "pending-admin-uid"), { role: "admin", status: "pendente" }),
    setDoc(doc(db, "users", "other-tecnico-uid"), { role: "tecnico", status: "ativo" }),
  ]);
});

const tinyPng = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

test("owner can upload and read their own attachment", async () => {
  const storage = testEnv.authenticatedContext("owner-uid").storage();
  const fileRef = ref(storage, "attachments/owner-uid/rec1/photo.png");
  await assertSucceeds(uploadBytes(fileRef, tinyPng, { contentType: "image/png" }));
  await assertSucceeds(getBytes(fileRef));
});

test("upload is rejected for a disallowed content type", async () => {
  const storage = testEnv.authenticatedContext("owner-uid").storage();
  const fileRef = ref(storage, "attachments/owner-uid/rec1/script.exe");
  await assertFails(uploadBytes(fileRef, tinyPng, { contentType: "application/x-msdownload" }));
});

test("a non-owner, non-privileged user cannot read someone else's attachment", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), "attachments/owner-uid/rec1/photo.png"), tinyPng, { contentType: "image/png" });
  });
  const otherStorage = testEnv.authenticatedContext("other-tecnico-uid").storage();
  await assertFails(getBytes(ref(otherStorage, "attachments/owner-uid/rec1/photo.png")));
});

test("an approved admin CAN read another user's attachment", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), "attachments/owner-uid/rec1/photo.png"), tinyPng, { contentType: "image/png" });
  });
  const adminStorage = testEnv.authenticatedContext("admin-uid").storage();
  await assertSucceeds(getBytes(ref(adminStorage, "attachments/owner-uid/rec1/photo.png")));
});

test("F1: a pending (unapproved) admin account cannot use its role to read another user's attachment", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), "attachments/owner-uid/rec1/photo.png"), tinyPng, { contentType: "image/png" });
  });
  const pendingAdminStorage = testEnv.authenticatedContext("pending-admin-uid").storage();
  await assertFails(getBytes(ref(pendingAdminStorage, "attachments/owner-uid/rec1/photo.png")));
});

test("an unauthenticated request cannot read or write any attachment", async () => {
  const anon = testEnv.unauthenticatedContext().storage();
  await assertFails(uploadBytes(ref(anon, "attachments/owner-uid/rec1/photo.png"), tinyPng, { contentType: "image/png" }));
  await assertFails(getBytes(ref(anon, "attachments/owner-uid/rec1/photo.png")));
});
