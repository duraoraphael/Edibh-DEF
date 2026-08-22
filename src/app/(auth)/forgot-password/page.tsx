"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Leaf, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const { user, loading, resetPassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch {
      toast.error("Muitas solicitações. Aguarde e tente novamente.");
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
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
                <MailCheck className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Verifique seu e-mail</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Se houver uma conta para o endereço informado, ela receberá um link de redefinição.
                </p>
              </div>
              <Link href="/login" className="w-full">
                <Button className="mt-2 h-11 w-full">Voltar ao login</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8 flex flex-col items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
                  <Leaf className="h-7 w-7" />
                </div>
                <div className="text-center">
                  <h1 className="text-2xl font-semibold tracking-tight">Esqueci minha senha</h1>
                  <p className="text-sm text-muted-foreground">
                    Informe seu e-mail para receber o link de redefinição
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
                <Button type="submit" className="mt-2 h-11" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enviar link de redefinição
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Lembrou a senha?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Entrar
                </Link>
              </p>
            </>
          )}
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Fluxo de Equipamentos. Todos os direitos reservados.
        </p>
      </motion.div>
    </div>
  );
}
