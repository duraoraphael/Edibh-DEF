"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { onSnapshot, orderBy, query, doc } from "firebase/firestore";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ChevronRight, Download, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailFilterBar, type DetailFilterField } from "@/components/dashboard/detail-filter-bar";
import { DistributionChart } from "@/components/dashboard/distribution-chart";
import { FlowTable } from "@/components/dashboard/flow-table";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { exportRecordsToExcel } from "@/lib/excel-export";
import { recordsCol } from "@/lib/firestore-helpers";
import { canonicalizeAuthorNames } from "@/lib/person-name";
import { DEFAULT_FORM_ID, statusLabels } from "@/lib/forms";
import { buildDistributionData, type DistributionDatum, type DistributionKey } from "@/lib/dashboard-distributions";
import { filterDrillRows, periodLabel, toDrillRow } from "@/lib/dashboard-drilldown";
import { filterByPeriod, scopeRecords } from "@/lib/dashboard-scope";
import {
  ALL, DETAIL_DIMENSIONS, addStep, buildDashboardHref, buildDetailHref, describeGlobals, detailDimensionLabels, parseDetailQuery, recordDimensionValues,
  recordMatchesStep, removeStep, stepFromCategory, stepLabel, type DetailDimension, type DetailQuery, type DetailStep,
} from "@/lib/dashboard-nav";
import type { AppRecord, FormDefinition, RecordStatus } from "@/types";

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

