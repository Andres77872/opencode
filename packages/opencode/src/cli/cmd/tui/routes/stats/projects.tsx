import { Show, createResource, createSignal, type JSX } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { useStats, useSource } from "./context"
import { StatTable } from "../../component/stats/stat-table"
import { Stats } from "../../../../../session/stats"

function formatCost(n: number): string {
  return "$" + (Number(n) || 0).toFixed(2)
}

function formatNum(n: number): string {
  return (Number(n) || 0).toLocaleString()
}

export function Projects() {
  const { theme } = useTheme()
  const { filter } = useStats()
  const source = useSource()
  const [selected, setSelected] = createSignal(0)
  const [expanded, setExpanded] = createSignal<number | undefined>()

  const [data] = createResource(() => Stats.projects(source, filter))

  const tableData = () => {
    const d = data()
    if (!d) return []
    return d.map((row) => ({
      projectID: row.projectID,
      name: row.name,
      sessions: formatNum(row.sessions),
      cost: formatCost(row.cost),
      messages: formatNum(row.messages),
      files: formatNum(row.files),
      additions: row.additions,
      deletions: row.deletions,
    }))
  }

  const columns = [
    { key: "name", label: "Project" },
    { key: "sessions", label: "Sessions", align: "right" as const },
    { key: "cost", label: "Cost", align: "right" as const },
    { key: "messages", label: "Messages", align: "right" as const },
    { key: "files", label: "Files changed", align: "right" as const },
  ]

  function expandContent(row: Record<string, unknown>): JSX.Element {
    const add = row.additions as number
    const del = row.deletions as number
    const files = row.files as string
    return (
      <text fg={theme.textMuted}>
        Additions: +{add.toLocaleString()} Deletions: -{del.toLocaleString()} Files: {files}
      </text>
    )
  }

  useKeyboard((evt) => {
    const list = tableData()
    if (list.length === 0) return

    if (evt.name === "up") {
      evt.preventDefault()
      setSelected((s) => Math.max(0, s - 1))
      return
    }
    if (evt.name === "down") {
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
    <box flexDirection="column" gap={1}>
      <Show when={data.loading}>
        <text fg={theme.textMuted}>Loading…</text>
      </Show>
      <Show when={!data.loading && (!data() || data()!.length === 0)}>
        <text fg={theme.textMuted}>No project data available</text>
      </Show>
      <Show when={!data.loading && data() && data()!.length > 0}>
        <text fg={theme.primary}>PROJECT COMPARISON</text>
        <StatTable
          columns={columns}
          data={tableData() as Record<string, unknown>[]}
          selected={selected()}
          expanded={expanded()}
          expandContent={expandContent}
        />
      </Show>
    </box>
  )
}
