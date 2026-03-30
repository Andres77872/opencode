import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { Show, For, createMemo, createResource } from "solid-js"
import { Locale } from "@/util/locale"
import { Stats } from "@/session/stats"
import { StatGrid } from "../../component/stats/stat-grid"
import { useTheme } from "../../context/theme"
import { useSource, useStats } from "./context"

function fmtCost(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`
}

function progress(pct: number, width: number) {
  const filled = Math.round((Math.max(0, pct) / 100) * width)
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, width - filled))
}

export function Overview() {
  const { theme } = useTheme()
  const stats = useStats()
  const dim = useTerminalDimensions()
  const source = useSource()
  const [overview] = createResource(() => Stats.overview(source, stats.filter))
  const [models] = createResource(() => Stats.models(source, stats.filter))
  const [tools] = createResource(() => Stats.tools(source, stats.filter))
  const wide = createMemo(() => dim().width >= 100)
  const summary = createMemo(() => {
    const item = overview()
    if (!item) return []
    return [
      { label: "Sessions", value: item.sessions.toLocaleString() },
      { label: "Messages", value: item.messages.toLocaleString() },
      { label: "Total cost", value: fmtCost(item.cost) },
      { label: "Cost/day", value: fmtCost(item.costPerDay) },
      { label: "Date range", value: item.days > 0 ? `${item.days} days` : "—" },
    ]
  })
  const tokens = createMemo(() => {
    const item = overview()
    if (!item) return []
    return [
      { label: "Input", value: Locale.number(item.tokens.input) },
      { label: "Output", value: Locale.number(item.tokens.output) },
      { label: "Reasoning", value: Locale.number(item.tokens.reasoning) },
      { label: "Cache read", value: Locale.number(item.tokens.cache.read) },
      { label: "Cache write", value: Locale.number(item.tokens.cache.write) },
    ]
  })
  const topModels = createMemo(() => {
    const items = models() ?? []
    const total = items.reduce((sum, item) => sum + item.cost, 0)
    return items.slice(0, 4).map((item) => {
      const pct = total > 0 ? (item.cost / total) * 100 : 0
      return `${item.modelID.split("/").pop() ?? item.modelID}  ${fmtCost(item.cost)} (${pct.toFixed(0)}%)`
    })
  })
  const topTools = createMemo(() =>
    (tools() ?? []).slice(0, 4).map((item) => `${item.tool}  ${item.calls.toLocaleString()} calls`),
  )
  const cacheRate = createMemo(() => {
    const item = overview()
    if (!item) return 0
    const total = item.tokens.input + item.tokens.cache.read
    return total > 0 ? (item.tokens.cache.read / total) * 100 : 0
  })

  return (
    <box flexDirection="column" gap={1}>
      <Show when={stats.loading}>
        <text fg={theme.textMuted}>Loading aggregate stats…</text>
      </Show>
      <Show when={stats.unavailable}>
        <text fg={theme.warning}>Stats unavailable: {stats.error ?? "aggregate session sync failed"}</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && (overview.loading || models.loading || tools.loading)}>
        <text fg={theme.textMuted}>Loading…</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && overview()}>
        <Show when={wide()}>
          <box flexDirection="row" gap={4}>
            <box flexDirection="column" gap={1}>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                SUMMARY
              </text>
              <StatGrid items={summary()} />
            </box>
            <box flexDirection="column" gap={1}>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                TOKENS
              </text>
              <StatGrid items={tokens()} />
            </box>
          </box>
          <box flexDirection="row" gap={4}>
            <box flexDirection="column" gap={1}>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                TOP MODELS
              </text>
              <For each={topModels()}>{(row) => <text fg={theme.text}>{row}</text>}</For>
            </box>
            <box flexDirection="column" gap={1}>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                TOP TOOLS
              </text>
              <For each={topTools()}>{(row) => <text fg={theme.text}>{row}</text>}</For>
            </box>
          </box>
        </Show>
        <Show when={!wide()}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            SUMMARY
          </text>
          <StatGrid items={summary()} />
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            TOKENS
          </text>
          <StatGrid items={tokens()} />
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            TOP MODELS
          </text>
          <For each={topModels()}>{(row) => <text fg={theme.text}>{row}</text>}</For>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            TOP TOOLS
          </text>
          <For each={topTools()}>{(row) => <text fg={theme.text}>{row}</text>}</For>
        </Show>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          CACHE EFFICIENCY
        </text>
        <text fg={theme.text}>
          Hit rate: {cacheRate().toFixed(0)}% <span style={{ fg: theme.primary }}>{progress(cacheRate(), 20)}</span>
        </text>
      </Show>
    </box>
  )
}
