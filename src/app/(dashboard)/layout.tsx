"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Clock, Loader2, LogOut, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Footer } from "@/components/layout/footer";
import { CommandPalette } from "@/components/layout/command-palette";
import { SearchProvider } from "@/components/layout/search-context";
import { isApprovedProfile as isApproved, isUsableProfile } from "@/lib/access-policy";
import { isRouteAllowed } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import type { User } from "@/types";
import { toast } from "sonner";
import { authErrorMessage } from "@/lib/auth-errors";

function PendingApprovalScreen({ profile, onSignOut }: { profile: User; onSignOut: () => void }) {
  const rejected = profile.status === "rejeitado" || profile.status === "inativo";
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {rejected ? (
          <ShieldAlert className="h-10 w-10 text-destructive" />
        ) : (
          <Clock className="h-10 w-10 text-primary" />
        )}
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {rejected ? "Acesso não liberado" : "Aguardando aprovação"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {rejected
              ? "Sua conta não está liberada para acessar o sistema. Fale com um administrador se acredita que isso é um engano."
              : "Sua conta foi criada e já pode ser usada para consultar este status. Um administrador precisa aprovar seu acesso antes que você possa ver registros, usuários e demais dados internos."}
          </p>
        </div>
        <Button variant="outline" onClick={onSignOut} className="mt-2">
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut, recoverProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && user && profile && pathname && isApproved(profile) && !isRouteAllowed(profile.role, pathname)) {
      router.replace("/dashboard");
    }
  }, [loading, user, profile, pathname, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile || !isUsableProfile(profile, user.uid, user.email)) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <ShieldAlert className="h-10 w-10 text-destructive" />
      <h1>Não foi possível carregar seu perfil de acesso.</h1>
      <p>Tente recarregar a página. Se persistir, peça ao administrador para verificar seu cadastro.</p>
      <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
      <Button onClick={() => recoverProfile().catch(error => toast.error(authErrorMessage(error?.code)))}>Recuperar cadastro</Button>
      <Button variant="outline" onClick={() => signOut()}>Sair</Button>
    </div>;
  }

  if (profile && !isApproved(profile)) {
    return <PendingApprovalScreen profile={profile} onSignOut={() => signOut()} />;
  }

  if (profile && pathname && !isRouteAllowed(profile.role, pathname)) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SearchProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <main className="flex-1 p-4 md:p-10">
            <div className="mx-auto w-full max-w-350">{children}</div>
          </main>
          <Footer />
        </div>
        <CommandPalette />
      </div>
    </SearchProvider>
  );
}
