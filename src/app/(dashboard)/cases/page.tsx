"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, query, where } from "firebase/firestore";
import { BriefcaseBusiness, CalendarDays, ChevronDown, Database, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { recordsCol, setRecordCase } from "@/lib/firestore-helpers";
import { canEditRecord } from "@/lib/access-policy";
import { recordDataSources } from "@/lib/data-source";
import { DEFAULT_FORM_ID, fieldValue, formatRecordDate, getFirebaseErrorMessage, logFirestoreError, recordDateKey, statusLabels } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import type { AppRecord, FormDefinition, FormField } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/ui/filter-select";
import { SelectItem } from "@/components/ui/select";
import { HISTORY_FILTER_SELECT_CLASS, HistoryFilterField } from "@/components/records/history-filter-parts";
import { CaseCheckbox } from "@/components/records/case-checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

const ALL = "todos";
const CASES_FILTERS_STORAGE_KEY = "cases-filters-v1";

interface PersistedCasesFilters {
  search: string;
  status: string;
  responsavel: string;
  gerencia: string;
  instalacao: string;
  sistema: string;
  equipamento: string;
  dataSource: string;
  dateFrom: string;
  dateTo: string;
}

function normalizeFieldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function distinctFieldValues(records: AppRecord[], key: string): string[] {
  return Array.from(new Set(records.map((r) => fieldValue(r, key)).filter(Boolean))).sort();
}

function DataSourceInfo({ value }: { value?: string }) {
  return (
    <div className="w-full min-w-0 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2.5">
      <p className="text-xs font-semibold text-primary">Fonte de Dados</p>
      <div className="mt-1 flex min-w-0 items-start gap-2 text-sm">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <strong className="min-w-0 break-words font-semibold leading-snug">{value || "Não informado"}</strong>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Dados informados no formulário</p>
    </div>
  );
}

export default function CasesPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [responsavelFilter, setResponsavelFilter] = useState<string>(ALL);
  const [gerenciaFilter, setGerenciaFilter] = useState<string>(ALL);
  const [instalacaoFilter, setInstalacaoFilter] = useState<string>(ALL);
  const [sistemaFilter, setSistemaFilter] = useState<string>(ALL);
  const [equipamentoFilter, setEquipamentoFilter] = useState<string>(ALL);
  const [dataSourceFilter, setDataSourceFilter] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersRestored, setFiltersRestored] = useState(false);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const stored = sessionStorage.getItem(CASES_FILTERS_STORAGE_KEY);
        if (!stored) return;
        const filters = JSON.parse(stored) as Partial<PersistedCasesFilters>;
        const restoreString = (value: unknown, setter: (next: string) => void) => {
          if (typeof value === "string") setter(value);
        };
        restoreString(filters.search, setSearch);
        restoreString(filters.status, setStatusFilter);
        restoreString(filters.responsavel, setResponsavelFilter);
        restoreString(filters.gerencia, setGerenciaFilter);
        restoreString(filters.instalacao, setInstalacaoFilter);
        restoreString(filters.sistema, setSistemaFilter);
        restoreString(filters.equipamento, setEquipamentoFilter);
        restoreString(filters.dataSource, setDataSourceFilter);
        restoreString(filters.dateFrom, setDateFrom);
        restoreString(filters.dateTo, setDateTo);
        if (
          [filters.status, filters.responsavel, filters.gerencia, filters.instalacao, filters.sistema, filters.equipamento, filters.dataSource]
            .some((value) => typeof value === "string" && value !== ALL) ||
          Boolean(filters.dateFrom || filters.dateTo)
        ) {
          setFiltersOpen(true);
        }
      } catch {
        sessionStorage.removeItem(CASES_FILTERS_STORAGE_KEY);
      } finally {
        setFiltersRestored(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!filtersRestored) return;
    const filters: PersistedCasesFilters = {
      search,
      status: statusFilter,
      responsavel: responsavelFilter,
      gerencia: gerenciaFilter,
      instalacao: instalacaoFilter,
      sistema: sistemaFilter,
      equipamento: equipamentoFilter,
      dataSource: dataSourceFilter,
      dateFrom,
      dateTo,
    };
    const hasPersistedCriteria = Boolean(
      search || dateFrom || dateTo ||
      [statusFilter, responsavelFilter, gerenciaFilter, instalacaoFilter, sistemaFilter, equipamentoFilter, dataSourceFilter]
        .some((value) => value !== ALL)
    );
    if (hasPersistedCriteria) {
      sessionStorage.setItem(CASES_FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } else {
      sessionStorage.removeItem(CASES_FILTERS_STORAGE_KEY);
    }
  }, [filtersRestored, search, statusFilter, responsavelFilter, gerenciaFilter, instalacaoFilter, sistemaFilter, equipamentoFilter, dataSourceFilter, dateFrom, dateTo]);

  useEffect(() => {
    return onSnapshot(doc(db, "formFields", DEFAULT_FORM_ID), (snapshot) => {
      if (!snapshot.exists()) {
        setFormFields([]);
        return;
      }
      const form = snapshot.data() as FormDefinition;
      setFormFields(form.fields || []);
    });
  }, []);

  const dataSourceFieldKey = formFields.find((item) => normalizeFieldName(item.label) === "fonte_de_dados")?.key;

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(recordsCol(), where("isCase", "==", true)),
      (snapshot) => {
        const cases = snapshot.docs
          .map((item) => item.data())
          .filter((record) => !record.deletedAt)
          .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
        setRecords(cases);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        logFirestoreError({ fn: "CasesPage:load" }, snapshotError);
        setError(getFirebaseErrorMessage(snapshotError, "Não foi possível carregar os Cases."));
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const responsaveis = useMemo(() => Array.from(new Set(records.map((r) => r.authorName).filter(Boolean))) as string[], [records]);
  const gerencias = useMemo(() => distinctFieldValues(records, "gerencia"), [records]);
  const instalacoes = useMemo(() => distinctFieldValues(records, "instalacao"), [records]);
  const sistemas = useMemo(() => distinctFieldValues(records, "sistema"), [records]);
  const equipamentos = useMemo(() => distinctFieldValues(records, "equipamento"), [records]);
  const dataSources = useMemo(
    () => Array.from(new Set(records.flatMap((record) => recordDataSources(record, formFields))))
      .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    [records, formFields]
  );

  const filtered = useMemo(() => {
    let list = records;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((r) =>
        [
          r.recordNumber,
          fieldValue(r, "instalacao"),
          fieldValue(r, "sistema"),
          fieldValue(r, "equipamento"),
          fieldValue(r, "gerencia"),
          r.authorName,
          statusLabels[r.status],
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s))
      );
    }
    if (statusFilter !== ALL) list = list.filter((r) => r.status === statusFilter);
    if (responsavelFilter !== ALL) list = list.filter((r) => r.authorName === responsavelFilter);
    if (gerenciaFilter !== ALL) list = list.filter((r) => fieldValue(r, "gerencia") === gerenciaFilter);
    if (instalacaoFilter !== ALL) list = list.filter((r) => fieldValue(r, "instalacao") === instalacaoFilter);
    if (sistemaFilter !== ALL) list = list.filter((r) => fieldValue(r, "sistema") === sistemaFilter);
    if (equipamentoFilter !== ALL) list = list.filter((r) => fieldValue(r, "equipamento") === equipamentoFilter);
    if (dataSourceFilter !== ALL) list = list.filter((r) => recordDataSources(r, formFields).includes(dataSourceFilter));
    if (dateFrom || dateTo) {
      list = list.filter((r) => {
        const date = recordDateKey(r, formFields);
        return !!date && (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
      });
    }
    return list;
  }, [records, search, statusFilter, responsavelFilter, gerenciaFilter, instalacaoFilter, sistemaFilter, equipamentoFilter, dataSourceFilter, dateFrom, dateTo, formFields]);

  function clearFilters() {
    sessionStorage.removeItem(CASES_FILTERS_STORAGE_KEY);
    setSearch("");
    setStatusFilter(ALL);
    setResponsavelFilter(ALL);
    setGerenciaFilter(ALL);
    setInstalacaoFilter(ALL);
    setSistemaFilter(ALL);
    setEquipamentoFilter(ALL);
    setDataSourceFilter(ALL);
    setDateFrom("");
    setDateTo("");
  }

  const activeFilterCount = [statusFilter, responsavelFilter, gerenciaFilter, instalacaoFilter, sistemaFilter, equipamentoFilter, dataSourceFilter]
    .filter((value) => value !== ALL).length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);
  const hasActiveCriteria = Boolean(search || activeFilterCount > 0);

  function canChange(record: AppRecord): boolean {
    return canEditRecord(profile, user?.uid, record);
  }

  async function unmarkCase(record: AppRecord) {
    if (!canChange(record) || updatingIds.has(record.id)) return;
    setUpdatingIds((current) => new Set(current).add(record.id));
    setRecords((current) => current.filter((item) => item.id !== record.id));
    try {
      await setRecordCase(record, false, {
        uid: user?.uid,
        name: profile?.name || user?.email || undefined,
        role: profile?.role,
      });
      toast.success("Fluxo removido dos Cases.");
    } catch (updateError) {
      setRecords((current) => current.some((item) => item.id === record.id) ? current : [...current, record]);
      logFirestoreError({ fn: "CasesPage:unmarkCase", payload: { recordId: record.id } }, updateError);
      toast.error(getFirebaseErrorMessage(updateError, "Não foi possível atualizar o Case."));
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(record.id);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
        <p className="text-sm text-muted-foreground">Fluxos marcados para acompanhamento.</p>
      </div>

      <Card className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">Total de Cases</p>
          <p className="mt-1 text-2xl font-semibold">{records.length}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><BriefcaseBusiness className="h-5 w-5" /></div>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <Input
              className="h-12 rounded-xl border-[#E2E8F0] bg-white pl-11 pr-4 shadow-sm placeholder:text-[#64748B] focus-visible:border-primary focus-visible:ring-primary/20"
              placeholder="Buscar por ID, instalação, sistema, equipamento, gerência, responsável ou status..."
              aria-label="Buscar nos Cases"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            className="h-12 min-w-36 justify-between rounded-xl border-primary-100 bg-primary-50 px-4 text-primary-800 shadow-none hover:bg-primary-100"
            variant="outline"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="cases-filters-panel"
          >
            <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Filtros</span>
            {activeFilterCount > 0 && (
              <span className="rounded-md border border-primary-100 bg-white px-1.5 py-0.5 text-xs leading-none text-primary-700">{activeFilterCount}</span>
            )}
            <ChevronDown className={cn("h-4 w-4 text-primary-700 transition-transform motion-reduce:transition-none", filtersOpen && "rotate-180")} />
          </Button>
        </div>

        {filtersOpen && (
          <section id="cases-filters-panel" aria-label="Filtros dos Cases" className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm sm:p-5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-x-4 gap-y-4">
              <HistoryFilterField label="Status">
                <FilterSelect label="Status" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={statusFilter} onChange={setStatusFilter}>
                  {Object.entries(statusLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Responsável">
                <FilterSelect label="Responsável" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={responsavelFilter} onChange={setResponsavelFilter}>
                  {responsaveis.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Gerência">
                <FilterSelect label="Gerência" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={gerenciaFilter} onChange={setGerenciaFilter}>
                  {gerencias.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Instalação">
                <FilterSelect label="Instalação" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={instalacaoFilter} onChange={setInstalacaoFilter}>
                  {instalacoes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Sistema">
                <FilterSelect label="Sistema" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={sistemaFilter} onChange={setSistemaFilter}>
                  {sistemas.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Equipamento">
                <FilterSelect label="Equipamento" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={equipamentoFilter} onChange={setEquipamentoFilter}>
                  {equipamentos.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Fonte de Dados">
                <FilterSelect label="Fonte de Dados" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={dataSourceFilter} onChange={setDataSourceFilter}>
                  {dataSources.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
            </div>

            <div className="mt-5 flex flex-col gap-4 border-t border-[#E2E8F0] pt-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-[#F6F8FA] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#243247]">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <span>Período</span>
                </div>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
                  <div className="relative min-w-0">
                    <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <Input id="cases-date-from" aria-label="Data inicial do período" lang="pt-BR" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Período de" className="h-11 rounded-xl border-[#E2E8F0] bg-white pl-10 shadow-none" />
                  </div>
                  <span className="text-center text-sm text-[#64748B]">até</span>
                  <div className="relative min-w-0">
                    <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <Input id="cases-date-to" aria-label="Data final do período" lang="pt-BR" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Período até" className="h-11 rounded-xl border-[#E2E8F0] bg-white pl-10 shadow-none" />
                  </div>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasActiveCriteria} className="h-11 w-full rounded-xl border-[#E2E8F0] bg-white px-4 text-[#243247] shadow-none hover:bg-[#F6F8FA] lg:w-auto">
                <RotateCcw className="h-4 w-4 text-[#64748B]" />
                Limpar Filtros
              </Button>
            </div>
          </section>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-52 w-full" />)}
        </div>
      ) : error ? (
        <Card className="p-12 text-center text-sm text-destructive">{error}</Card>
      ) : records.length === 0 ? (
        <EmptyState icon={BriefcaseBusiness} text={'Nenhum Case encontrado. Marque a opção "Case" em um fluxo para ele aparecer aqui.'} className="p-12" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} text="Nenhum Case encontrado para os filtros selecionados." className="p-12" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((record) => (
            <Card key={record.id} className="flex cursor-pointer flex-col gap-4 p-5 transition-colors hover:border-primary/40" onClick={() => router.push(`/records?record=${record.id}&returnTo=${encodeURIComponent("/cases")}`)}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs text-muted-foreground">Fluxo</p><h2 className="font-semibold">{record.recordNumber || record.id}</h2></div>
                <StatusBadge status={record.status} />
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{fieldValue(record, "equipamento") || fieldValue(record, "sistema") || "Fluxo sem título"}</p>
                <p className="text-muted-foreground">{fieldValue(record, "instalacao") || "Instalação não informada"}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{record.authorName || "Sem responsável"}</Badge>
                <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatRecordDate(record, formFields)}</span>
                {record.updatedAt && <span>Atualizado: {new Date(record.updatedAt).toLocaleDateString("pt-BR")}</span>}
              </div>
              <DataSourceInfo value={dataSourceFieldKey ? fieldValue(record, dataSourceFieldKey) : undefined} />
              <div onClick={(event) => event.stopPropagation()}>
                {canChange(record) ? (
                  <CaseCheckbox checked disabled={updatingIds.has(record.id)} recordLabel={record.recordNumber || record.id} onCheckedChange={(checked) => { if (!checked) unmarkCase(record); }} />
                ) : <span>CASE</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
