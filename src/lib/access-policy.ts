import type { User } from "@/types";

export function isApprovedProfile(profile: Pick<User, "status"> | null): boolean {
  return profile !== null && (profile.status === undefined || profile.status === "ativo");
}

export function canSubmitRecord(profile: Pick<User, "role" | "status"> | null): boolean {
  return isApprovedProfile(profile) && ["admin", "gerente", "tecnico"].includes(profile?.role || "");
}

export function isUsableProfile(profile: User | null, uid: string, email?: string | null): boolean {
  return !!profile && profile.id === uid && (!profile.uid || profile.uid === uid)
    && !!profile.name?.trim() && !!profile.email
    && (!email || profile.email.trim().toLowerCase() === email.trim().toLowerCase())
    && ["admin", "gerente", "tecnico", "visualizador"].includes(profile.role);
}
