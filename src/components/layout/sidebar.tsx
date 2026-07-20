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
  Menu,
  Mail,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { isRouteAllowed } from "@/lib/forms";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: null },
  { label: "Novo Registro", href: "/records/new", icon: FilePlus2, roles: null },
  { label: "Histórico", href: "/records", icon: History, roles: null },
  { label: "Aprovações", href: "/approvals", icon: ClipboardCheck, roles: ["admin", "gerente"] },
  { label: "Enviar por E-mail", href: "/email", icon: Mail, roles: null },
  { label: "Log de Auditoria", href: "/audit", icon: ScrollText, roles: null },
  { label: "Usuários", href: "/users", icon: Users, roles: ["admin"] },
  { label: "Formulários", href: "/forms", icon: ListChecks, roles: ["admin", "gerente"] },
  { label: "Meu Perfil", href: "/profile", icon: UserCircle, roles: null },
  { label: "SharePoint", href: "/sharepoint", icon: Share2, roles: ["admin"] },
] as const;

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { signOut, profile } = useAuth();
  const visibleNavItems = navItems.filter(
    (item) =>
      (!item.roles || (profile && (item.roles as readonly string[]).includes(profile.role))) &&
      isRouteAllowed(profile?.role, item.href)
  );

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl  text-white">
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

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {visibleNavItems.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/15 text-white"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-1 hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white md:flex"
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
