import { useKeyboard } from "@opentui/solid"
import { Show, createResource, createSignal, type JSX } from "solid-js"
import { Stats } from "@/session/stats"
import { StatTable } from "../../component/stats/stat-table"
import { useTheme } from "../../context/theme"
import { useSource, useStats } from "./context"

function formatCost(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`
}

export function Projects() {
  const { theme } = useTheme()
  const stats = useStats()
  const source = useSource()
  const [selected, setSelected] = createSignal(0)
  const [expanded, setExpanded] = createSignal<number | undefined>()
  const [data] = createResource(() => Stats.projects({ ...source, projects: stats.projects }, stats.filter))

  function expandContent(row: Record<string, unknown>): JSX.Element {
    return (
      <text fg={theme.textMuted}>
        Additions: +{Number(row.additions || 0).toLocaleString()} Deletions: -
        {Number(row.deletions || 0).toLocaleString()} Files: {String(row.files)}
      </text>
    )
  }

  useKeyboard((evt) => {
    if ((data() ?? []).length === 0) return
    if (evt.name === "up") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelected((value) => Math.max(0, value - 1))
      return
    }
    if (evt.name === "down") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelected((value) => Math.min((data() ?? []).length - 1, value + 1))
      return
    }
    if (evt.name === "return" || evt.name === "enter") {
      evt.preventDefault()
      evt.stopPropagation()
      setExpanded((value) => (value === selected() ? undefined : selected()))
    }
  })

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
        <text fg={theme.textMuted}>No project data available</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && data() && data()!.length > 0}>
        <text fg={theme.primary}>PROJECT COMPARISON</text>
        <StatTable
          columns={[
            { key: "name", label: "Project" },
            { key: "sessions", label: "Sessions", align: "right" },
            { key: "cost", label: "Cost", align: "right" },
            { key: "messages", label: "Messages", align: "right" },
            { key: "files", label: "Files changed", align: "right" },
          ]}
          data={
            data()!.map((item) => ({
              projectID: item.projectID,
              name: item.name,
              sessions: item.sessions.toLocaleString(),
              cost: formatCost(item.cost),
              messages: item.messages.toLocaleString(),
              files: item.files.toLocaleString(),
              additions: item.additions,
              deletions: item.deletions,
            })) as Record<string, unknown>[]
          }
          selected={selected()}
          expanded={expanded()}
          expandContent={expandContent}
        />
      </Show>
    </box>
  )
}
