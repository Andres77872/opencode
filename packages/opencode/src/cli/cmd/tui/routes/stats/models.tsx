import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { Show, createResource, createSignal, type JSX } from "solid-js"
import { Locale } from "@/util/locale"
import { Stats } from "@/session/stats"
import { StatTable } from "@tui/component/stats/stat-table"
import { useTheme } from "@tui/context/theme"
import { useSource, useStats } from "./context"

function formatCost(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`
}

function formatPct(n: number) {
  return `${((Number(n) || 0) * 100).toFixed(0)}%`
}

export function Models() {
  const { theme } = useTheme()
  const stats = useStats()
  const source = useSource()
  const [selected, setSelected] = createSignal(0)
  const [expanded, setExpanded] = createSignal<number | undefined>()
  const [data] = createResource(() => Stats.models(source, stats.filter))
  const rows = () =>
    (data() ?? []).map((item: Stats.Model) => ({
      modelID: item.modelID,
      providerID: item.providerID,
      messages: item.messages,
      cost: item.cost,
      input: item.input,
      output: item.output,
      cacheRate: item.cacheRate,
      reasoning: item.reasoning,
      reasoningRatio: item.reasoningRatio,
      cacheRead: item.cacheRead,
      cacheWrite: item.cacheWrite,
      avgCost: item.avgCost,
    }))

  function expandContent(row: Record<string, unknown>): JSX.Element {
    return (
      <box flexDirection="column">
        <text fg={theme.textMuted}>Provider: {String(row.providerID ?? "")}</text>
        <text fg={theme.textMuted}>
          Total tokens:{" "}
          {Locale.number((Number(row.input) || 0) + (Number(row.output) || 0) + (Number(row.cacheRead) || 0))}
        </text>
        <text fg={theme.textMuted}>Avg cost/msg: {formatCost(Number(row.avgCost) || 0)}</text>
        <text fg={theme.textMuted}>
          Reasoning: {Locale.number(Number(row.reasoning) || 0)} ({formatPct(Number(row.reasoningRatio) || 0)} of
          output)
        </text>
        <text fg={theme.textMuted}>
          Cache read: {Locale.number(Number(row.cacheRead) || 0)} | write: {Locale.number(Number(row.cacheWrite) || 0)}
        </text>
      </box>
    )
  }

  useKeyboard((evt) => {
    if (rows().length === 0) return
    if (evt.name === "up" || evt.name === "k") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelected((value) => Math.max(0, value - 1))
      return
    }
    if (evt.name === "down" || evt.name === "j") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelected((value) => Math.min(rows().length - 1, value + 1))
      return
    }
    if (evt.name === "return" || evt.name === "enter") {
      evt.preventDefault()
      evt.stopPropagation()
      setExpanded((value) => (value === selected() ? undefined : selected()))
    }
  })

  return (
    <box flexDirection="column">
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
        MODEL USAGE
      </text>
      <Show when={stats.loading}>
        <text fg={theme.textMuted}>Loading aggregate stats…</text>
      </Show>
      <Show when={stats.unavailable}>
        <text fg={theme.warning}>Stats unavailable: {stats.error ?? "aggregate session sync failed"}</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && data.loading}>
        <text fg={theme.textMuted}>Loading…</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && rows().length === 0}>
        <text fg={theme.textMuted}>No model data available</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && rows().length > 0}>
        <box paddingTop={1}>
          <StatTable
            columns={[
              { key: "modelID", label: "Model", align: "left" },
              { key: "messages", label: "Msgs", align: "right" },
              { key: "cost", label: "Cost", align: "right", format: (value) => formatCost(Number(value) || 0) },
              { key: "input", label: "Input", align: "right", format: (value) => Locale.number(Number(value) || 0) },
              { key: "output", label: "Output", align: "right", format: (value) => Locale.number(Number(value) || 0) },
              {
                key: "cacheRead",
                label: "Cache",
                align: "right",
                format: (value) => Locale.number(Number(value) || 0),
              },
              { key: "cacheRate", label: "Cache%", align: "right", format: (value) => formatPct(Number(value) || 0) },
            ]}
            data={rows() as Record<string, unknown>[]}
            selected={selected()}
            expanded={expanded()}
            expandContent={expandContent}
          />
        </box>
      </Show>
    </box>
  )
}
