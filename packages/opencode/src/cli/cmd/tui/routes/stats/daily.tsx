import { Show, createMemo, createResource } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { useStats, useSource } from "./context"
import { BarChart } from "../../component/stats/bar-chart"
import { StatGrid } from "../../component/stats/stat-grid"
import { StatTable } from "../../component/stats/stat-table"
import { Stats } from "../../../../../session/stats"
import { Locale } from "@/util/locale"

function fmtDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function fmtCost(n: number): string {
  return "$" + (Number(n) || 0).toFixed(2)
}

function fmtK(n: number): string {
  const v = Number(n) || 0
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M"
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K"
  return v.toString()
}

export function Daily() {
  const { theme } = useTheme()
  const stats = useStats()
  const dim = useTerminalDimensions()
  const source = useSource()

  const [data] = createResource(
    () => stats.filter,
    (f) => Stats.daily(source, f),
  )

  const wide = createMemo(() => dim().width >= 80)
  const chartW = createMemo(() => Math.max(20, Math.min(60, dim().width - 16)))

  // Oldest → newest for charts (chronological order)
  const rev = createMemo(() => {
    const d = data()
    return d ? d.slice().reverse() : []
  })

  // Aggregated totals for the summary grid
  const totals = createMemo(() => {
    const d = data()
    if (!d || d.length === 0) return null
    const cost = d.reduce((s, r) => s + (Number(r.cost) || 0), 0)
    const sessions = d.reduce((s, r) => s + (Number(r.sessions) || 0), 0)
    const msgs = d.reduce((s, r) => s + (Number(r.messages) || 0), 0)
    const requests = d.reduce((s, r) => s + (Number(r.requests) || 0), 0)
    const input = d.reduce((s, r) => s + (Number(r.input) || 0), 0)
    const cache = d.reduce((s, r) => s + (Number(r.cacheRead) || 0), 0)
    const output = d.reduce((s, r) => s + (Number(r.output) || 0), 0)
    const tokens = input + cache + output
    const days = d.length
    return { cost, sessions, msgs, requests, tokens, days, avgCost: days > 0 ? cost / days : 0 }
  })

  const summary = createMemo(() => {
    const t = totals()
    if (!t) return []
    return [
      { label: "Total cost", value: fmtCost(t.cost) },
      { label: "Sessions", value: Locale.number(t.sessions) },
      { label: "Messages", value: Locale.number(t.msgs) },
      { label: "Requests", value: Locale.number(t.requests) },
      { label: "Tokens", value: fmtK(t.tokens) },
      { label: "Avg cost/day", value: fmtCost(t.avgCost) },
    ]
  })

  // Activity chart — sessions per day
  const activity = createMemo(() => rev().map((r) => ({ label: fmtDate(r.date), value: Number(r.sessions) || 0 })))

  // Token chart — stacked input/cache/output
  const tokens = createMemo(() =>
    rev().map((r) => {
      const input = Number(r.input) || 0
      const cache = Number(r.cacheRead) || 0
      const output = Number(r.output) || 0
      return {
        label: fmtDate(r.date),
        value: input + cache + output,
        segments: [
          { value: input, color: theme.primary, char: "█" },
          { value: cache, color: theme.info, char: "▓" },
          { value: output, color: theme.success, char: "░" },
        ],
      }
    }),
  )

  const tableData = createMemo(() => {
    const d = data()
    if (!d) return []
    return d.map((r) => ({
      date: fmtDate(r.date),
      cost: fmtCost(r.cost),
      sessions: Number(r.sessions) || 0,
      msgs: Number(r.messages) || 0,
      requests: Number(r.requests) || 0,
      input: Locale.number(Number(r.input) || 0),
      cache: Locale.number(Number(r.cacheRead) || 0),
      output: Locale.number(Number(r.output) || 0),
    }))
  })

  const columns = [
    { key: "date", label: "Date", width: 8 },
    { key: "cost", label: "Cost", width: 8, align: "right" as const },
    { key: "sessions", label: "Sess", width: 5, align: "right" as const },
    { key: "msgs", label: "Msgs", width: 5, align: "right" as const },
    { key: "requests", label: "Reqs", width: 5, align: "right" as const },
    { key: "input", label: "Input", width: 10, align: "right" as const },
    { key: "cache", label: "Cache", width: 10, align: "right" as const },
    { key: "output", label: "Output", width: 10, align: "right" as const },
  ]

  return (
    <box flexDirection="column" gap={1}>
      <Show when={data.loading}>
        <text fg={theme.textMuted}>Loading…</text>
      </Show>
      <Show when={!data.loading && (!data() || data()!.length === 0)}>
        <text fg={theme.textMuted}>No daily data available</text>
      </Show>
      <Show when={!data.loading && data() && data()!.length > 0}>
        {/* Section 1: Summary */}
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          SUMMARY
        </text>
        <StatGrid items={summary()} columns={wide() ? 2 : 1} labelWidth={14} />

        {/* Section 2: Activity (sessions per day) */}
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          ACTIVITY
        </text>
        <BarChart data={activity()} width={chartW()} valueFormat={(n) => String(Number(n) || 0)} />

        {/* Section 3: Tokens (stacked: input / cache / output) */}
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          TOKENS{"  "}
          <span style={{ fg: theme.primary }}>█</span>
          <span style={{ fg: theme.textMuted }}> Input </span>
          <span style={{ fg: theme.info }}>▓</span>
          <span style={{ fg: theme.textMuted }}> Cache </span>
          <span style={{ fg: theme.success }}>░</span>
          <span style={{ fg: theme.textMuted }}> Output</span>
        </text>
        <BarChart data={tokens()} width={chartW()} valueFormat={fmtK} />

        {/* Section 4: Daily Breakdown Table */}
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          BREAKDOWN
        </text>
        <StatTable columns={columns} data={tableData() as Record<string, unknown>[]} />
      </Show>
    </box>
  )
}
