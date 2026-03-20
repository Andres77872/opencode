import { TextAttributes } from "@opentui/core"
import { Show, createResource, createSignal, type JSX } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { useStats, useSource } from "./context"
import { StatTable } from "../../component/stats/stat-table"
import { Stats } from "../../../../../session/stats"
import { Locale } from "@/util/locale"

const PAGE_SIZE = 20
const SORT_FIELDS: Stats.SortField[] = ["date", "cost", "messages", "model"]

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function cleanTitle(raw: string): string {
  if (!raw || raw === "(untitled)") return "Untitled"
  // Raw ISO timestamp fallback titles look like "New session - 2026-03-15T03:11:32.896Z"
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw)) {
    const d = new Date(raw.replace(/.*?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z).*/, "$1"))
    if (!isNaN(d.getTime()))
      return (
        "Session " +
        d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " +
        d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      )
    return "Untitled"
  }
  return raw
}

function formatCost(n: number): string {
  return n > 0 ? "$" + (Number(n) || 0).toFixed(2) : "—"
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…"
}

function dash(s: string): string {
  return !s || s === "unknown" ? "—" : s
}

function SessionDetail(props: { id: string; duration: number }) {
  const { theme } = useTheme()
  const source = useSource()
  const [detail] = createResource(() => Stats.session(source, props.id))

  return (
    <Show when={detail()}>
      {(d) => {
        const t = d().tokens
        const cacheRate = t.input + t.cacheRead > 0 ? Math.round((t.cacheRead / (t.input + t.cacheRead)) * 100) : 0
        const toolSummary = d()
          .tools.slice(0, 5)
          .map((tool) => `${tool.name}(${tool.count})`)
          .join(" ")
        const subagentInfo =
          d().subagents.length > 0
            ? `${d().subagents.length} subagent${d().subagents.length > 1 ? "s" : ""} · $${d().subagentCost.toFixed(2)}`
            : "none"

        return (
          <box flexDirection="column" gap={0} paddingTop={1}>
            <text fg={theme.textMuted}>
              Duration: <span style={{ fg: theme.text }}>{Locale.duration(props.duration)}</span>
            </text>
            <text fg={theme.textMuted}>
              Tokens:{" "}
              <span style={{ fg: theme.text }}>
                {Locale.number(t.input)} in · {Locale.number(t.output)} out · {Locale.number(t.reasoning)} reasoning
              </span>
            </text>
            <text fg={theme.textMuted}>
              Cache:{" "}
              <span style={{ fg: theme.text }}>
                {Locale.number(t.cacheRead)} read ({cacheRate}%) · {Locale.number(t.cacheWrite)} write
              </span>
            </text>
            <text fg={theme.textMuted}>
              Tools: <span style={{ fg: theme.text }}>{toolSummary || "none"}</span>
            </text>
            <text fg={theme.textMuted}>
              Subagents: <span style={{ fg: theme.text }}>{subagentInfo}</span>
            </text>
          </box>
        )
      }}
    </Show>
  )
}

export function Sessions() {
  const { theme } = useTheme()
  const stats = useStats()
  const source = useSource()

  const [sort, setSort] = createSignal<{ field: Stats.SortField; dir: Stats.SortDir }>({ field: "date", dir: "desc" })
  const [page, setPage] = createSignal(0)
  const [selected, setSelected] = createSignal(0)
  const [expanded, setExpanded] = createSignal(-1)

  const [list] = createResource(
    () => stats.filter,
    (f) => Stats.sessions(source, f, sort(), page(), PAGE_SIZE),
  )

  const header = () => {
    const d = list()
    if (!d) return "SESSIONS"
    const start = page() * PAGE_SIZE + 1
    const end = Math.min(start + PAGE_SIZE - 1, d.total)
    return `SESSIONS  ${d.total} total · showing ${start}–${end} · sorted by ${sort().field}`
  }

  const tableData = () => {
    const d = list()
    if (!d) return []
    return d.items.map((row) => ({
      id: row.id,
      title: truncate(cleanTitle(row.title), 30),
      date: formatDate(row.date),
      cost: formatCost(row.cost),
      messages: row.messages > 0 ? String(row.messages) : "—",
      model: truncate(dash(row.model), 14),
      agent: dash(row.agent),
      duration: row.duration,
    }))
  }

  const columns = [
    { key: "title", label: "Title", width: 30 },
    { key: "date", label: "Date", width: 8 },
    { key: "cost", label: "Cost", width: 7, align: "right" as const },
    { key: "messages", label: "Msgs", width: 5, align: "right" as const },
    { key: "model", label: "Model", width: 14 },
    { key: "agent", label: "Agent", width: 10 },
  ]

  const expandContent = (row: Record<string, unknown>): JSX.Element => (
    <SessionDetail id={row.id as string} duration={row.duration as number} />
  )

  const cycleSort = () => {
    const cur = sort()
    const idx = SORT_FIELDS.indexOf(cur.field)
    setSort({ field: SORT_FIELDS[(idx + 1) % SORT_FIELDS.length], dir: "desc" })
  }

  useKeyboard((evt) => {
    const d = list()
    const max = d ? d.items.length - 1 : -1

    if (evt.name === "j" || evt.name === "down") {
      evt.preventDefault()
      if (max >= 0) setSelected((s) => (s < max ? s + 1 : 0))
      return
    }
    if (evt.name === "k" || evt.name === "up") {
      evt.preventDefault()
      if (max >= 0) setSelected((s) => (s > 0 ? s - 1 : max))
      return
    }
    if (evt.name === "return") {
      evt.preventDefault()
      const sel = selected()
      setExpanded((e) => (e === sel ? -1 : sel))
      return
    }
    if (evt.name === "n" && d && page() < d.pages - 1) {
      evt.preventDefault()
      setPage((p) => p + 1)
      setSelected(0)
      setExpanded(-1)
      return
    }
    if (evt.name === "p" && page() > 0) {
      evt.preventDefault()
      setPage((p) => p - 1)
      setSelected(0)
      setExpanded(-1)
      return
    }
    if (evt.name === "s") {
      evt.preventDefault()
      cycleSort()
      setPage(0)
      setSelected(0)
      setExpanded(-1)
      return
    }
  })

  return (
    <box flexDirection="column" gap={1}>
      <Show when={list.loading}>
        <text fg={theme.textMuted}>Loading…</text>
      </Show>
      <Show when={!list.loading && (!list() || list()!.total === 0)}>
        <text fg={theme.textMuted}>No sessions found</text>
      </Show>
      <Show when={!list.loading && list() && list()!.total > 0}>
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          {header()}
        </text>
        <StatTable
          columns={columns}
          data={tableData() as Record<string, unknown>[]}
          selected={selected()}
          expanded={expanded()}
          expandContent={expandContent}
        />
        <text fg={theme.textMuted}>[j/k] navigate · [Enter] expand · [n/p] page · [s] sort</text>
      </Show>
    </box>
  )
}
