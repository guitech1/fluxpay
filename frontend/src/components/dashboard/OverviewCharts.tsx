"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export interface DailyPoint {
  date: string;
  amount: number;
  count: number;
}

const axis = { stroke: "#6B7280", fontSize: 12 };

export function OverviewCharts({ data }: { data: DailyPoint[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card">
        <h2 className="font-medium mb-1">Volume aprovado</h2>
        <p className="text-sm text-flux-muted mb-4">Últimos 14 dias</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="fluxArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" vertical={false} />
              <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} />
              <YAxis
                tick={axis}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatCurrency(v).replace(/\s/g, " ")}
                width={90}
              />
              <Tooltip
                contentStyle={{
                  background: "#111111",
                  border: "1px solid #2E2E2E",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [formatCurrency(value), "Aprovado"]}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#EF4444"
                strokeWidth={2}
                fill="url(#fluxArea)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2 className="font-medium mb-1">Transações por dia</h2>
        <p className="text-sm text-flux-muted mb-4">Todas as tentativas, aprovadas ou não</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2E2E2E" vertical={false} />
              <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
              <Tooltip
                contentStyle={{
                  background: "#111111",
                  border: "1px solid #2E2E2E",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [value, "Transações"]}
              />
              <Bar dataKey="count" fill="#EF4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
