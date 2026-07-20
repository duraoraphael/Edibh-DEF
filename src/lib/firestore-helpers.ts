import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  QueryDocumentSnapshot,
  SnapshotOptions,
  FirestoreDataConverter,
  DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  User,
  AppRecord,
  Approval,
  AppNotification,
  FormDefinition,
  LogEntry,
  EmailRecordLog,
} from "@/types";

function makeConverter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(data: T): DocumentData {
      const { id, ...rest } = data as T & { id: string };
      void id;
      return rest;
    },
    fromFirestore(
      snapshot: QueryDocumentSnapshot,
      options: SnapshotOptions
    ): T {
      const data = snapshot.data(options);
      return { id: snapshot.id, ...data } as T;
    },
  };
}

export const userConverter = makeConverter<User>();
export const recordConverter = makeConverter<AppRecord>();
export const approvalConverter = makeConverter<Approval>();
export const formDefinitionConverter = makeConverter<FormDefinition>();
export const logConverter = makeConverter<LogEntry>();
export const emailLogConverter = makeConverter<EmailRecordLog>();
export const notificationConverter = makeConverter<AppNotification>();

export const usersCol = () => collection(db, "users").withConverter(userConverter);
export const recordsCol = () => collection(db, "records").withConverter(recordConverter);
export const approvalsCol = () => collection(db, "approvals").withConverter(approvalConverter);
export const formFieldsCol = () => collection(db, "formFields").withConverter(formDefinitionConverter);
export const settingsCol = () => collection(db, "settings");
export const logsCol = () => collection(db, "logs").withConverter(logConverter);
export const emailLogsCol = () => collection(db, "emailLogs").withConverter(emailLogConverter);
export const notificationsCol = () => collection(db, "notifications").withConverter(notificationConverter);

/** Return the uids of every user whose role is in `roles` (e.g. approvers). */
export async function getUserIdsByRoles(roles: string[]): Promise<string[]> {
  try {
    const snap = await getDocs(query(usersCol(), where("role", "in", roles)));
    return snap.docs.map((d) => d.id);
  } catch {
    return [];
  }
}

/**
 * Fan-out a notification to a set of recipients. Strips `undefined` fields so
 * Firestore accepts the write, and skips silently on failure so notification
 * delivery never blocks the primary action that triggered it.
 */
export async function createNotifications(
  userIds: string[],
  data: Omit<AppNotification, "id" | "userId" | "createdAt" | "read">
): Promise<void> {
  const targets = Array.from(new Set(userIds.filter(Boolean)));
  await Promise.all(
    targets.map(async (userId) => {
      const payload = {
        id: "",
        userId,
        read: false,
        createdAt: new Date().toISOString(),
        ...data,
      };
      const clean = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== undefined)
      ) as unknown as AppNotification;
      try {
        await addDoc(notificationsCol(), clean);
      } catch {
        // notification delivery is best-effort
      }
    })
  );
}

/** Actor identity used to attribute audit-log entries. */
export interface AuditActor {
  uid?: string;
  name?: string;
  role?: string;
}

/**
 * Append-only audit-log write. Centralizes the shape of every audit entry so
 * all events (create/edit/approve/delete/restore/status/login/...) record the
 * same fields: actor, actor role, timestamp, action, affected record, flow
 * number, status before/after and optional observations.
 */
export async function writeAuditLog(
  actor: AuditActor,
  entry: {
    action: string;
    recordId?: string;
    recordNumber?: string;
    statusBefore?: string;
    statusAfter?: string;
    detail?: string;
  }
): Promise<void> {
  const payload: Omit<LogEntry, "id"> & { id: string } = {
    id: "",
    action: entry.action,
    recordId: entry.recordId ?? "",
    recordNumber: entry.recordNumber,
    statusBefore: entry.statusBefore,
    statusAfter: entry.statusAfter,
    actorId: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    detail: entry.detail,
    createdAt: new Date().toISOString(),
  };
  // Firestore rejects `undefined`; strip optional fields that weren't provided.
  const clean = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined)
  ) as unknown as LogEntry;
  await addDoc(logsCol(), clean);
}
