"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
      toast.success("Login realizado com sucesso");
      router.replace("/dashboard");
    } catch {
      toast.error("Credenciais inválidas. Verifique e tente novamente.");
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl  text-white ">
              <Image
                src="/Simbolo eng verde.svg"
                alt="Simbolo Normatel"
                width={56}
                height={56}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                Fluxo de Equipamentos
              </h1>
              <p className="text-sm text-muted-foreground">
                Acesse o sistema interno
              </p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="mt-2 h-11" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Não tem uma conta?{" "}
            <Link
              href="/signup"
              className="font-medium text-primary hover:underline"
            >
              Criar conta
            </Link>
          </p>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Fluxo de Equipamentos. Todos os direitos
          reservados.
        </p>
      </motion.div>
    </div>
  );
}
