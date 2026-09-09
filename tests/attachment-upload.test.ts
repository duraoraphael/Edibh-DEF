import assert from "node:assert/strict";
import { test, mock, beforeEach } from "node:test";

const journal = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: {
  setItem: (k: string, v: string) => journal.set(k, v),
  removeItem: (k: string) => journal.delete(k),
}, configurable: true });
const calls: string[] = [];
let failure: "upload" | "url" | "cleanup" | undefined;
const user = { uid: "owner", getIdToken: async () => { calls.push("auth"); return "test-token"; } };
mock.module("../src/lib/firebase.ts", { namedExports: { auth: { currentUser: user }, storage: {} } });
mock.module("firebase/storage", { namedExports: {
  ref: (_: unknown, path: string) => ({ path }),
  uploadBytesResumable: (target: { path: string }) => {
    calls.push(`upload:${target.path}`);
    assert.equal(journal.size, 1, "journal must exist before upload starts");
    return {
      on: (_: string, progress: (s: object) => void) => { progress({ bytesTransferred: 1, totalBytes: 1 }); return () => calls.push("unsubscribe"); },
      then: (resolve: () => void, reject: (e: unknown) => void) => failure === "upload" ? reject({ code: "storage/quota-exceeded" }) : resolve(),
      cancel: () => calls.push("cancel"),
    };
  },
  getDownloadURL: async () => { calls.push("url"); if (failure === "url" || failure === "cleanup") throw new Error("url failed"); return "https://firebasestorage.googleapis.com/v0/b/test/o/attachment"; },
  deleteObject: async () => { calls.push("delete"); if (failure === "cleanup") throw new Error("offline"); },
} });
const { uploadAttachment, deleteOwnedAttachment } = await import("../src/lib/attachment-upload.ts");
beforeEach(() => { journal.clear(); calls.length = 0; failure = undefined; });
const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });

test("auth precedes upload; URL follows completion; journal remains until record acknowledgement", async () => {
  const progress: number[] = [];
  const result = await uploadAttachment(file, "owner", "draft", "uuid", p => progress.push(p));
  assert.deepEqual(calls, ["auth", "upload:attachments/owner/draft/uuid.png", "url", "unsubscribe"]);
  assert.deepEqual(progress, [100]);
  assert.equal(result.attachment.path, "attachments/owner/draft/uuid.png");
  assert.equal(journal.size, 1);
});
test("invalid files and mismatched sessions never start an upload", async () => {
  await assert.rejects(uploadAttachment(new File(["bad"], "bad.exe"), "owner", "draft", "uuid", () => {}));
  await assert.rejects(uploadAttachment(file, "other", "draft", "uuid", () => {}));
  assert.deepEqual(calls, []);
});
for (const stage of ["upload", "url"] as const) {
  test(`${stage} failure compensates and clears progress listener`, async () => {
    failure = stage;
    await assert.rejects(uploadAttachment(file, "owner", "draft", "uuid", () => {}));
    assert.ok(calls.includes("delete"));
    assert.equal(calls.at(-1), "unsubscribe");
    assert.equal(journal.size, 0);
  });
}
test("failed cleanup preserves durable recovery intent", async () => {
  failure = "cleanup";
  await assert.rejects(uploadAttachment(file, "owner", "draft", "uuid", () => {}));
  assert.equal(journal.size, 1);
});
test("deletion rejects another user's file and traversal", async () => {
  await assert.rejects(deleteOwnedAttachment("attachments/other/draft/id.png", "owner"));
  await assert.rejects(deleteOwnedAttachment("attachments/owner/../other/id.png", "owner"));
  assert.deepEqual(calls, []);
});
