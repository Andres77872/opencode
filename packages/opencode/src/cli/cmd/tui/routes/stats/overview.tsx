import { For, Show, createMemo, createResource } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { useStats, useSource } from "./context"
import { StatGrid } from "../../component/stats/stat-grid"
import { Stats } from "../../../../../session/stats"
import { Locale } from "../../../../../util/locale"

function fmtCost(n: number): string {
  return "$" + (Number(n) || 0).toFixed(2)
}

function progress(pct: number, width: number): string {
  const p = Number(pct) || 0
  const filled = Math.round((p / 100) * width)
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, width - filled))
}

export function Overview() {
  const { theme } = useTheme()
  const { filter } = useStats()
  const dim = useTerminalDimensions()
  const source = useSource()

  const [overview] = createResource(() => Stats.overview(source, filter))
  const [models] = createResource(() => Stats.models(source, filter))
  const [tools] = createResource(() => Stats.tools(source, filter))

  const wide = createMemo(() => dim().width >= 100)

  const summary = createMemo(() => {
    const d = overview()
    if (!d) return []
    const range = d.days > 0 ? `${d.days} days` : "—"
    return [
      { label: "Sessions", value: d.sessions.toLocaleString() },
      { label: "Messages", value: d.messages.toLocaleString() },
      { label: "Total cost", value: fmtCost(d.cost) },
      { label: "Cost/day", value: fmtCost(d.costPerDay) },
      { label: "Date range", value: range },
    ]
  })

  const tokens = createMemo(() => {
    const d = overview()
    if (!d) return []
    return [
      { label: "Input", value: Locale.number(d.tokens.input) },
      { label: "Output", value: Locale.number(d.tokens.output) },
      { label: "Reasoning", value: Locale.number(d.tokens.reasoning) },
      { label: "Cache read", value: Locale.number(d.tokens.cache.read) },
      { label: "Cache write", value: Locale.number(d.tokens.cache.write) },
    ]
  })

  const topModels = createMemo(() => {
    const d = models()
    if (!d) return []
    const total = d.reduce((sum, m) => sum + m.cost, 0)
    return d.slice(0, 4).map((m) => {
      const pct = total > 0 ? (m.cost / total) * 100 : 0
      const name = m.modelID.split("/").pop() ?? m.modelID
      return `${name}  ${fmtCost(m.cost)} (${pct.toFixed(0)}%)`
    })
  })

  const topTools = createMemo(() => {
    const d = tools()
    if (!d) return []
    return d.slice(0, 4).map((t) => `${t.tool}  ${t.calls.toLocaleString()} calls`)
  })

  const cacheRate = createMemo(() => {
    const d = overview()
    if (!d) return 0
    const total = d.tokens.input + d.tokens.cache.read
    return total > 0 ? (d.tokens.cache.read / total) * 100 : 0
  })

  const subagents = createMemo(() => {
    const children = source.sessions.filter((x) => x.parentID)
    return { count: children.length }
  })

  return (
    <box flexDirection="column" gap={1}>
      <Show when={overview.loading || models.loading || tools.loading}>
        <text fg={theme.textMuted}>Loading…</text>
      </Show>
      <Show when={!overview.loading && overview()}>
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
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          SUBAGENTS
        </text>
        <text fg={theme.text}>Child sessions: {subagents().count}</text>
      </Show>
    </box>
  )
}
