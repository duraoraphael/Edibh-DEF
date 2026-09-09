import assert from "node:assert/strict";
import { test } from "node:test";
import { attachmentPath, validateAttachment, MAX_ATTACHMENT_BYTES, withDeadline, isDefiniteWriteFailure, ownedAttachmentPathFromUrl } from "../src/lib/upload-policy.ts";

for (const [name, type] of [["photo.JPG", "image/jpeg"], ["photo.png", "image/png"], ["photo.webp", "image/webp"], ["report.pdf", "application/pdf"]]) {
  test(`accepts ${name}`, () => assert.ok(validateAttachment({ name, type, size: 100 })));
}
test("rejects disguised files, empty and oversized files", () => {
  for (const file of [
    { name: "file.exe", type: "image/png", size: 1 },
    { name: "file.png", type: "text/html", size: 1 },
    { name: "file.svg", type: "image/svg+xml", size: 1 },
    { name: "file.png", type: "image/png", size: 0 },
    { name: "file.png", type: "image/png", size: MAX_ATTACHMENT_BYTES },
    { name: "file.png", type: "image/png", size: MAX_ATTACHMENT_BYTES + 1 },
  ]) assert.throws(() => validateAttachment(file));
});
test("paths cannot include traversal or user supplied filenames", () => {
  assert.equal(attachmentPath("user", "draft", "uuid", "png"), "attachments/user/draft/uuid.png");
  for (const part of ["../other", "a/b", "a\\b", "a%2fb", "", "a.png"]) {
    assert.throws(() => attachmentPath("user", part, "uuid", "png"));
  }
});
test("bounded wait rejects without pretending to cancel an ambiguous commit", async () => {
  let commit!: (value: string) => void;
  const operation = new Promise<string>(resolve => { commit = resolve; });
  await assert.rejects(withDeadline(operation, 5), { code: "app/deadline-exceeded" });
  commit("committed");
  assert.equal(await operation, "committed");
  assert.equal(isDefiniteWriteFailure({ code: "app/deadline-exceeded" }), false);
  assert.equal(isDefiniteWriteFailure({ code: "unavailable" }), false);
  assert.equal(isDefiniteWriteFailure({ code: "permission-denied" }), true);
});
test("upload/Firestore rejection propagates and successful wait resolves", async () => {
  await assert.rejects(withDeadline(Promise.reject(new Error("Storage 402")), 100), /Storage 402/);
  assert.equal(await withDeadline(Promise.resolve("saved"), 100), "saved");
});

test("legacy cleanup URLs must match exact bucket and authenticated owner", () => {
  const url = "https://firebasestorage.googleapis.com/v0/b/bucket/o/attachments%2Fowner%2Fdraft%2Fphoto.png?alt=media";
  assert.equal(ownedAttachmentPathFromUrl(url, "bucket", "owner"), "attachments/owner/draft/photo.png");
  assert.equal(ownedAttachmentPathFromUrl(url, "other-bucket", "owner"), null);
  assert.equal(ownedAttachmentPathFromUrl(url, "bucket", "other-owner"), null);
  assert.equal(ownedAttachmentPathFromUrl("blob:local", "bucket", "owner"), null);
});
