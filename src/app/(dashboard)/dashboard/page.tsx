"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
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
  SlidersHorizontal,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { recordsCol } from "@/lib/firestore-helpers";
import { fieldValue, logFirestoreError, migrateLegacyRecordNumbers, statusLabels, statusVariant } from "@/lib/forms";
import type { AppRecord } from "@/types";
import { cn } from "@/lib/utils";

const ALL = "todos";

const CARD_KEYS = ["total", "pendentes", "aprovados", "rejeitados", "andamento"] as const;
type CardKey = (typeof CARD_KEYS)[number];
const CHART_KEYS = ["periodo", "status", "gerencia", "instalacao", "sistema", "responsavel"] as const;
type ChartKey = (typeof CHART_KEYS)[number];

const cardMeta: Record<CardKey, { label: string; icon: typeof FileText }> = {
  total: { label: "Total de Registros", icon: FileText },
  pendentes: { label: "Pendentes de Aprovação", icon: Clock },
  aprovados: { label: "Em Andamento", icon: CheckCircle2 },
  rejeitados: { label: "Fluxos Reprovados", icon: XCircle },
  andamento: { label: "Aguardando Reajuste", icon: Loader2 },
};

const chartMeta: Record<ChartKey, string> = {
  periodo: "Evolução de registros",
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
  cards: [...CARD_KEYS],
  charts: ["periodo", "status", "gerencia", "instalacao", "sistema", "responsavel"],
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
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_PREFS);
  const [configOpen, setConfigOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [distributionKey, setDistributionKey] = useState<"gerencia" | "instalacao" | "sistema" | "responsavel">("gerencia");

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
    // One-time, idempotent: reformats any leftover legacy "NNNN" flow
    // numbers to "NNN/YYYY". No-ops instantly once already migrated.
    if (profile?.role === "admin" || profile?.role === "gerente") {
      migrateLegacyRecordNumbers().catch((error) =>
        logFirestoreError({ fn: "migrateLegacyRecordNumbers" }, error)
      );
    }
  }, [profile?.role]);

  useEffect(() => {
    const unsub1 = onSnapshot(
      query(recordsCol(), orderBy("createdAt", "desc")),
      (snap) => {
        setRecords(snap.docs.map((d) => d.data()));
        setLoading(false);
      },
      () => setLoading(false)
    );
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

  // KPI counts are computed directly from each record's own `status` field —
  // the single source of truth — rather than cross-referencing the separate
  // `approvals` collection. Previously "Pendentes de Aprovação" counted
  // approval docs instead, which could read 0 even with pending flows
  // whenever an approval doc was missing/out of sync with its record.
  const stats = useMemo(() => {
    // Reprovados are tracked on their own and never counted in the total.
    const total = filtered.filter((r) => r.status !== "rejeitado").length;
    const pendentes = filtered.filter((r) => r.status === "pendente").length;
    const aprovados = filtered.filter((r) => r.status === "aprovado").length;
    const rejeitados = filtered.filter((r) => r.status === "rejeitado").length;
    const andamento = filtered.filter((r) => r.status === "reajuste").length;
    return { total, pendentes, aprovados, rejeitados, andamento };
  }, [filtered]);

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const d = r.createdAt ? new Date(r.createdAt) : null;
      const key = d ? `${d.getDate()}/${d.getMonth() + 1}` : "N/D";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, total]) => ({ name, total })).reverse();
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
  const pendingRecords = useMemo(() => filtered.filter((r) => r.status === "pendente").slice(0, 6), [filtered]);

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
  const enabledDistributions = (["gerencia", "instalacao", "sistema", "responsavel"] as const)
    .filter((key) => prefs.charts.includes(key));
  const visibleDistribution = enabledDistributions.includes(distributionKey)
    ? distributionKey
    : enabledDistributions[0];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Visão geral do Fluxo de Equipamentos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
            <SlidersHorizontal className="h-4 w-4" />
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
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
      </header>

      {filtersOpen && (
        <Card className="p-4 shadow-none">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-10">
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
        </Card>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARD_KEYS.filter((k) => prefs.cards.includes(k)).map((k) => {
          const meta = cardMeta[k];
          const percentage = filtered.length ? Math.round((stats[k] / filtered.length) * 1000) / 10 : 0;
          return (
              <Card key={k} className={cn("shadow-none transition-colors hover:border-primary/30", k === "andamento" && stats[k] === 0 && "opacity-70")}>
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{meta.label}</p>
                    {loading ? (
                      <Skeleton className="mt-2 h-7 w-12" />
                    ) : (
                      <><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{stats[k]}</p><p className="mt-1 text-xs text-muted-foreground">{percentage}% do total filtrado</p></>
                    )}
                  </div>
                  <meta.icon className="h-4 w-4 text-primary" />
                </CardContent>
              </Card>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.85fr)]">
        {prefs.charts.includes("periodo") && (
          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle>{chartMeta.periodo}</CardTitle>
              <p className="text-sm text-muted-foreground">Volume de novos registros no período filtrado</p>
            </CardHeader>
            <CardContent className="h-80">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : chartData.length === 0 ? (
                <EmptyState text="Nenhum registro encontrado" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: -16, right: 8, top: 16 }}>
                    <defs><linearGradient id="recordsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0e7a4b" stopOpacity={0.22} /><stop offset="100%" stopColor="#0e7a4b" stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8ecea" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} stroke="#7b8580" tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} stroke="#7b8580" allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="total" stroke="#0e7a4b" strokeWidth={2} fill="url(#recordsFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {prefs.charts.includes("status") && (
          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle>{chartMeta.status}</CardTitle>
              <p className="text-sm text-muted-foreground">Participação no total filtrado</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : pieData.length === 0 ? (
                <EmptyState text="Nenhum dado disponível" />
              ) : (
                <DistributionList data={pieData.map((item) => ({ name: item.name, total: item.value }))} />
              )}
            </CardContent>
          </Card>
        )}

      </section>

      {visibleDistribution && (
        <section>
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div><h2 className="text-lg font-semibold tracking-tight">Distribuições</h2><p className="text-sm text-muted-foreground">Compare os registros por dimensão</p></div>
            <div className="flex overflow-x-auto border-b border-border">
              {enabledDistributions.map((key) => (
                <button key={key} onClick={() => setDistributionKey(key)} className={cn("whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors", visibleDistribution === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {({ gerencia: "Gerência", instalacao: "Instalação", sistema: "Sistema", responsavel: "Responsável" })[key]}
                </button>
              ))}
            </div>
          </div>
          <Card className="p-5 shadow-none">
            {loading ? <Skeleton className="h-64 w-full" /> : barChartFor[visibleDistribution].length === 0 ? <EmptyState text="Nenhum dado disponível" /> : <DistributionList data={barChartFor[visibleDistribution]} />}
          </Card>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Últimos Registros</CardTitle><Link href="/records" className="text-sm font-medium text-primary hover:underline">Ver todos</Link>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : filtered.length === 0 ? (
              <EmptyState text="Nenhum registro encontrado" />
            ) : (
              filtered.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.recordNumber || r.id}</p>
                    <p className="text-xs text-muted-foreground">{r.authorName || "—"}</p>
                  </div>
                  <Badge variant={statusVariant[r.status]}>{statusLabels[r.status]}</Badge>
                </div>
              ))
            )}

            {isAdmin && drafts.length > 0 && (
              <div className="mt-3 border-t border-dashed border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Lixeira · Rascunhos</p>
                <div className="flex flex-col gap-2">
                  {drafts.map((r) => (
                    <div key={r.id} className="flex items-center justify-between py-1.5">
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

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Pendências</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : pendingRecords.length === 0 ? (
              <EmptyState text="Nenhuma pendência no momento" />
            ) : (
              pendingRecords.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{r.recordNumber || r.id}</p><p className="truncate text-xs text-muted-foreground">{r.authorName || "—"}</p></div>
                  <Badge variant="warning">{statusLabels.pendente}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

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

function DistributionList({ data }: { data: { name: string; total: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.total, 0);
  return (
    <div className="flex max-h-80 flex-col gap-4 overflow-y-auto pr-2">
      {data.map((item) => {
        const percentage = total ? Math.round((item.total / total) * 1000) / 10 : 0;
        return <div key={item.name}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate text-foreground" title={item.name}>{item.name}</span><span className="shrink-0 tabular-nums text-muted-foreground"><strong className="font-medium text-foreground">{item.total}</strong> · {percentage}%</span></div><div className="h-1.5 overflow-hidden rounded-sm bg-muted"><div className="h-full rounded-sm bg-primary/75" style={{ width: `${percentage}%` }} /></div></div>;
      })}
    </div>
  );
}
