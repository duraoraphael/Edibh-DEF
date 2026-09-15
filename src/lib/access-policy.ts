import type { User, UserRole } from "@/types";

const roles: UserRole[] = ["admin", "gerente", "tecnico", "visualizador"];
const statuses = ["pendente", "ativo", "inativo", "rejeitado"] as const;

export function accountStatus(profile: Pick<User, "status" | "approved">): NonNullable<User["status"]> {
  if (profile.status && statuses.includes(profile.status)) return profile.status;
  if (typeof profile.approved === "boolean") return profile.approved ? "ativo" : "pendente";
  return "ativo";
}

export function isApprovedProfile(profile: Pick<User, "status" | "approved"> | null): boolean {
  return profile !== null && accountStatus(profile) === "ativo";
}

export function canSubmitRecord(profile: Pick<User, "role" | "status"> | null): boolean {
  return isApprovedProfile(profile) && ["admin", "gerente", "tecnico"].includes(profile?.role || "");
}

export function isUsableProfile(profile: User | null, uid: string, email?: string | null): boolean {
  return !!profile && profile.id === uid && (!profile.uid || profile.uid === uid)
    && !!profile.name?.trim() && !!profile.email
    && (!email || profile.email.trim().toLowerCase() === email.trim().toLowerCase())
    && roles.includes(profile.role);
}

export function normalizeUserProfile(
  data: Partial<User>, uid: string, authEmail?: string | null, displayName?: string | null,
): User {
  const email = (authEmail || data.email || "").trim().toLowerCase();
  const name = data.name?.trim() || displayName?.trim() || email.split("@")[0] || "Usuário";
  const role = roles.includes(data.role as UserRole) ? data.role as UserRole : "visualizador";
  const status = accountStatus(data);
  return { ...data, id: uid, uid, name, email, role, status, approved: status === "ativo" };
}
