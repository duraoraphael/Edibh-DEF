"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings2,
  Trash2,
  Plus,
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
import type { ReactElement } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect } from "@/components/ui/filter-select";
import { CollapsibleFilters } from "@/components/ui/collapsible-filters";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { recordsCol, approvalsCol } from "@/lib/firestore-helpers";
import { fieldValue, statusLabels, statusVariant } from "@/lib/forms";
import type { AppRecord, Approval } from "@/types";

// alinhado ao tema: --primary-500, --warning, --destructive, --muted-foreground, --primary-300
const COLORS = ["#0e7a4b", "#f59e0b", "#dc2626", "#6b7280", "#6cbd90"];
const ALL = "todos";

const CARD_KEYS = ["total", "pendentes", "aprovados", "rejeitados", "andamento", "recusados"] as const;
type CardKey = (typeof CARD_KEYS)[number];
const CHART_KEYS = ["periodo", "status", "gerencia", "instalacao", "sistema", "responsavel"] as const;
type ChartKey = (typeof CHART_KEYS)[number];

const cardMeta: Record<CardKey, { label: string; icon: typeof FileText }> = {
  total: { label: "Total de Registros", icon: FileText },
  pendentes: { label: "Pendentes de Aprovação", icon: Clock },
  aprovados: { label: "Finalizados (Aprovados)", icon: CheckCircle2 },
  rejeitados: { label: "Rejeitados", icon: XCircle },
  andamento: { label: "Em Andamento", icon: Loader2 },
  recusados: { label: "Fluxos Recusados", icon: XCircle },
};

const chartMeta: Record<ChartKey, string> = {
  periodo: "Registros por período",
  status: "Distribuição por status",
  gerencia: "Registros por gerência",
  instalacao: "Registros por instalação",
  sistema: "Registros por sistema",
  responsavel: "Registros por responsável",
};

interface DashboardPrefs {
  cards: CardKey[];
  charts: ChartKey[];
}

const DEFAULT_PREFS: DashboardPrefs = {
  cards: ["total", "pendentes", "aprovados", "rejeitados", "andamento", "recusados"],
  charts: ["periodo", "status", "gerencia", "responsavel"],
};

