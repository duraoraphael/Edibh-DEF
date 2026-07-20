"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, limit, onSnapshot, orderBy, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { Bell, CheckCheck } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { notificationsCol } from "@/lib/firestore-helpers";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppNotification } from "@/types";

export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      return () => setItems([]);
    }
    const unsub = onSnapshot(
      query(
        notificationsCol(),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(30)
      ),
      (snap) => setItems(snap.docs.map((d) => d.data())),
      () => setItems([])
    );
    return () => unsub();
  }, [user]);

  const unread = useMemo(() => items.filter((n) => !n.read), [items]);

  async function markRead(n: AppNotification) {
    if (!n.read) {
      try {
        await updateDoc(doc(db, "notifications", n.id), { read: true });
      } catch {}
    }
    if (n.href) router.push(n.href);
    setOpen(false);
  }

  async function markAllRead() {
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
      await batch.commit();
    } catch {}
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`Notificações${unread.length ? `, ${unread.length} não lidas` : ""}`}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notificações</span>
          <button
            onClick={markAllRead}
            disabled={unread.length === 0}
            aria-label="Marcar todas como lidas"
            className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todas
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState icon={Bell} text="Nenhuma notificação" className="py-8" />
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                  n.read ? "" : "bg-primary-50"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-medium">{n.title}</span>
                  {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                </div>
                {n.message && <span className="text-xs text-muted-foreground">{n.message}</span>}
                <span className="text-[11px] text-muted-foreground">
                  {n.createdAt ? new Date(n.createdAt).toLocaleString("pt-BR") : ""}
                </span>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
