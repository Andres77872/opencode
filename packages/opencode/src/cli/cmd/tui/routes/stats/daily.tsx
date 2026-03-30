import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { Show, createMemo, createResource } from "solid-js"
import { Locale } from "@/util/locale"
import { Stats } from "@/session/stats"
import { BarChart } from "../../component/stats/bar-chart"
import { StatGrid } from "../../component/stats/stat-grid"
import { StatTable } from "../../component/stats/stat-table"
import { useTheme } from "../../context/theme"
import { useSource, useStats } from "./context"

function fmtDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function fmtCost(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`
}

function fmtK(n: number) {
  const value = Number(n) || 0
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M"
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K"
  return value.toString()
}

export function Daily() {
  const { theme } = useTheme()
  const stats = useStats()
  const dim = useTerminalDimensions()
  const source = useSource()
  const [data] = createResource(() => Stats.daily(source, stats.filter))
  const wide = createMemo(() => dim().width >= 80)
  const chartW = createMemo(() => Math.max(20, Math.min(60, dim().width - 16)))
  const rev = createMemo(() => (data() ? data()!.slice().reverse() : []))
  const totals = createMemo(() => {
    const items = data()
    if (!items?.length) return
    const cost = items.reduce((sum, item) => sum + item.cost, 0)
    const sessions = items.reduce((sum, item) => sum + item.sessions, 0)
    const messages = items.reduce((sum, item) => sum + item.messages, 0)
    const requests = items.reduce((sum, item) => sum + item.requests, 0)
    const tokens = items.reduce((sum, item) => sum + item.input + item.cacheRead + item.output, 0)
    return { cost, sessions, messages, requests, tokens, days: items.length, avgCost: cost / items.length }
  })
  const summary = createMemo(() => {
    const item = totals()
    if (!item) return []
    return [
      { label: "Total cost", value: fmtCost(item.cost) },
      { label: "Sessions", value: Locale.number(item.sessions) },
      { label: "Messages", value: Locale.number(item.messages) },
      { label: "Requests", value: Locale.number(item.requests) },
      { label: "Tokens", value: fmtK(item.tokens) },
      { label: "Avg cost/day", value: fmtCost(item.avgCost) },
    ]
  })
  const activity = createMemo(() => rev().map((item) => ({ label: fmtDate(item.date), value: item.sessions || 0 })))
  const tokens = createMemo(() =>
    rev().map((item) => ({
      label: fmtDate(item.date),
      value: item.input + item.cacheRead + item.output,
      segments: [
        { value: item.input, color: theme.primary, char: "█" },
        { value: item.cacheRead, color: theme.info, char: "▓" },
        { value: item.output, color: theme.success, char: "░" },
      ],
    })),
  )
  const rows = createMemo(() =>
    (data() ?? []).map((item) => ({
      date: fmtDate(item.date),
      cost: fmtCost(item.cost),
      sessions: item.sessions,
      msgs: item.messages,
      requests: item.requests,
      input: Locale.number(item.input),
      cache: Locale.number(item.cacheRead),
      output: Locale.number(item.output),
    })),
  )

  return (
    <box flexDirection="column" gap={1}>
      <Show when={stats.loading}>
        <text fg={theme.textMuted}>Loading aggregate stats…</text>
      </Show>
      <Show when={stats.unavailable}>
        <text fg={theme.warning}>Stats unavailable: {stats.error ?? "aggregate session sync failed"}</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && data.loading}>
        <text fg={theme.textMuted}>Loading…</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && !data.loading && (!data() || data()!.length === 0)}>
        <text fg={theme.textMuted}>No daily data available</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && data() && data()!.length > 0}>
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          SUMMARY
        </text>
        <StatGrid items={summary()} columns={wide() ? 2 : 1} labelWidth={14} />
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          ACTIVITY
        </text>
        <BarChart data={activity()} width={chartW()} valueFormat={(n) => String(Number(n) || 0)} />
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          TOKENS <span style={{ fg: theme.primary }}>█</span>
          <span style={{ fg: theme.textMuted }}> Input </span>
          <span style={{ fg: theme.info }}>▓</span>
          <span style={{ fg: theme.textMuted }}> Cache </span>
          <span style={{ fg: theme.success }}>░</span>
          <span style={{ fg: theme.textMuted }}> Output</span>
        </text>
        <BarChart data={tokens()} width={chartW()} valueFormat={fmtK} />
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          BREAKDOWN
        </text>
        <StatTable
          columns={[
            { key: "date", label: "Date", width: 8 },
            { key: "cost", label: "Cost", width: 8, align: "right" },
            { key: "sessions", label: "Sess", width: 5, align: "right" },
            { key: "msgs", label: "Msgs", width: 5, align: "right" },
            { key: "requests", label: "Reqs", width: 5, align: "right" },
            { key: "input", label: "Input", width: 10, align: "right" },
            { key: "cache", label: "Cache", width: 10, align: "right" },
            { key: "output", label: "Output", width: 10, align: "right" },
          ]}
          data={rows() as Record<string, unknown>[]}
        />
      </Show>
    </box>
  )
}
