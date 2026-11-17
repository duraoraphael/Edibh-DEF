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
  ReferenceLine,
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
import { DEFAULT_FORM_ID, fieldValue, logFirestoreError, migrateLegacyRecordNumbers, recordDateKey, statusIndicatorClass, statusLabels, statusVariant } from "@/lib/forms";
import type { AppRecord, FormDefinition, RecordStatus } from "@/types";
import { cn } from "@/lib/utils";
import { DistributionChart } from "@/components/dashboard/distribution-chart";
import { EmittedEquipmentSection } from "@/components/dashboard/emitted-equipment-section";
import { toEmittedItems } from "@/lib/emitted-equipment";
import { buildDistributionData, DISTRIBUTION_KEYS, distributionLabels, formatDistributionPercentage, type DistributionKey } from "@/lib/dashboard-distributions";
import { useRouter, useSearchParams } from "next/navigation";
import { buildDetailHref, describeGlobals, parseDetailQuery, stepFromCategory, type DetailStep, type GlobalFilters } from "@/lib/dashboard-nav";
import { filterByPeriod, scopeRecords } from "@/lib/dashboard-scope";

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

export default function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [formDefinition, setFormDefinition] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_PREFS);
  const [configOpen, setConfigOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [distributionKey, setDistributionKey] = useState<DistributionKey>("gerencia");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [periodFocus, setPeriodFocus] = useState<number | null>(null);

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
    const unsub4 = onSnapshot(
      doc(db, "formFields", DEFAULT_FORM_ID),
      (snap) => setFormDefinition(snap.exists() ? (snap.data() as FormDefinition) : null),
      () => setFormDefinition(null)
    );
    return () => {
      unsub1();
      unsub3();
      unsub4();
    };
  }, []);

  // Coming back from a detail page: its URL carries the dashboard-wide filters, restore them once.
  useEffect(() => {
    const { globals: g } = parseDetailQuery(searchParams);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from the URL on mount */
    setGerenciaFilter(g.gerencia); setInstalacaoFilter(g.instalacao); setSistemaFilter(g.sistema);
    setEquipamentoFilter(g.equipamento); setResponsavelFilter(g.responsavel); setStatusFilter(g.status);
    setAnoFilter(g.ano); setMesFilter(g.mes); setDateFrom(g.dateFrom); setDateTo(g.dateTo);
    if (describeGlobals(g).length > 0) setFiltersOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        new Set(submitted.map((r) => recordDateKey(r, formDefinition?.fields || []).slice(0, 4)).filter(Boolean))
      ).sort((a, b) => b.localeCompare(a)),
    [submitted, formDefinition]
  );

  // Dashboard filters that are not about time. The "emitted equipment" section shares this scope
  // but owns its own year/month selectors, so it must not receive the date filters below.
  const globals = useMemo<GlobalFilters>(
    () => ({ gerencia: gerenciaFilter, instalacao: instalacaoFilter, sistema: sistemaFilter, equipamento: equipamentoFilter, responsavel: responsavelFilter, status: statusFilter, ano: anoFilter, mes: mesFilter, dateFrom, dateTo }),
    [gerenciaFilter, instalacaoFilter, sistemaFilter, equipamentoFilter, responsavelFilter, statusFilter, anoFilter, mesFilter, dateFrom, dateTo]
  );
  const scoped = useMemo(() => scopeRecords(submitted, globals), [submitted, globals]);

  const emittedItems = useMemo(
    () => toEmittedItems(scoped, (r) => recordDateKey(r, formDefinition?.fields || [])),
    [scoped, formDefinition]
  );

  const filtered = useMemo(() => filterByPeriod(scoped, globals, formDefinition?.fields || []), [scoped, globals, formDefinition]);

  // Share the total card scope with record distributions and evolution.
  const totalRecords = useMemo(() => filtered.filter((r) => r.status !== "rejeitado"), [filtered]);

  // KPI counts are computed directly from each record's own `status` field —
  // the single source of truth — rather than cross-referencing the separate
  // `approvals` collection. Previously "Pendentes de Aprovação" counted
  // approval docs instead, which could read 0 even with pending flows
  // whenever an approval doc was missing/out of sync with its record.
  const stats = useMemo(() => {
    // Reprovados are tracked on their own and never counted in the total.
    const total = totalRecords.length;
    const pendentes = filtered.filter((r) => r.status === "pendente").length;
    const aprovados = filtered.filter((r) => r.status === "aprovado").length;
    const rejeitados = filtered.filter((r) => r.status === "rejeitado").length;
    const andamento = filtered.filter((r) => r.status === "reajuste").length;
    return { total, pendentes, aprovados, rejeitados, andamento };
  }, [filtered, totalRecords]);

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    totalRecords.forEach((r) => {
      const key = recordDateKey(r, formDefinition?.fields || []);
      const [, month, day] = key.split("-");
      const label = key ? `${Number(day)}/${Number(month)}` : "N/D";
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, total]) => ({ name, total })).reverse();
  }, [totalRecords, formDefinition]);

  const pieData = useMemo(() => {
    const map = new Map<RecordStatus, number>();
    filtered.forEach((r) => {
      map.set(r.status, (map.get(r.status) || 0) + 1);
    });
    return Array.from(map.entries()).map(([status, value]) => ({
      name: statusLabels[status] ?? status,
      value,
      indicatorClass: statusIndicatorClass[status],
    }));
  }, [filtered]);

  const distributionData = useMemo(
    () => Object.fromEntries(DISTRIBUTION_KEYS.map((key) => [key, buildDistributionData(totalRecords, key, formDefinition?.fields)])) as Record<DistributionKey, ReturnType<typeof buildDistributionData>>,
    [totalRecords, formDefinition]
  );

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

  // Every clickable chart opens the dedicated detail page, carrying the dashboard-wide filters in the URL.
  function openDetail(steps: DetailStep[], day = "") {
    router.push(buildDetailHref({ steps, globals, day }));
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
  const enabledDistributions = DISTRIBUTION_KEYS.filter(
    (key) => key === "fonteDados" || key === "sistemaMacro" || prefs.charts.includes(key)
  );
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
            <CardContent
              className="h-80 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
              tabIndex={chartData.length ? 0 : undefined}
              aria-label={chartData.length ? "Evolução de registros por dia. Use as setas para escolher um dia e Enter para ver os fluxos." : undefined}
              onBlur={() => setPeriodFocus(null)}
              onKeyDown={(event) => {
                if (!chartData.length || event.target !== event.currentTarget) return;
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const step = event.key === "ArrowRight" ? 1 : -1;
                  setPeriodFocus((index) => Math.min(chartData.length - 1, Math.max(0, (index ?? (step > 0 ? -1 : chartData.length)) + step)));
                } else if (event.key === "Enter" && periodFocus !== null && chartData[periodFocus]) {
                  event.preventDefault();
                  openDetail([], chartData[periodFocus].name);
                }
              }}
            >
              {periodFocus !== null && chartData[periodFocus] && <p className="sr-only" aria-live="polite">{chartData[periodFocus].name}: {chartData[periodFocus].total} registros. Pressione Enter para ver os fluxos.</p>}
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : chartData.length === 0 ? (
                <EmptyState text="Nenhum registro encontrado" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: -16, right: 8, top: 16 }} style={{ cursor: "pointer" }} onClick={(state) => {
                    const index = Number(state?.activeTooltipIndex);
                    if (Number.isInteger(index) && chartData[index]) openDetail([], chartData[index].name);
                  }}>
                    <defs><linearGradient id="recordsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0e7a4b" stopOpacity={0.22} /><stop offset="100%" stopColor="#0e7a4b" stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8ecea" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} stroke="#7b8580" tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} stroke="#7b8580" allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip content={<PeriodTooltip total={totalRecords.length} />} />
                    {periodFocus !== null && chartData[periodFocus] && <ReferenceLine x={chartData[periodFocus].name} stroke="#0e7a4b" strokeDasharray="4 3" />}
                    <Area type="monotone" dataKey="total" stroke="#0e7a4b" strokeWidth={2} fill="url(#recordsFill)" activeDot={{ r: 5, cursor: "pointer" }} />
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
                <DistributionList data={pieData.map((item) => ({ name: item.name, total: item.value, indicatorClass: item.indicatorClass }))} onSelect={(name) => openDetail([stepFromCategory("status", name)])} />
              )}
            </CardContent>
          </Card>
        )}

      </section>

      <EmittedEquipmentSection items={emittedItems} loading={loading} />

      {visibleDistribution && (
        <section className="min-w-0" aria-labelledby="distributions-heading">
          <div className="mb-4 flex flex-col justify-between gap-3 2xl:flex-row 2xl:items-end">
            <div><h2 id="distributions-heading" className="text-lg font-semibold tracking-tight">Distribuições</h2><p className="text-sm text-muted-foreground">Compare os registros por dimensão</p></div>
            <div role="tablist" aria-label="Dimensão da distribuição" className="flex min-w-0 max-w-full overflow-x-auto border-b border-border">
              {enabledDistributions.map((key) => (
                <button key={key} id={`distribution-tab-${key}`} role="tab" aria-selected={visibleDistribution === key} aria-controls="distribution-panel" tabIndex={visibleDistribution === key ? 0 : -1} onKeyDown={(event) => {
                  const index = enabledDistributions.indexOf(key);
                  const next = event.key === "ArrowRight" ? (index + 1) % enabledDistributions.length : event.key === "ArrowLeft" ? (index - 1 + enabledDistributions.length) % enabledDistributions.length : event.key === "Home" ? 0 : event.key === "End" ? enabledDistributions.length - 1 : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setDistributionKey(enabledDistributions[next]);
                  document.getElementById(`distribution-tab-${enabledDistributions[next]}`)?.focus();
                }} onClick={() => setDistributionKey(key)} className={cn("whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors", visibleDistribution === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {distributionLabels[key]}
                </button>
              ))}
            </div>
          </div>
          <Card id="distribution-panel" role="tabpanel" aria-labelledby={`distribution-tab-${visibleDistribution}`} className="min-w-0 rounded-2xl p-4 sm:p-6">
            {loading ? <Skeleton className="h-[350px] w-full md:h-[400px] lg:h-[480px]" /> : distributionData[visibleDistribution].length === 0 ? <EmptyState text="Nenhum dado disponível" /> : <DistributionChart key={visibleDistribution} data={distributionData[visibleDistribution]} totalRecords={totalRecords.length} label={distributionLabels[visibleDistribution]} onSelect={(name) => openDetail([{ dim: visibleDistribution, value: name }])} />}
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
                  <Badge variant={statusVariant.pendente}>{statusLabels.pendente}</Badge>
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

function DistributionList({ data, selected, onSelect }: { data: { name: string; total: number; indicatorClass?: string }[]; selected?: string | null; onSelect?: (name: string) => void }) {
  const total = data.reduce((sum, item) => sum + item.total, 0);
  return (
    <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-2">
      {data.map((item) => {
        const percentage = total ? Math.round((item.total / total) * 1000) / 10 : 0;
        const isSelected = selected === item.name;
        return (
          <button key={item.name} type="button" onClick={() => onSelect?.(item.name)} aria-pressed={isSelected} aria-label={`Ver fluxos: ${item.name}, ${item.total} registros, ${percentage}%`} title="Clique para ver os fluxos"
            className={cn("-mx-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring", isSelected && "bg-primary-50 ring-1 ring-primary/40", selected && !isSelected && "opacity-60")}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate text-foreground" title={item.name}>{item.name}</span><span className="shrink-0 tabular-nums text-muted-foreground"><strong className="font-medium text-foreground">{item.total}</strong> · {percentage}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-sm bg-muted"><div className={cn("h-full rounded-sm", item.indicatorClass || "bg-primary/75")} style={{ width: `${percentage}%` }} /></div>
          </button>
        );
      })}
    </div>
  );
}

function PeriodTooltip({ active, payload, total }: { active?: boolean; payload?: ReadonlyArray<{ payload?: { name: string; total: number } }>; total: number }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div role="tooltip" className="rounded-lg border border-border bg-card p-3 text-sm shadow-md">
      <p className="font-medium">{item.name}</p>
      <p className="mt-1 tabular-nums">{item.total.toLocaleString("pt-BR")} {item.total === 1 ? "registro" : "registros"}</p>
      <p className="tabular-nums text-muted-foreground">{formatDistributionPercentage(total ? item.total / total * 100 : 0)} do total</p>
      <p className="mt-1 text-xs text-primary">Clique para ver os fluxos</p>
    </div>
  );
}
