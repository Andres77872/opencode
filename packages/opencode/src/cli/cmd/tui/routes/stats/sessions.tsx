import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { Show, createResource, createSignal, type JSX } from "solid-js"
import { Locale } from "@/util/locale"
import { Stats } from "@/session/stats"
import { StatTable } from "../../component/stats/stat-table"
import { useTheme } from "../../context/theme"
import { useSource, useStats } from "./context"

const pageSize = 20
const fields: Stats.SortField[] = ["date", "cost", "messages", "model"]

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatCost(n: number) {
  return n > 0 ? `$${(Number(n) || 0).toFixed(2)}` : "—"
}

function cleanTitle(raw: string) {
  if (!raw || raw === "(untitled)") return "Untitled"
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw)) return "Untitled"
  return raw
}

function truncate(text: string, max: number) {
  return text.length <= max ? text : text.slice(0, max - 1) + "…"
}

function dash(text: string) {
  return !text || text === "unknown" ? "—" : text
}

function SessionDetail(props: { id: string; duration: number }) {
  const { theme } = useTheme()
  const source = useSource()
  const [detail] = createResource(() => Stats.session(source, props.id))
  return (
    <Show when={detail()}>
      {(item) => (
        <box flexDirection="column" gap={0} paddingTop={1}>
          <text fg={theme.textMuted}>
            Duration: <span style={{ fg: theme.text }}>{Locale.duration(props.duration)}</span>
          </text>
          <text fg={theme.textMuted}>
            Tokens:{" "}
            <span style={{ fg: theme.text }}>
              {Locale.number(item().tokens.input)} in · {Locale.number(item().tokens.output)} out ·{" "}
              {Locale.number(item().tokens.reasoning)} reasoning
            </span>
          </text>
          <text fg={theme.textMuted}>
            Cache:{" "}
            <span style={{ fg: theme.text }}>
              {Locale.number(item().tokens.cacheRead)} read · {Locale.number(item().tokens.cacheWrite)} write
            </span>
          </text>
          <text fg={theme.textMuted}>
            Tools:{" "}
            <span style={{ fg: theme.text }}>
              {item()
                .tools.slice(0, 5)
                .map((tool) => `${tool.name}(${tool.count})`)
                .join(" ") || "none"}
            </span>
          </text>
          <text fg={theme.textMuted}>
            Subagents:{" "}
            <span style={{ fg: theme.text }}>
              {item().subagents.length > 0
                ? `${item().subagents.length} subagents · $${item().subagentCost.toFixed(2)}`
                : "none"}
            </span>
          </text>
        </box>
      )}
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
  const [list] = createResource(() => Stats.sessions(source, stats.filter, sort(), page(), pageSize))
  const header = () => {
    const item = list()
    if (!item) return "SESSIONS"
    const start = page() * pageSize + 1
    const end = Math.min(start + pageSize - 1, item.total)
    return `SESSIONS  ${item.total} total · showing ${start}–${end} · sorted by ${sort().field}`
  }
  const rows = () =>
    (list()?.items ?? []).map((item) => ({
      id: item.id,
      title: truncate(cleanTitle(item.title), 30),
      date: formatDate(item.date),
      cost: formatCost(item.cost),
      messages: item.messages > 0 ? String(item.messages) : "—",
      model: truncate(dash(item.model), 14),
      agent: dash(item.agent),
      duration: item.duration,
    }))

  function expandContent(row: Record<string, unknown>): JSX.Element {
    return <SessionDetail id={String(row.id)} duration={Number(row.duration) || 0} />
  }

  useKeyboard((evt) => {
    const item = list()
    const max = item ? item.items.length - 1 : -1
    if (evt.name === "j" || evt.name === "down") {
      evt.preventDefault()
      evt.stopPropagation()
      if (max >= 0) setSelected((value) => (value < max ? value + 1 : 0))
      return
    }
    if (evt.name === "k" || evt.name === "up") {
      evt.preventDefault()
      evt.stopPropagation()
      if (max >= 0) setSelected((value) => (value > 0 ? value - 1 : max))
      return
    }
    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      setExpanded((value) => (value === selected() ? -1 : selected()))
      return
    }
    if (evt.name === "n" && item && page() < item.pages - 1) {
      evt.preventDefault()
      evt.stopPropagation()
      setPage((value) => value + 1)
      setSelected(0)
      setExpanded(-1)
      return
    }
    if (evt.name === "p" && page() > 0) {
      evt.preventDefault()
      evt.stopPropagation()
      setPage((value) => value - 1)
      setSelected(0)
      setExpanded(-1)
      return
    }
    if (evt.name === "s") {
      evt.preventDefault()
      evt.stopPropagation()
      const idx = fields.indexOf(sort().field)
      setSort({ field: fields[(idx + 1) % fields.length], dir: "desc" })
      setPage(0)
      setSelected(0)
      setExpanded(-1)
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
      <Show when={!stats.loading && !stats.unavailable && list.loading}>
        <text fg={theme.textMuted}>Loading…</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && (!list() || list()!.total === 0)}>
        <text fg={theme.textMuted}>No sessions found</text>
      </Show>
      <Show when={!stats.loading && !stats.unavailable && list() && list()!.total > 0}>
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          {header()}
        </text>
        <StatTable
          columns={[
            { key: "title", label: "Title", width: 30 },
            { key: "date", label: "Date", width: 8 },
            { key: "cost", label: "Cost", width: 7, align: "right" },
            { key: "messages", label: "Msgs", width: 5, align: "right" },
            { key: "model", label: "Model", width: 14 },
            { key: "agent", label: "Agent", width: 10 },
          ]}
          data={rows() as Record<string, unknown>[]}
          selected={selected()}
          expanded={expanded()}
          expandContent={expandContent}
        />
        <text fg={theme.textMuted}>[j/k] navigate · [Enter] expand · [n/p] page · [s] sort</text>
      </Show>
    </box>
  )
}
