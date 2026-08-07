"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, LogOut, UserCircle, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { roleLabels } from "@/lib/forms";
import { useSearch } from "@/components/layout/search-context";
import { NotificationBell } from "@/components/layout/notification-bell";
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
  const { openSearch } = useSearch();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-black/5 bg-primary pl-16 pr-3 text-white shadow-sm sm:gap-4 sm:pr-5 md:pl-5">
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <Image
          src="/Normatel Engenharia_BRANCO.svg"
          alt="Normatel Engenharia"
          width={140}
          height={36}
          className="h-7 w-auto shrink-0 object-contain sm:h-8"
          priority
        />
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <span className="h-7 w-px shrink-0 bg-white/25" aria-hidden />
          <Image
            src="/Principal_h_cor_RGB (1).svg"
            alt="Petrobras"
            width={110}
            height={36}
            className="h-8 w-auto shrink-0 object-contain"
            priority
          />
        </div>
        <span className="hidden truncate border-l border-white/25 pl-3 text-sm font-semibold tracking-tight lg:block">
          Fluxo de Equipamento Crítico
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center px-1 sm:px-2">
        <button
          type="button"
          onClick={openSearch}
          aria-label="Abrir busca global"
          className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-2.5 text-sm transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:px-3"
        >
          <Search className="h-4 w-4 shrink-0 text-white/90" aria-hidden />
          <span className="hidden truncate text-white/80 sm:inline">Buscar páginas e registros...</span>
          <span className="ml-auto hidden shrink-0 rounded border border-white/30 px-1.5 py-0.5 text-[10px] text-white/90 md:inline">
            Ctrl+K
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 outline-none transition-colors hover:bg-white/10 sm:px-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatarUrl} />
              <AvatarFallback>{(profile?.name || "U").charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="hidden text-left md:block">
              <p className="max-w-32 truncate text-sm font-medium leading-none text-white">{profile?.name || "Usuário"}</p>
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
