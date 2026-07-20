"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { limit, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  LayoutDashboard,
  FilePlus2,
  History,
  ClipboardCheck,
  Users,
  ListChecks,
  UserCircle,
  Share2,
  ScrollText,
  Mail,
  FileText,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/lib/auth-context";
import { isRouteAllowed, statusLabels, fieldValue } from "@/lib/forms";
import { recordsCol } from "@/lib/firestore-helpers";
import { useSearch } from "@/components/layout/search-context";
import type { AppRecord } from "@/types";

const pages = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Novo Registro", href: "/records/new", icon: FilePlus2 },
  { label: "Histórico", href: "/records", icon: History },
  { label: "Aprovações", href: "/approvals", icon: ClipboardCheck },
  { label: "Enviar por E-mail", href: "/email", icon: Mail },
  { label: "Log de Auditoria", href: "/audit", icon: ScrollText },
  { label: "Usuários", href: "/users", icon: Users },
  { label: "Formulários", href: "/forms", icon: ListChecks },
  { label: "Meu Perfil", href: "/profile", icon: UserCircle },
  { label: "SharePoint", href: "/sharepoint", icon: Share2 },
];

export function CommandPalette() {
  const { open, setOpen } = useSearch();
  const { profile } = useAuth();
  const router = useRouter();
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [term, setTerm] = useState("");

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    const unsub = onSnapshot(
      query(recordsCol(), orderBy("createdAt", "desc"), limit(200)),
      (snap) => setRecords(snap.docs.map((d) => d.data()).filter((r) => r.status !== "rascunho")),
      () => setRecords([])
    );
    return () => unsub();
  }, [open]);

  const visiblePages = useMemo(
    () => pages.filter((p) => isRouteAllowed(profile?.role, p.href)),
    [profile]
  );

  const matchedRecords = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return records
      .filter((r) =>
        [
          r.recordNumber,
          r.authorName,
          fieldValue(r, "instalacao"),
          fieldValue(r, "sistema"),
          fieldValue(r, "equipamento"),
          fieldValue(r, "gerencia"),
          statusLabels[r.status],
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [records, term]);

  function go(href: string) {
    router.push(href);
    setOpen(false);
    setTerm("");
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar páginas e registros..." value={term} onValueChange={setTerm} />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          {visiblePages.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.href} value={`pagina ${item.label}`} onSelect={() => go(item.href)}>
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        {matchedRecords.length > 0 && (
          <CommandGroup heading="Registros">
            {matchedRecords.map((r) => (
              <CommandItem
                key={r.id}
                value={`registro ${r.recordNumber} ${fieldValue(r, "equipamento")} ${r.authorName}`}
                onSelect={() => go(`/records?highlight=${r.id}`)}
              >
                <FileText className="h-4 w-4" />
                <span className="truncate">
                  {r.recordNumber || r.id}
                  <span className="text-muted-foreground">
                    {" · "}
                    {fieldValue(r, "equipamento") || fieldValue(r, "instalacao") || r.authorName || ""}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
