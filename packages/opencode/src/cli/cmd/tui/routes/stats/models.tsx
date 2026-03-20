import { Show, createResource, createSignal, type JSX } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { StatTable } from "@tui/component/stats/stat-table"
import { useStats, useSource } from "./context"
import { Stats } from "../../../../../session/stats"
import { Locale } from "@/util/locale"

function formatCost(n: number) {
  return "$" + (Number(n) || 0).toFixed(2)
}

function formatPct(n: number) {
  return ((Number(n) || 0) * 100).toFixed(0) + "%"
}

function formatCostCol(v: unknown) {
  return formatCost(Number(v) || 0)
}

function formatPctCol(v: unknown) {
  return formatPct(Number(v) || 0)
}

function formatNumCol(v: unknown) {
  return Locale.number(Number(v) || 0)
}

export function Models() {
  const { theme } = useTheme()
  const stats = useStats()
  const source = useSource()
  const [selected, setSelected] = createSignal(0)
  const [expanded, setExpanded] = createSignal<number | undefined>()

  const [data] = createResource(
    () => stats.filter,
    (f) => Stats.models(source, f),
  )

  const rows = () => {
    const list = data() ?? []
    return list.map((m: Stats.Model) => ({
      modelID: m.modelID,
      providerID: m.providerID,
      messages: m.messages,
      cost: m.cost,
      input: m.input,
      output: m.output,
      cacheRate: m.cacheRate,
      reasoning: m.reasoning,
      reasoningRatio: m.reasoningRatio,
      cacheRead: m.cacheRead,
      cacheWrite: m.cacheWrite,
      avgCost: m.avgCost,
    }))
  }

  const columns = [
    { key: "modelID", label: "Model", align: "left" as const },
    { key: "messages", label: "Msgs", align: "right" as const },
    { key: "cost", label: "Cost", align: "right" as const, format: formatCostCol },
    { key: "input", label: "Input", align: "right" as const, format: formatNumCol },
    { key: "output", label: "Output", align: "right" as const, format: formatNumCol },
    { key: "cacheRate", label: "Cache%", align: "right" as const, format: formatPctCol },
  ]

  function expandContent(row: Record<string, unknown>): JSX.Element {
    const provider = (row.providerID as string) ?? ""
    const avgCost = Number(row.avgCost) || 0
    const reasoning = Number(row.reasoning) || 0
    const reasoningRatio = Number(row.reasoningRatio) || 0
    const cacheRead = Number(row.cacheRead) || 0
    const cacheWrite = Number(row.cacheWrite) || 0
    return (
      <box flexDirection="column">
        <text fg={theme.textMuted}>Provider: {provider}</text>
        <text fg={theme.textMuted}>Avg cost/msg: {formatCost(avgCost)}</text>
        <text fg={theme.textMuted}>
          Reasoning: {Locale.number(reasoning)} tokens ({formatPct(reasoningRatio)} of output)
        </text>
        <text fg={theme.textMuted}>
          Cache read: {Locale.number(cacheRead)} | Cache write: {Locale.number(cacheWrite)}
        </text>
      </box>
    )
  }

  useKeyboard((evt) => {
    const list = rows()
    if (list.length === 0) return

    if (evt.name === "up" || evt.name === "k") {
      evt.preventDefault()
      setSelected((s) => Math.max(0, s - 1))
      return
    }
    if (evt.name === "down" || evt.name === "j") {
      evt.preventDefault()
      setSelected((s) => Math.min(list.length - 1, s + 1))
      return
    }
    if (evt.name === "return" || evt.name === "enter") {
      evt.preventDefault()
      setExpanded((e) => (e === selected() ? undefined : selected()))
      return
    }
  })

  return (
    <box flexDirection="column">
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
        MODEL USAGE
      </text>
      <Show when={data.loading}>
        <text fg={theme.textMuted}>Loading…</text>
      </Show>
      <Show when={!data.loading && rows().length === 0}>
        <text fg={theme.textMuted}>No model data available</text>
      </Show>
      <Show when={!data.loading && rows().length > 0}>
        <box paddingTop={1}>
          <StatTable
            columns={columns}
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
