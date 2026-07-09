import {
  collection,
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

export const usersCol = () => collection(db, "users").withConverter(userConverter);
export const recordsCol = () => collection(db, "records").withConverter(recordConverter);
export const approvalsCol = () => collection(db, "approvals").withConverter(approvalConverter);
export const formFieldsCol = () => collection(db, "formFields").withConverter(formDefinitionConverter);
export const settingsCol = () => collection(db, "settings");
export const logsCol = () => collection(db, "logs").withConverter(logConverter);
export const emailLogsCol = () => collection(db, "emailLogs").withConverter(emailLogConverter);
