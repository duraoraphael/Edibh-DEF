"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { FolderOpen, Link2, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const SETTINGS_DOC_ID = "sharepoint";

export default function SharePointPage() {
  const [siteUrl, setSiteUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", SETTINGS_DOC_ID),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSiteUrl(data.siteUrl || "");
          setConfigured(!!data.siteUrl);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await setDoc(
        doc(db, "settings", SETTINGS_DOC_ID),
        { siteUrl, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      setConfigured(!!siteUrl);
      toast.success("Configuração salva com sucesso");
    } catch {
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SharePoint</h1>
        <p className="text-sm text-muted-foreground">Configure a integração com o SharePoint</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Status da integração
          </CardTitle>
          <CardDescription>
            {loading ? "Verificando status..." : configured ? "Site do SharePoint configurado" : "Nenhum site configurado ainda"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <Badge variant={configured ? "success" : "secondary"} className="w-fit">
                {configured ? "Conectado" : "Não configurado"}
              </Badge>
              <div className="flex flex-col gap-1.5">
                <Label>URL do site SharePoint</Label>
                <Input
                  placeholder="https://suaempresa.sharepoint.com/sites/equipamentos"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-fit">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar configuração
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Arquivos recentes</CardTitle>
          <CardDescription>Arquivos sincronizados a partir do SharePoint aparecerão aqui</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-12 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum arquivo sincronizado ainda</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
