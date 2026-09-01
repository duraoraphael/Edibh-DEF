"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
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
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Menu,
  Mail,
  X,
  FolderKanban,
  BriefcaseBusiness,
  ShieldCheck,
  Plug,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { isRouteAllowed } from "@/lib/forms";
import { Tooltip } from "@/components/ui/tooltip";

type NavLeaf = { label: string; href: string; icon: typeof LayoutDashboard; roles: readonly string[] | null };
type NavGroup = { label: string; icon: typeof LayoutDashboard; items: NavLeaf[] };

const groups: NavGroup[] = [
  {
    label: "Registros",
    icon: FolderKanban,
    items: [
      { label: "Novo Registro", href: "/records/new", icon: FilePlus2, roles: null },
      { label: "Histórico", href: "/records", icon: History, roles: null },
      { label: "Cases", href: "/cases", icon: BriefcaseBusiness, roles: null },
      { label: "Aprovações", href: "/approvals", icon: ClipboardCheck, roles: ["admin", "gerente"] },
      { label: "Enviar por E-mail", href: "/email", icon: Mail, roles: null },
    ],
  },
  {
    label: "Administração",
    icon: ShieldCheck,
    items: [
      { label: "Usuários", href: "/users", icon: Users, roles: ["admin"] },
      { label: "Formulários", href: "/forms", icon: ListChecks, roles: ["admin", "gerente"] },
      { label: "Log de Auditoria", href: "/audit", icon: ScrollText, roles: null },
    ],
  },
  {
    label: "Integrações",
    icon: Plug,
    // Kept in sync with allowedRoutesByRole (forms.ts) and the "settings"
    // write rule (firestore.rules), both of which already allow gerente —
    // hiding the link only from gerente here would contradict what the
    // route guard and Firestore rules actually permit.
    items: [{ label: "SharePoint", href: "/sharepoint", icon: Share2, roles: ["admin", "gerente"] }],
  },
  {
    label: "Conta",
    icon: User,
    items: [{ label: "Meu Perfil", href: "/profile", icon: UserCircle, roles: null }],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { signOut, profile } = useAuth();

  const allowed = (item: NavLeaf) =>
    (!item.roles || (profile && item.roles.includes(profile.role))) && isRouteAllowed(profile?.role, item.href);

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
    .filter((g) => g.items.length > 0);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    groups.forEach((g) => {
      initial[g.label] = g.items.some(
        (item) => pathname === item.href || pathname?.startsWith(item.href + "/")
      );
    });
    return initial;
  });

  function toggleGroup(label: string) {
    setOpenGroups((s) => ({ ...s, [label]: !s[label] }));
  }

  const dashboardActive = pathname === "/dashboard";

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
          <Image
            src="/Simbolo eng.svg"
            alt="Simbolo Normatel"
            width={36}
            height={36}
            className="h-full w-full object-contain"
          />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden whitespace-nowrap text-base font-semibold tracking-tight text-white"
            >
              Fluxo de Equipamentos
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {collapsed ? (
          <Tooltip label="Dashboard">
            <Link
              href="/dashboard"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex w-full items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                dashboardActive ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
              )}
            >
              <LayoutDashboard className="h-5 w-5 shrink-0" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              dashboardActive ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
            )}
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            <span>Dashboard</span>
          </Link>
        )}

        <div className="my-2 border-t border-white/10" />

        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const groupActive = group.items.some(
            (item) => pathname === item.href || pathname?.startsWith(item.href + "/")
          );
          const isOpen = !!openGroups[group.label];

          if (collapsed) {
            return (
              <div key={group.label} className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Tooltip key={item.href} label={item.label}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex w-full items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          active ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                      </Link>
                    </Tooltip>
                  );
                })}
              </div>
            );
          }

          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide transition-colors",
                  groupActive ? "text-white" : "text-white/60 hover:text-white"
                )}
              >
                <GroupIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{group.label}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-1 py-1 pl-3">
                      {group.items.map((item) => {
                        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                              active
                                ? "bg-white/15 text-white"
                                : "text-white/75 hover:bg-white/10 hover:text-white"
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="overflow-hidden whitespace-nowrap">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        {collapsed ? (
          <Tooltip label="Sair">
            <button
              onClick={() => signOut()}
              className="flex w-full items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-5 w-5 shrink-0" />
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>Sair</span>
          </button>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-1 hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white md:flex md:justify-center"
        >
          {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
          {!collapsed && <span>Recolher</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-sm md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <motion.aside
        animate={{ width: collapsed ? 76 : 264 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="sticky top-0 hidden h-screen shrink-0 bg-primary-700 md:flex"
      >
        {content}
      </motion.aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="fixed left-0 top-0 z-50 h-screen w-[264px] bg-primary-700 md:hidden"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
