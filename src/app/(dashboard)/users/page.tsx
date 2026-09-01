"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, Timestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { usersCol, writeAuditLog } from "@/lib/firestore-helpers";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { roleLabels } from "@/lib/forms";
import type { User, UserRole } from "@/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AccountStatus = NonNullable<User["status"]>;

const accountStatusLabels: Record<AccountStatus, string> = {
  pendente: "Pendente",
  ativo: "Ativo",
  inativo: "Inativo",
  rejeitado: "Rejeitado",
};

function accountStatus(u: User): AccountStatus {
  return u.status || "ativo";
}

function accountStatusVariant(status: AccountStatus): "success" | "warning" | "destructive" | "secondary" {
  if (status === "ativo") return "success";
  if (status === "pendente") return "warning";
  if (status === "rejeitado") return "destructive";
  return "secondary";
}

function formatLastActive(value: User["lastActive"]): string {
  if (!value) return "—";
  const date =
    value instanceof Timestamp
      ? value.toDate()
      : typeof value === "object" && value !== null && "seconds" in value
        ? new Date((value as { seconds: number }).seconds * 1000)
        : new Date(value as string);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

export default function UsersPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");

  useEffect(() => {
    const unsub = onSnapshot(
      usersCol(),
      (snap) => {
        setUsers(snap.docs.map((d) => d.data()));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const pendingCount = useMemo(() => users.filter((u) => accountStatus(u) === "pendente").length, [users]);

  const filtered = useMemo(() => {
    let list = users;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((u) => u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s));
    }
    if (roleFilter !== "todos") {
      list = list.filter((u) => u.role === roleFilter);
    }
    if (statusFilter !== "todos") {
      list = list.filter((u) => accountStatus(u) === statusFilter);
    }
    return list;
  }, [users, search, roleFilter, statusFilter]);

  async function changeRole(userId: string, role: UserRole) {
    if (!isAdmin) {
      toast.error("Apenas administradores podem alterar cargos");
      return;
    }
    const prev = users;
    const target = users.find((x) => x.id === userId);
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, role } : x)));
    try {
      await updateDoc(doc(db, "users", userId), { role });
      await writeAuditLog(
        { uid: profile?.id, name: profile?.name, role: profile?.role },
        {
          action: "Alteração de responsável/perfil de usuário",
          detail: `${target?.name || target?.email || userId}: ${roleLabels[target?.role as UserRole] || target?.role || "—"} → ${roleLabels[role]}`,
          statusBefore: target?.role,
          statusAfter: role,
        }
      );
      toast.success("Função atualizada com sucesso");
    } catch {
      setUsers(prev);
      toast.error("Erro ao atualizar função");
    }
  }

  async function changeStatus(userId: string, status: AccountStatus) {
    if (!isAdmin) {
      toast.error("Apenas administradores podem aprovar ou desativar contas");
      return;
    }
    const prev = users;
    const target = users.find((x) => x.id === userId);
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, status } : x)));
    try {
      await updateDoc(doc(db, "users", userId), { status });
      await writeAuditLog(
        { uid: profile?.id, name: profile?.name, role: profile?.role },
        {
          action: "Alteração de status de conta",
          detail: `${target?.name || target?.email || userId}: ${accountStatusLabels[accountStatus(target || ({} as User))]} → ${accountStatusLabels[status]}`,
          statusBefore: target ? accountStatus(target) : undefined,
          statusAfter: status,
        }
      );
      toast.success(
        status === "ativo" ? "Conta aprovada" : status === "rejeitado" ? "Conta rejeitada" : "Status atualizado"
      );
    } catch {
      setUsers(prev);
      toast.error("Erro ao atualizar status da conta");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie os usuários e permissões do sistema
          {pendingCount > 0 && (
            <>
              {" · "}
              <span className="font-medium text-amber-700">
                {pendingCount} conta{pendingCount === 1 ? "" : "s"} aguardando aprovação
              </span>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(accountStatusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Função" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as funções</SelectItem>
            {Object.entries(roleLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const status = accountStatus(u);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={u.avatarUrl} />
                          <AvatarFallback>{(u.name || "U").charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{u.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Select value={u.role} onValueChange={(v) => changeRole(u.id, v as UserRole)}>
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(roleLabels).map(([k, v]) => (
                              <SelectItem key={k} value={k}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{roleLabels[u.role]}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatLastActive(u.lastActive)}</TableCell>
                    <TableCell>
                      <Badge variant={accountStatusVariant(status)}>{accountStatusLabels[status]}</Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {status === "pendente" ? (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => changeStatus(u.id, "ativo")}>
                              Aprovar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => changeStatus(u.id, "rejeitado")}>
                              Rejeitar
                            </Button>
                          </div>
                        ) : status === "ativo" ? (
                          <Button size="sm" variant="outline" onClick={() => changeStatus(u.id, "inativo")}>
                            Desativar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => changeStatus(u.id, "ativo")}>
                            Reativar
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
