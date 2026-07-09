"use client";

import { useRef, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { toast } from "sonner";
import { KeyRound, Loader2, Upload } from "lucide-react";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ProfilePage() {
  const { user, profile } = useAuth();
  // Keying on profile.id makes the form remount (and re-initialize its local
  // `name`/`department` state from the fresh profile) whenever a different
  // profile loads, instead of syncing via an effect.
  return <ProfileFields key={profile?.id ?? "loading"} user={user} profile={profile} />;
}

function ProfileFields({
  user,
  profile,
}: {
  user: ReturnType<typeof useAuth>["user"];
  profile: ReturnType<typeof useAuth>["profile"];
}) {
  const [name, setName] = useState(profile?.name || "");
  const [department, setDepartment] = useState(profile?.department || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "users", user.uid), { name, department }, { merge: true });
      toast.success("Perfil atualizado com sucesso");
    } catch {
      toast.error("Erro ao atualizar perfil");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(db, "users", user.uid), { avatarUrl: url }, { merge: true });
      toast.success("Foto de perfil atualizada");
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  }

  async function handleChangePassword() {
    if (!user || !user.email) return;
    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      toast.success("Senha alterada com sucesso");
      setPasswordDialogOpen(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      toast.error("Erro ao alterar senha. Verifique a senha atual.");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground">Gerencie suas informações pessoais</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações pessoais</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatarUrl} />
              <AvatarFallback className="text-lg">{(profile?.name || "U").charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Alterar foto
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>E-mail</Label>
            <Input value={user?.email || ""} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Departamento</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Ex.: Operações" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-fit">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setPasswordDialogOpen(true)}>
            <KeyRound className="h-4 w-4" />
            Alterar Senha
          </Button>
        </CardContent>
      </Card>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Senha atual</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nova senha</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleChangePassword} disabled={changingPassword || !currentPassword || !newPassword}>
              {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
