import { getDownloadURL, ref, uploadBytesResumable, deleteObject } from "firebase/storage";
import { auth, storage } from "@/lib/firebase";
import { attachmentPath, validateAttachment, withDeadline } from "@/lib/upload-policy";

export async function uploadAttachment(file: File, uid: string, recordId: string, id: string, onProgress: (progress: number) => void) {
  const extension = validateAttachment(file);
  if (auth.currentUser?.uid !== uid) throw Object.assign(new Error("Faça login novamente."), { code: "unauthenticated" });
  await withDeadline(auth.currentUser.getIdToken());
  const path = attachmentPath(uid, recordId, id, extension);
  const object = ref(storage, path);
  // Persist intent before the network request. A crash/ambiguous network failure
  // leaves a recoverable path, never an untracked object or an unsafe URL.
  const recoveryKey = `edibh_upload_${uid}_${id}`;
  localStorage.setItem(recoveryKey, JSON.stringify({ path, recordId, id, name: file.name }));
  const task = uploadBytesResumable(object, file, { contentType: file.type });
  const unsubscribe = task.on("state_changed", snap => onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)));
  try {
    await withDeadline(new Promise<void>((resolve, reject) => task.then(() => resolve(), reject)), 120_000);
    const url = await withDeadline(getDownloadURL(object));
    return { attachment: { id, name: file.name, url, path, size: file.size, contentType: file.type }, recoveryKey };
  } catch (error) {
    task.cancel();
    // The unique path belongs to this attempt only. Keep the journal if cleanup
    // cannot be confirmed; never touch another user's or an existing attachment.
    try { await withDeadline(deleteObject(object)); localStorage.removeItem(recoveryKey); }
    catch (cleanupError) {
      if ((cleanupError as { code?: string }).code === "storage/object-not-found") localStorage.removeItem(recoveryKey);
    }
    throw error;
  } finally { unsubscribe(); }
}

export async function deleteOwnedAttachment(path: string, uid: string) {
  if (auth.currentUser?.uid !== uid || !path.startsWith(`attachments/${uid}/`) || path.includes("..")) {
    throw new Error("Você não tem permissão para excluir este arquivo.");
  }
  try { await withDeadline(deleteObject(ref(storage, path))); }
  catch (error) { if ((error as { code?: string }).code !== "storage/object-not-found") throw error; }
}
