import { Show, createResource } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { useStats, useSource } from "./context"
import { StatTable } from "../../component/stats/stat-table"
import { BarChart } from "../../component/stats/bar-chart"
import { Stats } from "../../../../../session/stats"

function formatCalls(n: number): string {
  return (Number(n) || 0).toLocaleString()
}

function formatErrRate(n: number): string {
  return ((Number(n) || 0) * 100).toFixed(1) + "%"
}

function formatMs(n: number): string {
  return (Number(n) || 0) + "ms"
}

function formatTotalMs(n: number): string {
  return ((Number(n) || 0) / 60000).toFixed(1) + "min"
}

export function Tools() {
  const { theme } = useTheme()
  const { filter } = useStats()
  const dim = useTerminalDimensions()
  const source = useSource()

  const [data] = createResource(() => Stats.tools(source, filter))

  const showChart = () => dim().height >= 30 && dim().width >= 80

  const tableData = () => {
    const d = data()
    if (!d) return []
    return d.map((row) => ({
      tool: row.tool,
      calls: formatCalls(row.calls),
      errors: formatCalls(row.errors),
      errRate: formatErrRate(row.errorRate),
      avgMs: formatMs(row.avgMs),
      totalTime: formatTotalMs(row.totalMs),
    }))
  }

  const chartData = () => {
    const d = data()
    if (!d) return []
    return d.slice(0, 10).map((row) => ({
      label: row.tool,
      value: row.calls,
    }))
  }

  const columns = [
    { key: "tool", label: "Tool" },
    { key: "calls", label: "Calls", align: "right" as const },
    { key: "errors", label: "Errors", align: "right" as const },
    { key: "errRate", label: "Err%", align: "right" as const },
    { key: "avgMs", label: "Avg ms", align: "right" as const },
    { key: "totalTime", label: "Total time", align: "right" as const },
  ]

  return (
    <box flexDirection="column" gap={1}>
      <Show when={data.loading}>
        <text fg={theme.textMuted}>Loading…</text>
      </Show>
      <Show when={!data.loading && (!data() || data()!.length === 0)}>
        <text fg={theme.textMuted}>No tool data available</text>
      </Show>
      <Show when={!data.loading && data() && data()!.length > 0}>
        <text fg={theme.text}>TOOL USAGE</text>
        <StatTable columns={columns} data={tableData() as Record<string, unknown>[]} />
        <Show when={showChart()}>
          <text fg={theme.text}>FREQUENCY CHART</text>
          <BarChart data={chartData()} />
        </Show>
      </Show>
    </box>
  )
}
