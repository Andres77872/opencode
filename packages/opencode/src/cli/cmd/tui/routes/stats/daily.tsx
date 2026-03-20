import { For, Show, createMemo, createResource } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { useStats, useSource } from "./context"
import { VertChart } from "../../component/stats/vert-chart"
import { BarChart } from "../../component/stats/bar-chart"
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
  const { filter } = useStats()
  const dim = useTerminalDimensions()
  const source = useSource()

  const [data] = createResource(() => Stats.daily(source, filter))

  const wide = createMemo(() => dim().width >= 80)
  const chartW = createMemo(() => Math.max(20, Math.min(50, dim().width - 20)))

  // Reversed (oldest → newest) for charts
  const rev = createMemo(() => {
    const d = data()
    return d ? d.slice().reverse() : []
  })

  const costChart = createMemo(() => rev().map((row) => ({ label: fmtDate(row.date), value: row.cost })))

  const sessionsChart = createMemo(() => rev().map((row) => ({ label: fmtDate(row.date), value: row.sessions })))

  const userMsgChart = createMemo(() => rev().map((row) => ({ label: fmtDate(row.date), value: row.userMessages })))

  const requestsChart = createMemo(() => rev().map((row) => ({ label: fmtDate(row.date), value: row.requests })))

  const tokenChart = createMemo(() =>
    rev().map((row) => {
      const total = (Number(row.input) || 0) + (Number(row.cacheRead) || 0) + (Number(row.output) || 0)
      return {
        label: fmtDate(row.date),
        value: total,
        segments: [
          { value: Number(row.input) || 0, color: theme.primary, char: "█" },
          { value: Number(row.cacheRead) || 0, color: theme.info, char: "▓" },
          { value: Number(row.output) || 0, color: theme.success, char: "░" },
        ],
      }
    }),
  )

  const tableData = createMemo(() => {
    const d = data()
    if (!d) return []
    return d.map((row) => ({
      date: fmtDate(row.date),
      cost: fmtCost(row.cost),
      sessions: Number(row.sessions) || 0,
      userMsgs: Number(row.userMessages) || 0,
      requests: Number(row.requests) || 0,
      input: Locale.number(Number(row.input) || 0),
      cache: Locale.number(Number(row.cacheRead) || 0),
      output: Locale.number(Number(row.output) || 0),
    }))
  })

  const columns = [
    { key: "date", label: "Date", width: 8 },
    { key: "cost", label: "Cost", width: 8, align: "right" as const },
    { key: "sessions", label: "Sessions", width: 8, align: "right" as const },
    { key: "userMsgs", label: "UserMsgs", width: 8, align: "right" as const },
    { key: "requests", label: "Requests", width: 8, align: "right" as const },
    { key: "input", label: "Input", width: 8, align: "right" as const },
    { key: "cache", label: "Cache", width: 8, align: "right" as const },
    { key: "output", label: "Output", width: 8, align: "right" as const },
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
        {/* Section 1: Daily Cost */}
        <Show when={wide()}>
          <text fg={theme.primary} attributes={TextAttributes.BOLD}>
            DAILY COST
          </text>
          <VertChart data={costChart()} height={8} />
        </Show>

        {/* Section 2: Daily Sessions */}
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          DAILY SESSIONS
        </text>
        <BarChart data={sessionsChart()} width={chartW()} valueFormat={(n) => String(Number(n) || 0)} />

        {/* Section 3: Daily User Messages */}
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          DAILY USER MESSAGES
        </text>
        <BarChart data={userMsgChart()} width={chartW()} valueFormat={(n) => String(Number(n) || 0)} />

        {/* Section 4: Daily Requests */}
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          DAILY REQUESTS
        </text>
        <BarChart data={requestsChart()} width={chartW()} valueFormat={(n) => String(Number(n) || 0)} />

        {/* Section 5: Daily Tokens (stacked) */}
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          DAILY TOKENS
        </text>
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.primary }}>█</span> Input{"  "}
          <span style={{ fg: theme.info }}>▓</span> Cache read{"  "}
          <span style={{ fg: theme.success }}>░</span> Output
        </text>
        <BarChart data={tokenChart()} width={chartW()} valueFormat={fmtK} />

        {/* Section 6: Daily Breakdown Table */}
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          DAILY BREAKDOWN
        </text>
        <StatTable columns={columns} data={tableData() as Record<string, unknown>[]} />
      </Show>
    </box>
  )
}
