"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Package, Search, TrendingDown, TrendingUp, X, Minus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect, FILTER_ALL } from "@/components/ui/filter-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate, statusLabels, statusVariant } from "@/lib/forms";
import {
  EMPTY_TABLE_FILTERS,
  MONTH_NAMES,
  availableYears,
  buildKpis,
  buildMonthlyEmissions,
  distinctValues,
  fieldText,
  filterEmittedTable,
  selectItems,
  type EmittedItem,
  type EmittedSortDir,
  type EmittedTableFilters,
  type MonthlyVariation,
} from "@/lib/emitted-equipment";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const BAR = "#0e7a4b";
const BAR_MUTED = "#9fd5b4";

/**
 * `items` já vem filtrado pelos filtros do Dashboard (gerência, instalação, sistema, equipamento,
 * responsável, status) e reduzido às emissões válidas. Ano/mês são controlados aqui dentro.
 */
export function EmittedEquipmentSection({ items, loading }: { items: EmittedItem[]; loading: boolean }) {
  const now = useMemo(() => new Date(), []);
  const [yearChoice, setYearChoice] = useState<number | null>(null);
  const [month, setMonth] = useState(0); // 0 = todos os meses
  const [filters, setFilters] = useState<EmittedTableFilters>(EMPTY_TABLE_FILTERS);
  const [dir, setDir] = useState<EmittedSortDir>("desc");
  const [page, setPage] = useState(1);

  const years = useMemo(() => availableYears(items, now.getFullYear()), [items, now]);
  const year = yearChoice !== null && years.includes(yearChoice) ? yearChoice : years.includes(now.getFullYear()) ? now.getFullYear() : years[0];

  const monthly = useMemo(() => buildMonthlyEmissions(items, year), [items, year]);
  const kpis = useMemo(() => buildKpis(items, year, month, now), [items, year, month, now]);
  const periodItems = useMemo(() => selectItems(items, year, month), [items, year, month]);
  const rows = useMemo(() => filterEmittedTable(periodItems, filters, dir), [periodItems, filters, dir]);

  const options = useMemo(
    () => ({
      instalacao: distinctValues(periodItems, "instalacao"),
      sistema: distinctValues(periodItems, "sistema"),
      gerencia: distinctValues(periodItems, "gerencia"),
      tipo: distinctValues(periodItems, "tipo_equipamento"),
    }),
    [periodItems]
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const periodLabel = month ? `${MONTH_NAMES[month - 1]} de ${year}` : `${year}`;
  const hasTableFilters = Object.values(filters).some(Boolean);

  function setFilter(key: keyof EmittedTableFilters) {
    return (value: string) => {
      setFilters((current) => ({ ...current, [key]: value === FILTER_ALL ? "" : value }));
      setPage(1);
    };
  }
  function selectMonth(next: number) {
    setMonth(next);
    setPage(1);
  }
  function clearAll() {
    setFilters(EMPTY_TABLE_FILTERS);
    setMonth(0);
    setPage(1);
  }

  const cards = [
    { label: "Total de equipamentos emitidos", value: kpis.totalSelected, hint: `${periodLabel} · ${kpis.distinctEquipment} equipamento(s) distinto(s)` },
    { label: "Emitidos no mês atual", value: kpis.currentMonth, hint: `${MONTH_NAMES[now.getMonth()]} de ${now.getFullYear()}` },
    { label: "Emitidos no ano", value: kpis.selectedYear, hint: `Acumulado de ${year}` },
  ];

  return (
    <section className="flex flex-col gap-4" aria-labelledby="emitted-heading">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h2 id="emitted-heading" className="text-lg font-semibold tracking-tight">Equipamentos emitidos — acompanhamento mensal</h2>
          <p className="text-sm text-muted-foreground">Cada fluxo enviado conta como uma emissão, na data do registro. Rascunhos, reprovados e removidos ficam de fora.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-96">
          <FilterSelect label="Emitidos: ano" includeLabelInAllOption={false} value={String(year)} onChange={(v) => { setYearChoice(Number(v)); setPage(1); }} options={years.map(String)} hideAll />
          <FilterSelect
            label="Emitidos: mês"
            allLabel="Todos os meses"
            includeLabelInAllOption={false}
            value={month ? String(month) : FILTER_ALL}
            onChange={(v) => selectMonth(v === FILTER_ALL ? 0 : Number(v))}
            options={MONTH_NAMES.map((_, i) => String(i + 1))}
            labels={Object.fromEntries(MONTH_NAMES.map((name, i) => [String(i + 1), name]))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="shadow-none transition-colors hover:border-primary/30">
            <CardContent className="flex items-start justify-between p-5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                {loading ? <Skeleton className="mt-2 h-7 w-12" /> : <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{card.value}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
              </div>
              <Package className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            </CardContent>
          </Card>
        ))}
        <VariationCard variation={kpis.variation} loading={loading} now={now} />
      </div>

      <Card className="shadow-none">
        <CardHeader className="pb-2">
          <CardTitle>Emissões por mês — {year}</CardTitle>
          <p className="text-sm text-muted-foreground">Clique em uma coluna para listar os equipamentos do mês.</p>
        </CardHeader>
        <CardContent className="h-72">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 20, right: 8, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ecea" vertical={false} />
                <XAxis dataKey="short" fontSize={11} stroke="#7b8580" tickLine={false} axisLine={false} />
                <YAxis fontSize={11} stroke="#7b8580" allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(14,122,75,0.06)" }}
                  formatter={(value) => [`${value}`, "Equipamentos emitidos"]}
                  labelFormatter={(_, payload) => `${payload?.[0]?.payload?.name ?? ""} de ${year}`}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry) => {
                  const clicked = (entry as unknown as { payload?: { month?: number } }).payload?.month;
                  if (clicked) selectMonth(month === clicked ? 0 : clicked);
                }}>
                  {monthly.map((bucket) => (
                    <Cell key={bucket.month} fill={month === 0 || month === bucket.month ? BAR : BAR_MUTED} />
                  ))}
                  <LabelList dataKey="total" position="top" fontSize={11} fill="#374151" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Equipamentos emitidos — {periodLabel}</CardTitle>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {loading ? "Carregando…" : `${rows.length} registro(s) encontrado(s)`}
            </p>
          </div>
          {(month !== 0 || hasTableFilters) && (
            <Button variant="outline" size="sm" onClick={clearAll}>
              <X className="h-4 w-4" /> Limpar filtros
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="relative col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                className="pl-9"
                placeholder="Buscar equipamento, Case ou responsável"
                aria-label="Buscar equipamento"
                value={filters.search}
                onChange={(e) => { setFilters((c) => ({ ...c, search: e.target.value })); setPage(1); }}
              />
            </div>
            <FilterSelect label="Emitidos: instalação" allLabel="Todas as instalações" includeLabelInAllOption={false} value={filters.instalacao || FILTER_ALL} onChange={setFilter("instalacao")} options={options.instalacao} />
            <FilterSelect label="Emitidos: sistema" allLabel="Todos os sistemas" includeLabelInAllOption={false} value={filters.sistema || FILTER_ALL} onChange={setFilter("sistema")} options={options.sistema} />
            <FilterSelect label="Emitidos: gerência" allLabel="Todas as gerências" includeLabelInAllOption={false} value={filters.gerencia || FILTER_ALL} onChange={setFilter("gerencia")} options={options.gerencia} />
            <FilterSelect label="Emitidos: tipo" allLabel="Todos os tipos" includeLabelInAllOption={false} value={filters.tipo || FILTER_ALL} onChange={setFilter("tipo")} options={options.tipo} />
          </div>

          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : rows.length === 0 ? (
            <EmptyState icon={CalendarDays} text={`Nenhum equipamento emitido em ${periodLabel}${hasTableFilters ? " com os filtros aplicados" : ""}.`} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº do registro</TableHead>
                    <TableHead>Equipamento</TableHead>
                    <TableHead className="hidden md:table-cell">Tipo</TableHead>
                    <TableHead className="hidden lg:table-cell">Instalação</TableHead>
                    <TableHead>
                      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))} aria-label={`Ordenar por data de emissão ${dir === "desc" ? "crescente" : "decrescente"}`}>
                        Emissão {dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                      </button>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Responsável</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map(({ record, dateKey }) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.recordNumber || "—"}</TableCell>
                      <TableCell className="max-w-56 truncate" title={fieldText(record, "equipamento")}>{fieldText(record, "equipamento") || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{fieldText(record, "tipo_equipamento") || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell">{fieldText(record, "instalacao") || "—"}</TableCell>
                      <TableCell className="tabular-nums">{formatCalendarDate(dateKey)}</TableCell>
                      <TableCell className="hidden md:table-cell">{record.authorName || "—"}</TableCell>
                      <TableCell><Badge variant={statusVariant[record.status]}>{statusLabels[record.status]}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Link href={`/records?record=${encodeURIComponent(record.id)}`} className="text-sm font-medium text-primary hover:underline">Abrir</Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>Página {safePage} de {pageCount}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function VariationCard({ variation, loading, now }: { variation: MonthlyVariation; loading: boolean; now: Date }) {
  const prevName = MONTH_NAMES[(now.getMonth() + 11) % 12];
  let value = "—";
  let hint = `${MONTH_NAMES[now.getMonth()]} (${variation.current}) vs ${prevName} (${variation.previous})`;
  let tone = "text-foreground";
  let Icon = Minus;
  if (variation.kind === "percent" && variation.percent !== undefined) {
    const p = variation.percent;
    value = `${p > 0 ? "+" : ""}${p.toLocaleString("pt-BR")}%`;
    tone = p > 0 ? "text-primary" : p < 0 ? "text-destructive" : "text-foreground";
    Icon = p > 0 ? TrendingUp : p < 0 ? TrendingDown : Minus;
  } else if (variation.kind === "new") {
    value = "Novo";
    hint = `Sem emissões em ${prevName}; ${variation.current} em ${MONTH_NAMES[now.getMonth()]}`;
    Icon = TrendingUp;
    tone = "text-primary";
  } else {
    value = "0%";
    hint = `Sem emissões em ${prevName} e ${MONTH_NAMES[now.getMonth()]}`;
  }
  return (
    <Card className="shadow-none transition-colors hover:border-primary/30">
      <CardContent className="flex items-start justify-between p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Variação mensal</p>
          {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className={cn("mt-2 text-3xl font-semibold tracking-tight tabular-nums", tone)}>{value}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <Icon className={cn("h-4 w-4 shrink-0", tone === "text-foreground" ? "text-primary" : tone)} aria-hidden />
      </CardContent>
    </Card>
  );
}
