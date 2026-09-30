"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LabelProps } from "recharts";
import { distributionScale, formatDistributionPercentage, type DistributionDatum } from "@/lib/dashboard-distributions";

function CategoryTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const name = payload?.value ?? "";
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{name}</title>
      <text y={18} textAnchor="middle" fill="var(--muted-foreground)" fontSize={12}>
        {name.length > 16 ? `${name.slice(0, 15)}…` : name}
      </text>
    </g>
  );
}

function ValueLabel({ viewBox, value, totalRecords }: LabelProps & { totalRecords: number }) {
  if (!viewBox || !("x" in viewBox) || !("width" in viewBox) || typeof value !== "number") return null;
  const x = Number(viewBox.x) + Number(viewBox.width) / 2;
  const y = Number(viewBox.y);
  return (
    <text x={x} y={y - 28} textAnchor="middle" className="tabular-nums" pointerEvents="none">
      <tspan x={x} fill="var(--foreground)" fontSize={14} fontWeight={600}>{value.toLocaleString("pt-BR")}</tspan>
      <tspan x={x} dy={18} fill="var(--muted-foreground)" fontSize={12}>
        {formatDistributionPercentage(totalRecords ? value / totalRecords * 100 : 0)}
      </tspan>
    </text>
  );
}

function DistributionTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: DistributionDatum }> }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div role="tooltip" className="max-w-64 break-words rounded-lg border border-border bg-card p-3 text-sm shadow-md">
      <p className="font-medium">{item.name}</p>
      <p className="mt-1 tabular-nums">{item.total.toLocaleString("pt-BR")} {item.total === 1 ? "registro" : "registros"}</p>
      <p className="text-muted-foreground tabular-nums">{formatDistributionPercentage(item.percentage)} do total</p>
    </div>
  );
}

export function DistributionChart({ data, totalRecords, label }: { data: DistributionDatum[]; totalRecords: number; label: string }) {
  const { ceiling, ticks } = distributionScale(data);
  return (
    <div className="min-w-0">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Distribuição por {label}</h3>
        <p className="text-xs text-muted-foreground tabular-nums">{totalRecords.toLocaleString("pt-BR")} registros filtrados</p>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">Quantidade de registros</p>
      <div role="region" aria-label={`Gráfico de distribuição por ${label}; role horizontalmente para ver todas as categorias`} tabIndex={0} className="max-w-full overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
        <div className="h-[350px] w-full md:h-[400px] lg:h-[480px]" style={{ minWidth: data.length * 128 + 72 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 40, right: 16, bottom: 12, left: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis dataKey="name" interval={0} height={48} tick={<CategoryTick />} tickLine={false} axisLine={false} />
              <YAxis domain={[0, ceiling]} ticks={ticks} allowDecimals={false} width={56} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(value: number) => value.toLocaleString("pt-BR")} />
              <Tooltip content={<DistributionTooltip />} cursor={{ fill: "var(--primary-50)" }} isAnimationActive={false} />
              <Bar dataKey="total" name="Registros" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                <LabelList dataKey="total" content={<ValueLabel totalRecords={totalRecords} />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {data.length > 1 && <p className="mt-2 text-xs text-muted-foreground">Deslize horizontalmente para ver mais categorias, quando necessário.</p>}
    </div>
  );
}
