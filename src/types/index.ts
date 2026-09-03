export type UserRole = "admin" | "gerente" | "tecnico" | "visualizador";

export interface FirestoreTimestampLike {
  seconds: number;
  nanoseconds: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  department?: string;
  /**
   * Approval gate for self-registered accounts. Absent (legacy accounts
   * created before this field existed) is treated as "ativo" by both the
   * Firestore/Storage rules and the UI below — only new signups start at
   * "pendente" and need an admin to flip them to "ativo" before they can
   * read any internal data. "inativo"/"rejeitado" both deny access; they are
   * kept distinct so admins can tell "was active, now disabled" apart from
   * "never approved".
   */
  status?: "pendente" | "ativo" | "inativo" | "rejeitado";
  lastActive?: string | FirestoreTimestampLike;
  lastLogin?: string | FirestoreTimestampLike;
  createdAt?: string;
}

export type RecordStatus =
  | "rascunho"
  | "pendente"
  | "aprovado"
  | "rejeitado"
  | "reajuste"
  | "concluido"
  | "concluido_direto";

export interface AttachmentRef {
  /** Stable unique id, independent of filename (two uploads can share a name, e.g. "IMG_001.jpg"). */
  id: string;
  name: string;
  url: string;
  size?: number;
  contentType?: string;
}

export interface AppRecord {
  id: string;
  recordNumber?: string;
  /** Internal proof that the first number was allocated by the atomic yearly counter. */
  sequenceCounterId?: string;
  sequenceValue?: number;
  description?: string;
  category?: string;
  status: RecordStatus;
  isCase?: boolean;
  authorId: string;
  authorName?: string;
  attachments?: AttachmentRef[];
  formId?: string;
  data?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  importBatchId?: string;
  deletedAt?: string;
  deletedBy?: string;
  deletedByName?: string;
}

export type ApprovalAction = "aprovado" | "rejeitado" | "reajuste";

export interface Approval {
  id: string;
  recordId: string;
  recordNumber?: string;
  /** Denormalized from the parent record's authorId; lets Firestore rules verify ownership without a get(). */
  authorId?: string;
  status: "pendente" | ApprovalAction | "concluido" | "concluido_direto";
  comment?: string;
  reviewerId?: string;
  reviewerName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type FormFieldType =
  | "texto"
  | "numero"
  | "data"
  | "hora"
  | "selecao"
  | "multipla_escolha"
  | "checkbox"
  | "radio"
  | "textarea"
  | "anexo"
  | "email"
  | "telefone";

export interface FormField {
  id: string;
  key: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  mask?: string;
  validation?: string;
  required?: boolean;
  options?: string[];
  order: number;
  dependsOnFieldId?: string;
  optionsByParentValue?: Record<string, string[]>;
}

export interface FormDefinition {
  id: string;
  name: string;
  description?: string;
  fields: FormField[];
  updatedAt?: string;
  createdAt?: string;
}

export interface LogEntry {
  id: string;
  recordId?: string;
  action: string;
  actorId?: string;
  actorName?: string;
  actorRole?: UserRole | string;
  recordNumber?: string;
  statusBefore?: string;
  statusAfter?: string;
  detail?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  createdAt?: string;
}

export type NotificationType =
  | "aprovacao_pendente"
  | "aprovado"
  | "rejeitado"
  | "reajuste"
  | "criado"
  | "geral";

export interface AppNotification {
  id: string;
  actorId?: string;
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  recordId?: string;
  recordNumber?: string;
  href?: string;
  read?: boolean;
  createdAt?: string;
}

export interface EmailRecordLog {
  id: string;
  recordId: string;
  to: string;
  subject: string;
  message: string;
  parameter?: string;
  dataSource?: string;
  senderId?: string;
  senderName?: string;
  createdAt?: string;
}