function groupCount(records: AppRecord[], keyFn: (r: AppRecord) => string) {
  const map = new Map<string, number>();
  records.forEach((r) => {
    const key = keyFn(r) || "N/D";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value, total: value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_PREFS);
  const [configOpen, setConfigOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [gerenciaFilter, setGerenciaFilter] = useState(ALL);
  const [instalacaoFilter, setInstalacaoFilter] = useState(ALL);
  const [sistemaFilter, setSistemaFilter] = useState(ALL);
  const [equipamentoFilter, setEquipamentoFilter] = useState(ALL);
  const [responsavelFilter, setResponsavelFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [anoFilter, setAnoFilter] = useState(ALL);
  const [mesFilter, setMesFilter] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
    const unsub3 = onSnapshot(doc(db, "settings", "dashboardConfig"), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<DashboardPrefs>;
        setPrefs({
          cards: data.cards?.length ? data.cards : DEFAULT_PREFS.cards,
          charts: data.charts?.length ? data.charts : DEFAULT_PREFS.charts,
        });
      }
    });
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  const submitted = useMemo(() => records.filter((r) => r.status !== "rascunho"), [records]);

  const distinct = useCallback(
    (key: string) => Array.from(new Set(submitted.map((r) => fieldValue(r, key)).filter(Boolean))).sort(),
    [submitted]
  );
  const gerencias = useMemo(() => distinct("gerencia"), [distinct]);
  const instalacoes = useMemo(() => distinct("instalacao"), [distinct]);
  const sistemas = useMemo(() => distinct("sistema"), [distinct]);
  const equipamentos = useMemo(() => distinct("equipamento"), [distinct]);
  const responsaveis = useMemo(
    () => Array.from(new Set(submitted.map((r) => r.authorName).filter(Boolean))) as string[],
    [submitted]
  );
  const anos = useMemo(
    () =>
      Array.from(
        new Set(submitted.map((r) => (r.createdAt ? String(new Date(r.createdAt).getFullYear()) : "")).filter(Boolean))
      ).sort((a, b) => b.localeCompare(a)),
    [submitted]
  );

  const filtered = useMemo(() => {
    let list = submitted;
    if (gerenciaFilter !== ALL) list = list.filter((r) => fieldValue(r, "gerencia") === gerenciaFilter);
    if (instalacaoFilter !== ALL) list = list.filter((r) => fieldValue(r, "instalacao") === instalacaoFilter);
    if (sistemaFilter !== ALL) list = list.filter((r) => fieldValue(r, "sistema") === sistemaFilter);
    if (equipamentoFilter !== ALL) list = list.filter((r) => fieldValue(r, "equipamento") === equipamentoFilter);
    if (responsavelFilter !== ALL) list = list.filter((r) => r.authorName === responsavelFilter);
    if (statusFilter !== ALL) list = list.filter((r) => r.status === statusFilter);
    if (anoFilter !== ALL) list = list.filter((r) => r.createdAt && String(new Date(r.createdAt).getFullYear()) === anoFilter);
    if (mesFilter !== ALL) list = list.filter((r) => r.createdAt && String(new Date(r.createdAt).getMonth() + 1) === mesFilter);
    if (dateFrom) list = list.filter((r) => r.createdAt && r.createdAt >= dateFrom);
    if (dateTo) list = list.filter((r) => r.createdAt && r.createdAt <= dateTo + "T23:59:59");
    return list;
  }, [
    submitted,
    gerenciaFilter,
    instalacaoFilter,
    sistemaFilter,
    equipamentoFilter,
    responsavelFilter,
    statusFilter,
    anoFilter,
    mesFilter,
    dateFrom,
    dateTo,
  ]);

  const filteredApprovals = useMemo(() => {
    const ids = new Set(filtered.map((r) => r.id));
    return approvals.filter((a) => ids.has(a.recordId));
  }, [approvals, filtered]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const pendentes = filteredApprovals.filter((a) => a.status === "pendente").length;
    const aprovados = filtered.filter((r) => r.status === "aprovado" || r.status === "concluido").length;
    const rejeitados = filtered.filter((r) => r.status === "rejeitado").length;
    const andamento = filtered.filter((r) => r.status === "pendente" || r.status === "reajuste" || r.status === "em_andamento").length;
    const recusados = filtered.filter((r) => r.status === "recusado").length;
    return { total, pendentes, aprovados, rejeitados, andamento, recusados };
  }, [filtered, filteredApprovals]);

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const d = r.createdAt ? new Date(r.createdAt) : null;
      const key = d ? `${d.getDate()}/${d.getMonth() + 1}` : "N/D";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, total]) => ({ name, total }));
  }, [filtered]);

  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const label = statusLabels[r.status] ?? r.status;
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const gerenciaData = useMemo(() => groupCount(filtered, (r) => fieldValue(r, "gerencia")), [filtered]);
  const instalacaoData = useMemo(() => groupCount(filtered, (r) => fieldValue(r, "instalacao")), [filtered]);
  const sistemaData = useMemo(() => groupCount(filtered, (r) => fieldValue(r, "sistema")), [filtered]);
  const responsavelData = useMemo(() => groupCount(filtered, (r) => r.authorName || "N/D"), [filtered]);

  const barChartFor: Record<Exclude<ChartKey, "status" | "periodo">, { name: string; total: number }[]> = {
    gerencia: gerenciaData,
    instalacao: instalacaoData,
    sistema: sistemaData,
    responsavel: responsavelData,
  };

  const drafts = useMemo(() => records.filter((r) => r.status === "rascunho").slice(0, 6), [records]);

  async function savePrefs(next: DashboardPrefs) {
    setPrefs(next);
    try {
      await setDoc(doc(db, "settings", "dashboardConfig"), next, { merge: true });
    } catch {
      toast.error("Erro ao salvar preferências do dashboard");
    }
  }

  function toggleCard(key: CardKey) {
    const has = prefs.cards.includes(key);
    savePrefs({ ...prefs, cards: has ? prefs.cards.filter((k) => k !== key) : [...prefs.cards, key] });
  }

  function toggleChart(key: ChartKey) {
    const has = prefs.charts.includes(key);
    savePrefs({ ...prefs, charts: has ? prefs.charts.filter((k) => k !== key) : [...prefs.charts, key] });
  }

  async function deleteDraft(r: AppRecord) {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "records", r.id));
      toast.success("Rascunho excluído");
      setDeleteTarget(null);
    } catch {
      toast.error("Erro ao excluir rascunho");
    } finally {
      setDeleting(false);
    }
  }

  const activeFilterCount = [
    gerenciaFilter,
    instalacaoFilter,
    sistemaFilter,
    equipamentoFilter,
    responsavelFilter,
    statusFilter,
    anoFilter,
    mesFilter,
  ].filter((v) => v !== ALL).length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral do Fluxo de Equipamentos</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setConfigOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Personalizar
            </Button>
          )}
          <Button asChild>
            <Link href="/records/new">
              <Plus className="h-4 w-4" />
              Novo Registro
            </Link>
          </Button>
        </div>
      </div>

      <CollapsibleFilters activeCount={activeFilterCount}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-8">
          <FilterSelect label="Gerência" value={gerenciaFilter} onChange={setGerenciaFilter} options={gerencias} />
          <FilterSelect label="Instalação" value={instalacaoFilter} onChange={setInstalacaoFilter} options={instalacoes} />
          <FilterSelect label="Sistema" value={sistemaFilter} onChange={setSistemaFilter} options={sistemas} />
          <FilterSelect label="Equipamento" value={equipamentoFilter} onChange={setEquipamentoFilter} options={equipamentos} />
          <FilterSelect label="Responsável" value={responsavelFilter} onChange={setResponsavelFilter} options={responsaveis} />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={Object.keys(statusLabels)}
            labels={statusLabels}
          />
          <FilterSelect label="Ano" value={anoFilter} onChange={setAnoFilter} options={anos} />
          <FilterSelect
            label="Mês"
            value={mesFilter}
            onChange={setMesFilter}
            options={Array.from({ length: 12 }, (_, i) => String(i + 1))}
            labels={Object.fromEntries(
              Array.from({ length: 12 }, (_, i) => [
                String(i + 1),
                new Date(2000, i, 1).toLocaleDateString("pt-BR", { month: "long" }),
              ])
            )}
          />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Período de" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Período até" />
        </div>
      </CollapsibleFilters>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {CARD_KEYS.filter((k) => prefs.cards.includes(k)).map((k, i) => {
          const meta = cardMeta[k];
          return (
            <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{meta.label}</p>
                    {loading ? (
                      <Skeleton className="mt-2 h-7 w-12" />
                    ) : (
                      <p className="mt-1 text-2xl font-semibold tracking-tight">{stats[k]}</p>
                    )}
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                    <meta.icon className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {prefs.charts.includes("periodo") && (
          <Card>
            <CardHeader>
              <CardTitle>{chartMeta.periodo}</CardTitle>
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
        )}

        {prefs.charts.includes("status") && (
          <Card>
            <CardHeader>
              <CardTitle>{chartMeta.status}</CardTitle>
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
        )}

        {(["gerencia", "instalacao", "sistema", "responsavel"] as const)
          .filter((k) => prefs.charts.includes(k))
          .map((k) => (
            <Card key={k}>
              <CardHeader>
                <CardTitle>{chartMeta[k]}</CardTitle>
              </CardHeader>
              <CardContent className="h-72 max-h-72">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : barChartFor[k].length === 0 ? (
                  <EmptyState text="Nenhum dado disponível" />
                ) : (
                  <CategoryBarChart data={barChartFor[k]} />
                )}
              </CardContent>
            </Card>
          ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimos Registros</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : filtered.length === 0 ? (
              <EmptyState text="Nenhum registro encontrado" />
            ) : (
              filtered.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.recordNumber || r.id}</p>
                    <p className="text-xs text-muted-foreground">{r.authorName || "—"}</p>
                  </div>
                  <Badge variant={statusVariant[r.status]}>{statusLabels[r.status]}</Badge>
                </div>
              ))
            )}

            {isAdmin && drafts.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Lixeira · Rascunhos</p>
                <div className="flex flex-col gap-2">
                  {drafts.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-xl border border-dashed border-border p-2">
                      <p className="truncate text-xs text-muted-foreground">{r.recordNumber || r.id}</p>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
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
            ) : filteredApprovals.filter((a) => a.status === "pendente").length === 0 ? (
              <EmptyState text="Nenhuma pendência no momento" />
            ) : (
              filteredApprovals
                .filter((a) => a.status === "pendente")
                .slice(0, 6)
                .map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                    <p className="truncate text-sm font-medium">{a.recordNumber || a.recordId}</p>
                    <Badge variant="warning">Pendente</Badge>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Personalizar Dashboard</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-sm font-medium">Cartões</p>
              <div className="flex flex-col gap-2">
                {CARD_KEYS.map((k) => (
                  <label key={k} className="flex items-center justify-between text-sm">
                    {cardMeta[k].label}
                    <Switch checked={prefs.cards.includes(k)} onCheckedChange={() => toggleCard(k)} />
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Gráficos</p>
              <div className="flex flex-col gap-2">
                {CHART_KEYS.map((k) => (
                  <label key={k} className="flex items-center justify-between text-sm">
                    {chartMeta[k]}
                    <Switch checked={prefs.charts.includes(k)} onCheckedChange={() => toggleChart(k)} />
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setConfigOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir rascunho</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir o rascunho {deleteTarget?.recordNumber || deleteTarget?.id}? Esta ação não pode
            ser desfeita e não afeta registros oficiais.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteDraft(deleteTarget)} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function truncateLabel(name: string, max = 14): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function CategoryTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}): ReactElement {
  const value = payload?.value ?? "";
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{value}</title>
      <text dx={-6} dy={4} textAnchor="end" fontSize={12} fill="#6b7280">
        {truncateLabel(value)}
      </text>
    </g>
  );
}

function CategoryBarChart({ data }: { data: { name: string; total: number }[] }) {
  const rowHeight = 32;
  const minHeight = 260;
  const chartHeight = Math.max(minHeight, data.length * rowHeight);
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div style={{ height: chartHeight, minWidth: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
            <XAxis type="number" fontSize={12} stroke="#6b7280" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              interval={0}
              tick={CategoryTick as never}
            />
            <Tooltip formatter={(value) => [value, "Registros"]} labelFormatter={(label) => label} />
            <Bar dataKey="total" fill="#0e7a4b" radius={[0, 6, 6, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
