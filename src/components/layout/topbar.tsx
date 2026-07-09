"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Bell, Search, LogOut, UserCircle, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { roleLabels } from "@/lib/forms";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Topbar() {
  const { profile, signOut } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex h-18 items-center gap-4 bg-primary px-6 text-white shadow-sm">
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <Image
          src="/Normatel Engenharia_BRANCO.svg"
          alt="Normatel Engenharia"
          width={160}
          height={42}
          className="h-10 w-auto shrink-0 object-contain"
          priority
        />
        <span className="h-9 w-px shrink-0 bg-white/30" aria-hidden />
        <Image
          src="/Principal_h_cor_RGB (1).svg"
          alt="Petrobras"
          width={130}
          height={42}
          className="h-10 w-auto shrink-0 object-contain"
          priority
        />
        <span className="hidden truncate border-l border-white/30 pl-3 text-base font-semibold tracking-tight lg:block">
          Fluxo de Equipamento Crítico
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center px-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
          <input
            placeholder="Buscar... (Ctrl+K)"
            className="h-10 w-full rounded-lg border border-white/20 bg-white/10 pl-9 pr-3 text-sm text-white placeholder:text-white/70 outline-none transition-colors focus:border-white/40 focus:ring-2 focus:ring-white/25"
            onFocus={(e) => e.currentTarget.blur()}
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
            readOnly
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button className="relative flex h-10 w-10 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/10 hover:text-white">
          <Bell className="h-5 w-5" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-white/10">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatarUrl} />
              <AvatarFallback>{(profile?.name || "U").charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-none text-white">{profile?.name || "Usuário"}</p>
              <p className="text-xs text-white/70">{profile ? roleLabels[profile.role] : ""}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/profile")}>
              <UserCircle className="h-4 w-4" />
              Meu Perfil
            </DropdownMenuItem>
            {profile?.role === "admin" && (
              <DropdownMenuItem onClick={() => router.push("/sharepoint")}>
                <Settings className="h-4 w-4" />
                Configurações
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
