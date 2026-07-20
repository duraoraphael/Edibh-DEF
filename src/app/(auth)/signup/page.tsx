"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Info, Leaf, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function SignupPage() {
  const { user, loading, signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    setSubmitting(true);
    try {
      await signUp(name, email, password);
      toast.success("Conta criada como Visualizador. Aguarde a aprovação de um administrador para liberar mais acessos.");
      router.replace("/dashboard");
    } catch {
      toast.error("Não foi possível criar a conta. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-100 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card className="p-8 shadow-xl">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
              <Leaf className="h-7 w-7" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
              <p className="text-sm text-muted-foreground">Cadastre-se no sistema Fluxo de Equipamentos</p>
            </div>
          </div>
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50 p-3 text-xs text-primary-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Novas contas são criadas com o perfil <strong>Visualizador</strong> e dependem da aprovação de um{" "}
              <strong>Administrador</strong> para obterem acesso completo ao sistema.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                type="text"
                required
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="seu.nome@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="mt-2 h-11" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar conta
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Fluxo de Equipamentos. Todos os direitos reservados.
        </p>
      </motion.div>
    </div>
  );
}