function statusDistribution(records: AppRecord[]): DistributionDatum[] {
  const counts = new Map<string, number>();
  records.forEach((record) => counts.set(record.status, (counts.get(record.status) ?? 0) + 1));
  return Array.from(counts, ([status, total]) => ({ name: statusLabels[status as RecordStatus] ?? status, total, percentage: records.length ? total / records.length * 100 : 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
}

/** One reusable detail dashboard: everything it shows is derived from the URL query and the real records. */
export function DetailDashboard() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = useMemo(() => parseDetailQuery(searchParams), [searchParams]);
  const { steps, globals, dateFrom, dateTo, day } = urlQuery;

  const [records, setRecords] = useState<AppRecord[]>([]);
  const [formDefinition, setFormDefinition] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState(urlQuery.search);
  const [lastUrlSearch, setLastUrlSearch] = useState(urlQuery.search);
  const [exporting, setExporting] = useState(false);
  // Keep the input in step with the URL when it changes from outside (back/forward).
  if (urlQuery.search !== lastUrlSearch) {
    setLastUrlSearch(urlQuery.search);
    setSearch(urlQuery.search);
  }

  useEffect(() => {
    const unsubRecords = onSnapshot(
      query(recordsCol(), orderBy("createdAt", "desc")),
      (snap) => { setRecords(canonicalizeAuthorNames(snap.docs.map((d) => d.data()))); setLoading(false); },
      () => { setError(true); setLoading(false); }
    );
    const unsubForm = onSnapshot(
      doc(db, "formFields", DEFAULT_FORM_ID),
      (snap) => setFormDefinition(snap.exists() ? (snap.data() as FormDefinition) : null),
      () => setFormDefinition(null)
    );
    return () => { unsubRecords(); unsubForm(); };
  }, []);

  const fields = useMemo(() => formDefinition?.fields ?? [], [formDefinition]);
  // Same scope as the dashboard's totals: global filters first, reprovados only when status itself is being analysed.
  const base = useMemo(() => {
    const submitted = records.filter((record) => record.status !== "rascunho");
    const filtered = filterByPeriod(scopeRecords(submitted, globals), globals, fields);
    return steps.some((step) => step.dim === "status") ? filtered : filtered.filter((record) => record.status !== "rejeitado");
  }, [records, globals, fields, steps]);

  const stepRecords = useMemo(() => base.filter((record) => steps.every((step) => recordMatchesStep(record, step, fields))), [base, steps, fields]);
  const visible = useMemo(() => {
    const dayFiltered = day ? stepRecords.filter((record) => periodLabel(record, fields) === day) : stepRecords;
    const rows = filterDrillRows(dayFiltered.map((record) => toDrillRow(record, fields)), { search, dateFrom, dateTo });
    return rows;
  }, [stepRecords, day, fields, search, dateFrom, dateTo]);
  const visibleRecords = useMemo(() => visible.map((row) => row.record), [visible]);

  const kpis = useMemo(() => [
    { label: "Fluxos totais", value: visibleRecords.length },
    { label: "Sistemas", value: unique(visible.map((row) => row.sistema)).length },
    { label: "Sistemas Macro", value: unique(visible.map((row) => row.sistemaMacro)).length },
    { label: "Instalações", value: unique(visible.map((row) => row.instalacao)).length },
    { label: "Gerências", value: unique(visible.map((row) => row.gerencia)).length },
    { label: "Responsáveis", value: unique(visible.map((row) => row.author)).length },
  ], [visible, visibleRecords]);

  const charts = useMemo(() => DETAIL_DIMENSIONS.map((dim) => ({
    dim,
    data: dim === "status" ? statusDistribution(visibleRecords) : buildDistributionData(visibleRecords, dim as DistributionKey, fields),
  })), [visibleRecords, fields]);

  const origin = steps[0];
  const filterFields: DetailFilterField[] = (["fonteDados", "instalacao", "gerencia", "sistema", "sistemaMacro", "status", "responsavel"] as DetailDimension[]).map((dim) => {
    const step = steps.find((item) => item.dim === dim);
    const locked = origin?.dim === dim;
    // Options come from the flows matching every *other* step, so the current choice can always be switched.
    const pool = locked ? [] : base.filter((record) => steps.every((item) => item.dim === dim || recordMatchesStep(record, item, fields)));
    const options = locked ? [origin.value] : unique(pool.flatMap((record) => recordDimensionValues(record, dim, fields))).sort((a, b) => stepLabel({ dim, value: a }).localeCompare(stepLabel({ dim, value: b }), "pt-BR"));
    return {
      dim, label: detailDimensionLabels[dim], locked, options,
      value: step?.value ?? ALL,
      labels: dim === "status" ? statusLabels : undefined,
    };
  });

  const hrefFor = (patch: Partial<DetailQuery>) => buildDetailHref({ ...urlQuery, search, ...patch });
  const currentHref = `${pathname}?${searchParams.toString()}`;
  const dashboardHref = buildDashboardHref(globals);
  const extraActive = steps.length > 1 || !!search.trim() || !!dateFrom || !!dateTo || !!day;

  function goToSteps(next: DetailStep[]) { router.push(hrefFor({ steps: next })); }
  function updateSearch(value: string) {
    setSearch(value);
    setLastUrlSearch(value.trim());
    router.replace(hrefFor({ search: value }));
  }
  function clearExtras() {
    setSearch("");
    router.push(buildDetailHref({ steps: origin ? [origin] : [], globals }));
  }

  async function exportFlows() {
    setExporting(true);
    try {
      await exportRecordsToExcel({ records: visibleRecords, formFields: fields, userName: profile?.name || user?.email || "—", title: `Fluxos — ${steps.map(stepLabel).join(" · ") || "Todos"}` });
    } catch {
      toast.error("Não foi possível exportar os fluxos");
    } finally {
      setExporting(false);
    }
  }

  const title = steps.length ? steps.map(stepLabel).join(" · ") : "Todos os fluxos";
  const subtitle = steps.length
    ? `Análise consolidada dos fluxos vinculados a ${steps.map((step) => `${detailDimensionLabels[step.dim].toLowerCase()} ${stepLabel(step)}`).join(", ")}.`
    : "Análise consolidada dos fluxos.";
  const chips = [...describeGlobals(globals), ...(day ? [`Dia: ${day}`] : []), ...(search.trim() ? [`Busca: ${search.trim()}`] : []), ...(dateFrom ? [`Fluxo de: ${dateFrom.split("-").reverse().join("/")}`] : []), ...(dateTo ? [`Fluxo até: ${dateTo.split("-").reverse().join("/")}`] : [])];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <nav aria-label="Navegação da análise" className="flex flex-wrap items-center gap-1.5 text-sm">
          <Link href={dashboardHref} className="font-medium text-primary underline-offset-4 hover:underline">Dashboard</Link>
          {steps.map((step, index) => {
            const last = index === steps.length - 1;
            return (
              <span key={step.dim} className="inline-flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {last ? (
                  <span aria-current="page" className="rounded-full bg-primary-50 px-2.5 py-0.5 font-medium text-primary-800">{detailDimensionLabels[step.dim]}: {stepLabel(step)}</span>
                ) : (
                  <Link href={hrefFor({ steps: steps.slice(0, index + 1) })} className="rounded-full border border-border px-2.5 py-0.5 text-muted-foreground hover:bg-muted">{detailDimensionLabels[step.dim]}: {stepLabel(step)}</Link>
                )}
                {index > 0 && (
                  <button type="button" onClick={() => goToSteps(removeStep(steps, step.dim))} aria-label={`Remover filtro ${detailDimensionLabels[step.dim]}: ${stepLabel(step)}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            );
          })}
        </nav>

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <h1 className="break-words text-3xl font-semibold tracking-tight">Dashboard de Fluxos — {title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            <p className="mt-2 text-sm text-muted-foreground tabular-nums" aria-live="polite" data-testid="detail-count">
              {loading ? "Carregando fluxos…" : <><strong className="font-semibold text-foreground">{visibleRecords.length.toLocaleString("pt-BR")}</strong> {visibleRecords.length === 1 ? "fluxo encontrado" : "fluxos encontrados"}{visibleRecords.length !== stepRecords.length && <> (de {stepRecords.length.toLocaleString("pt-BR")} na seleção)</>}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline"><Link href={dashboardHref}><ArrowLeft className="h-4 w-4" />Voltar ao Dashboard</Link></Button>
            <Button variant="outline" onClick={exportFlows} disabled={exporting || loading || visibleRecords.length === 0}><Download className="h-4 w-4" />{exporting ? "Exportando…" : "Exportar Excel"}</Button>
          </div>
        </div>

          <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {chips.map((chip) => <span key={chip} className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{chip}</span>)}
            {!steps.some((step) => step.dim === "status") && <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Exclui fluxos reprovados (como o total)</span>}
          </div>
      </header>

      <DetailFilterBar
        search={search}
        onSearch={updateSearch}
        fields={filterFields}
        onSelect={(dim, value) => goToSteps(value === ALL ? removeStep(steps, dim) : addStep(steps, { dim, value }))}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDates={(from, to) => router.replace(hrefFor({ dateFrom: from, dateTo: to }))}
        onClear={clearExtras}
        canClear={extraActive}
      />

      {error ? (
        <Card role="alert" className="p-10 text-center shadow-none">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden />
          <p className="mt-2 text-sm font-medium">Não foi possível carregar os fluxos.</p>
          <p className="text-sm text-muted-foreground">Verifique sua conexão ou permissões e tente novamente.</p>
        </Card>
      ) : (
        <>
          <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="shadow-none">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                  {loading ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums" data-testid={`kpi-${kpi.label}`}>{kpi.value.toLocaleString("pt-BR")}</p>}
                </CardContent>
              </Card>
            ))}
          </section>

          {!loading && stepRecords.length === 0 && (
            <Card className="p-8 text-center shadow-none"><p className="text-sm font-medium">Nenhum fluxo encontrado para esta seleção.</p><p className="mt-1 text-sm text-muted-foreground">Ela pode não existir mais, ou os filtros do dashboard a deixaram sem registros.</p></Card>
          )}

          <section aria-label="Distribuições" className="grid gap-4 xl:grid-cols-2">
            {charts.map(({ dim, data }) => {
              const step = steps.find((item) => item.dim === dim);
              const locked = origin?.dim === dim;
              return (
                <Card key={dim} className="min-w-0 rounded-2xl p-4 shadow-none sm:p-6" data-testid={`chart-${dim}`}>
                  {loading ? <Skeleton className="h-[320px] w-full" /> : data.length === 0 ? (
                    <div><h3 className="text-sm font-semibold">Distribuição por {detailDimensionLabels[dim]}</h3><p className="mt-6 text-center text-sm text-muted-foreground">Nenhum dado disponível</p></div>
                  ) : (
                    <DistributionChart
                      compact
                      data={data}
                      totalRecords={visibleRecords.length}
                      label={detailDimensionLabels[dim]}
                      selected={step ? stepLabel(step) : null}
                      onSelect={locked ? undefined : (name) => goToSteps(addStep(steps, stepFromCategory(dim, name)))}
                    />
                  )}
                  {locked && <p className="mt-2 text-xs text-muted-foreground">Filtro fixado pela seleção que originou esta análise.</p>}
                  {dim === "fonteDados" && !loading && data.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Cada fluxo é contado uma vez por fonte; um fluxo com mais de uma fonte aparece em mais de uma coluna.</p>}
                </Card>
              );
            })}
          </section>

          <section aria-labelledby="flows-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-4 sm:px-6"><h2 id="flows-heading" className="text-lg font-semibold tracking-tight">Fluxos encontrados</h2></div>
            {loading ? <div className="flex flex-col gap-2 p-6">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : <FlowTable rows={visible} returnTo={currentHref} />}
          </section>
        </>
      )}
    </div>
  );
}
