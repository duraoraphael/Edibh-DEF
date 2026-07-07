"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { motion } from "framer-motion";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { recordsCol, approvalsCol } from "@/lib/firestore-helpers";
import type { AppRecord, Approval, RecordStatus } from "@/types";

const statusLabels: Record<RecordStatus, string> = {
  rascunho: "Rascunho",
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  ajuste: "Ajuste",
};

const statusVariant: Record<RecordStatus, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  rascunho: "secondary",
  pendente: "warning",
  aprovado: "success",
  rejeitado: "destructive",
  ajuste: "warning",
};

// alinhado ao tema: --primary-500, --warning, --destructive, --muted-foreground, --primary-300
const COLORS = ["#0e7a4b", "#f59e0b", "#dc2626", "#6b7280", "#6cbd90"];

export default function DashboardPage() {
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub1 = onSnapshot(
      query(recordsCol(), orderBy("createdAt", "desc")),
      (snap) => {
        setRecords(snap.docs.map((d) => d.data()));
        setLoading(false);
      },
      () => setLoading(false)
    );
    const unsub2 = onSnapshot(approvalsCol(), (snap) => {
      setApprovals(snap.docs.map((d) => d.data()));
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const stats = useMemo(() => {
    const total = records.length;
    const pendentes = approvals.filter((a) => a.status === "pendente").length;
    const aprovados = records.filter((r) => r.status === "aprovado").length;
    const rejeitados = records.filter((r) => r.status === "rejeitado").length;
    return { total, pendentes, aprovados, rejeitados };
  }, [records, approvals]);

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((r) => {
      const d = r.createdAt ? new Date(r.createdAt) : null;
      const key = d ? `${d.getDate()}/${d.getMonth() + 1}` : "N/D";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, total]) => ({ name, total }));
  }, [records]);

  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((r) => {
      const label = statusLabels[r.status] ?? r.status;
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [records]);

  const cards = [
    { label: "Total de Registros", value: stats.total, icon: FileText },
    { label: "Pendentes de Aprovação", value: stats.pendentes, icon: Clock },
    { label: "Aprovados", value: stats.aprovados, icon: CheckCircle2 },
    { label: "Rejeitados", value: stats.rejeitados, icon: XCircle },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do Fluxo de Equipamentos</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  {loading ? (
                    <Skeleton className="mt-2 h-7 w-12" />
                  ) : (
                    <p className="mt-1 text-2xl font-semibold">{c.value}</p>
                  )}
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                  <c.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Registros por período</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : chartData.length === 0 ? (
              <EmptyState text="Nenhum registro encontrado" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" fontSize={12} stroke="#6b7280" />
                  <YAxis fontSize={12} stroke="#6b7280" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#0e7a4b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição por status</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : pieData.length === 0 ? (
              <EmptyState text="Nenhum dado disponível" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimos Registros</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : records.length === 0 ? (
              <EmptyState text="Nenhum registro encontrado" />
            ) : (
              records.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.authorName || "—"}</p>
                  </div>
                  <Badge variant={statusVariant[r.status]}>{statusLabels[r.status]}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pendências</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : approvals.filter((a) => a.status === "pendente").length === 0 ? (
              <EmptyState text="Nenhuma pendência no momento" />
            ) : (
              approvals
                .filter((a) => a.status === "pendente")
                .slice(0, 6)
                .map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                    <p className="truncate text-sm font-medium">{a.recordTitle || a.recordId}</p>
                    <Badge variant="warning">Pendente</Badge>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
