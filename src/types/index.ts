export type UserRole = "admin" | "gerente" | "tecnico" | "visualizador";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  department?: string;
  status?: "ativo" | "inativo";
  lastActive?: string;
  createdAt?: string;
}

export type RecordStatus = "rascunho" | "pendente" | "aprovado" | "rejeitado" | "reajuste";

export interface AttachmentRef {
  name: string;
  url: string;
  size?: number;
  contentType?: string;
}

export interface AppRecord {
  id: string;
  recordNumber?: string;
  description?: string;
  category?: string;
  status: RecordStatus;
  authorId: string;
  authorName?: string;
  attachments?: AttachmentRef[];
  formId?: string;
  data?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export type ApprovalAction = "aprovado" | "rejeitado" | "reajuste";

export interface Approval {
  id: string;
  recordId: string;
  recordNumber?: string;
  status: "pendente" | ApprovalAction;
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
  detail?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  createdAt?: string;
}

export interface EmailRecordLog {
  id: string;
  recordId: string;
  to: string;
  subject: string;
  message: string;
  senderId?: string;
  senderName?: string;
  createdAt?: string;
}
