import { useTerminalDimensions } from "@opentui/solid"
import { Show, createResource } from "solid-js"
import { Stats } from "@/session/stats"
import { BarChart } from "../../component/stats/bar-chart"
import { StatTable } from "../../component/stats/stat-table"
import { useTheme } from "../../context/theme"
import { useSource, useStats } from "./context"

export function Tools() {
  const { theme } = useTheme()
  const stats = useStats()
  const dim = useTerminalDimensions()
  const source = useSource()
  const [data] = createResource(() => Stats.tools(source, stats.filter))

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
      <Show when={!stats.loading && !stats.unavailable && (!data() || data()!.length === 0)}>
        <text fg={theme.textMuted}>No tool data available</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && data() && data()!.length > 0}>
        <text fg={theme.text}>TOOL USAGE</text>
        <StatTable
          columns={[
            { key: "tool", label: "Tool" },
            { key: "calls", label: "Calls", align: "right" },
            { key: "errors", label: "Errors", align: "right" },
            { key: "errRate", label: "Err%", align: "right" },
            { key: "avgMs", label: "Avg ms", align: "right" },
            { key: "totalTime", label: "Total time", align: "right" },
          ]}
          data={
            data()!.map((item) => ({
              tool: item.tool,
              calls: item.calls.toLocaleString(),
              errors: item.errors.toLocaleString(),
              errRate: `${(item.errorRate * 100).toFixed(1)}%`,
              avgMs: `${item.avgMs}ms`,
              totalTime: `${(item.totalMs / 60000).toFixed(1)}min`,
            })) as Record<string, unknown>[]
          }
        />
        <Show when={dim().height >= 30 && dim().width >= 80}>
          <text fg={theme.text}>FREQUENCY CHART</text>
          <BarChart
            data={data()!
              .slice(0, 10)
              .map((item) => ({ label: item.tool, value: item.calls }))}
          />
        </Show>
      </Show>
    </box>
  )
}
