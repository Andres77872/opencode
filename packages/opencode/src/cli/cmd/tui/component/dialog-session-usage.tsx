import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import { useRouteData } from "@tui/context/route"
import { For, Show, createMemo, createResource } from "solid-js"
import { Locale } from "@/util/locale"
import type { AssistantMessage, Part, ToolPart, Session } from "@opencode-ai/sdk/v2"

type Tokens = {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
  cost: number
  count: number
}

function blank(): Tokens {
  return { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, cost: 0, count: 0 }
}

function accum(t: Tokens, msg: AssistantMessage) {
  t.input += msg.tokens.input
  t.output += msg.tokens.output
  t.reasoning += msg.tokens.reasoning
  t.cache.read += msg.tokens.cache.read
  t.cache.write += msg.tokens.cache.write
  t.cost += msg.cost
  t.count += 1
}

function fmt(n: number) {
  return n.toLocaleString()
}

function dollars(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n)
}

function pct(n: number) {
  return (n * 100).toFixed(1) + "%"
}

function bar(ratio: number, width: number = 20): string {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

type ModelRow = { id: string; provider: string; name: string; tokens: Tokens }
type ToolRow = { name: string; total: number; ok: number; err: number }
type AgentRow = { name: string; tokens: Tokens }
type SubagentRow = { id: string; title: string; agent: string; tokens: Tokens; messages: number }

export function DialogSessionUsage() {
  const sync = useSync()
  const sdk = useSDK()
  const route = useRouteData("session")
  const { theme } = useTheme()
  const dialog = useDialog()
  const dim = useTerminalDimensions()

  const session = createMemo(() => sync.session.get(route.sessionID))
  const msgs = createMemo(() => sync.data.message[route.sessionID] ?? [])
  const assistants = createMemo(() => msgs().filter((m) => m.role === "assistant") as AssistantMessage[])
  const parts = createMemo(() => {
    const result: Part[] = []
    for (const m of msgs()) {
      const p = sync.data.part[m.id]
      if (p) result.push(...p)
    }
    return result
  })

  // Subagent sessions
  const [children] = createResource(async () => {
    const all = sync.data.session.filter((s) => s.parentID === route.sessionID)
    const rows: SubagentRow[] = []
    for (const child of all) {
      const res = await sdk.client.session.messages({ sessionID: child.id }).catch(() => undefined)
      const childMsgs = res?.data ?? []
      const t = blank()
      let agent = ""
      for (const m of childMsgs) {
        if (m.info.role === "assistant") {
          accum(t, m.info)
          if (!agent) agent = m.info.agent
        }
      }
      rows.push({
        id: child.id,
        title: child.title,
        agent: agent || "unknown",
        tokens: t,
        messages: childMsgs.length,
      })
    }
    return rows
  })

  // Section A: Summary
  const duration = createMemo(() => {
    const list = msgs()
    if (list.length < 2) return 0
    const first = list[0].time.created
    const last = list.at(-1)!
    const end = last.role === "assistant" ? (last.time.completed ?? last.time.created) : last.time.created
    return end - first
  })

  const total = createMemo(() => {
    const t = blank()
    for (const m of assistants()) accum(t, m)
    return t
  })

  // Section C: Per-model breakdown
  const models = createMemo(() => {
    const map: Record<string, ModelRow> = {}
    for (const m of assistants()) {
      const key = `${m.providerID}::${m.modelID}`
      if (!map[key]) {
        const prov = sync.data.provider.find((p) => p.id === m.providerID)
        map[key] = { id: m.modelID, provider: prov?.name ?? m.providerID, name: m.modelID, tokens: blank() }
      }
      accum(map[key].tokens, m)
    }
    return Object.values(map).toSorted((a, b) => b.tokens.count - a.tokens.count)
  })

  // Section D: Tool usage
  const tools = createMemo(() => {
    const map: Record<string, ToolRow> = {}
    for (const p of parts()) {
      if (p.type !== "tool") continue
      const tp = p as ToolPart
      if (!map[tp.tool]) map[tp.tool] = { name: tp.tool, total: 0, ok: 0, err: 0 }
      map[tp.tool].total += 1
      if (tp.state.status === "completed") map[tp.tool].ok += 1
      if (tp.state.status === "error") map[tp.tool].err += 1
    }
    return Object.values(map).toSorted((a, b) => b.total - a.total)
  })

  // Section F: Per-agent breakdown
  const agents = createMemo(() => {
    const map: Record<string, AgentRow> = {}
    for (const m of assistants()) {
      if (!map[m.agent]) map[m.agent] = { name: m.agent, tokens: blank() }
      accum(map[m.agent].tokens, m)
    }
    return Object.values(map).toSorted((a, b) => b.tokens.count - a.tokens.count)
  })

  // Subagent totals
  const subTotal = createMemo(() => {
    const rows = children()
    if (!rows) return blank()
    const t = blank()
    for (const r of rows) {
      t.input += r.tokens.input
      t.output += r.tokens.output
      t.reasoning += r.tokens.reasoning
      t.cache.read += r.tokens.cache.read
      t.cache.write += r.tokens.cache.write
      t.cost += r.tokens.cost
      t.count += r.tokens.count
    }
    return t
  })

  const combined = createMemo(() => {
    const m = total()
    const s = subTotal()
    return {
      input: m.input + s.input,
      output: m.output + s.output,
      reasoning: m.reasoning + s.reasoning,
      cache: { read: m.cache.read + s.cache.read, write: m.cache.write + s.cache.write },
      cost: m.cost + s.cost,
      count: m.count + s.count,
    }
  })

  const grand = createMemo(
    () => combined().input + combined().output + combined().reasoning + combined().cache.read + combined().cache.write,
  )

  // Cache efficiency metrics
  const cache = createMemo(() => {
    const c = combined()
    const context = c.input + c.cache.read
    const rate = context > 0 ? c.cache.read / context : 0
    const g = grand()
    return {
      rate,
      input: g > 0 ? c.input / g : 0,
      output: g > 0 ? c.output / g : 0,
      read: g > 0 ? c.cache.read / g : 0,
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Session Usage
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>

      <scrollbox
        gap={1}
        maxHeight={Math.floor(dim().height * 0.6)}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.backgroundPanel,
            foregroundColor: theme.border,
          },
        }}
      >
        {/* Section A: Summary */}
        <box>
          <text fg={theme.text}>
            <b>Summary</b>
          </text>
          <text fg={theme.textMuted}>
            Session: <span style={{ fg: theme.text }}>{session()?.title ?? route.sessionID}</span>
          </text>
          <Show when={duration() > 0}>
            <text fg={theme.textMuted}>
              Duration: <span style={{ fg: theme.text }}>{Locale.duration(duration())}</span>
            </text>
          </Show>
          <text fg={theme.textMuted}>
            Messages: <span style={{ fg: theme.text }}>{fmt(msgs().length)}</span>
            <span style={{ fg: theme.textMuted }}>
              {" "}
              ({fmt(msgs().filter((m) => m.role === "user").length)} user · {fmt(assistants().length)} assistant)
            </span>
          </text>
          <text fg={theme.textMuted}>
            Total cost: <span style={{ fg: theme.text }}>{dollars(combined().cost)}</span>
            <Show when={subTotal().cost > 0}>
              <span style={{ fg: theme.textMuted }}>
                {" "}
                (Main: {dollars(total().cost)} · Subagents: {dollars(subTotal().cost)})
              </span>
            </Show>
          </text>
        </box>

        {/* Section B: Token breakdown */}
        <box>
          <text fg={theme.text}>
            <b>Tokens</b>
          </text>
          <text fg={theme.textMuted}>
            Input: <span style={{ fg: theme.text }}>{fmt(combined().input)}</span>
            <Show when={subTotal().input > 0}>
              <span style={{ fg: theme.textMuted }}>
                {" "}
                (Main: {fmt(total().input)} · Subagents: {fmt(subTotal().input)})
              </span>
            </Show>
          </text>
          <text fg={theme.textMuted}>
            Output: <span style={{ fg: theme.text }}>{fmt(combined().output)}</span>
            <Show when={subTotal().output > 0}>
              <span style={{ fg: theme.textMuted }}>
                {" "}
                (Main: {fmt(total().output)} · Subagents: {fmt(subTotal().output)})
              </span>
            </Show>
          </text>
          <Show when={combined().reasoning > 0}>
            <text fg={theme.textMuted}>
              Reasoning: <span style={{ fg: theme.text }}>{fmt(combined().reasoning)}</span>
            </text>
          </Show>
          <Show when={combined().cache.read > 0}>
            <text fg={theme.accent}>
              Cache read: <b>{fmt(combined().cache.read)}</b>
              <Show when={subTotal().cache.read > 0}>
                <span style={{ fg: theme.textMuted }}>
                  {" "}
                  (Main: {fmt(total().cache.read)} · Subagents: {fmt(subTotal().cache.read)})
                </span>
              </Show>
            </text>
          </Show>
          <Show when={combined().cache.write > 0}>
            <text fg={theme.textMuted}>
              Cache write: <span style={{ fg: theme.text }}>{fmt(combined().cache.write)}</span>
            </text>
          </Show>
          <text fg={theme.textMuted}>
            Total: <span style={{ fg: theme.text }}>{fmt(grand())}</span>
          </text>
          <Show when={grand() > 0}>
            <text fg={theme.textMuted}>
              Distribution: <span style={{ fg: theme.text }}>{pct(cache().input)}</span> input ·{" "}
              <span style={{ fg: theme.text }}>{pct(cache().output)}</span> output ·{" "}
              <span style={{ fg: theme.accent }}>{pct(cache().read)}</span> cache
            </text>
          </Show>
        </box>

        {/* Cache Efficiency */}
        <Show when={combined().cache.read > 0}>
          <box>
            <text fg={theme.text}>
              <b>Cache Efficiency</b>
            </text>
            <text fg={theme.accent}>
              Hit rate: <b>{pct(cache().rate)}</b>
              <span style={{ fg: theme.textMuted }}> of input context served from cache</span>
            </text>
            <text fg={theme.accent}>
              {bar(cache().rate)} <span style={{ fg: theme.textMuted }}>{Math.round(cache().rate * 100)}%</span>
            </text>
          </box>
        </Show>

        {/* Section C: Per-model breakdown */}
        <Show when={models().length > 0}>
          <box>
            <text fg={theme.text}>
              <b>Models</b>
            </text>
            <For each={models()}>
              {(row) => (
                <text fg={theme.text} wrapMode="word">
                  {row.provider}/{row.name}{" "}
                  <span style={{ fg: theme.textMuted }}>
                    {fmt(row.tokens.count)} msgs · {Locale.number(row.tokens.input)} in ·{" "}
                    {Locale.number(row.tokens.output)} out
                    {row.tokens.reasoning > 0 ? ` · ${Locale.number(row.tokens.reasoning)} reasoning` : ""}
                    {row.tokens.cache.read > 0 ? ` · ${Locale.number(row.tokens.cache.read)} cache` : ""}
                    {" · "}
                    {dollars(row.tokens.cost)}
                  </span>
                </text>
              )}
            </For>
          </box>
        </Show>

        {/* Section D: Tool usage */}
        <Show when={tools().length > 0}>
          <box>
            <text fg={theme.text}>
              <b>Tools</b>
            </text>
            <For each={tools()}>
              {(row) => (
                <text fg={theme.text} wrapMode="word">
                  {row.name}{" "}
                  <span style={{ fg: theme.textMuted }}>
                    {fmt(row.total)} calls
                    {row.ok > 0 ? ` · ${fmt(row.ok)} ok` : ""}
                    {row.err > 0 ? ` · ${fmt(row.err)} err` : ""}
                  </span>
                </text>
              )}
            </For>
          </box>
        </Show>

        {/* Section E: Subagent sessions */}
        <Show when={children.loading}>
          <text fg={theme.textMuted}>Loading subagent data…</text>
        </Show>
        <Show when={!children.loading && children() && children()!.length > 0}>
          <box>
            <text fg={theme.text}>
              <b>Subagents</b>
            </text>
            <For each={children()}>
              {(row) => (
                <text fg={theme.text} wrapMode="word">
                  {row.agent}{" "}
                  <span style={{ fg: theme.textMuted }}>
                    {fmt(row.messages)} msgs · {Locale.number(row.tokens.input)} in · {Locale.number(row.tokens.output)}{" "}
                    out
                    {row.tokens.cache.read > 0 ? ` · ` : ""}
                  </span>
                  {row.tokens.cache.read > 0 ? (
                    <span style={{ fg: theme.accent }}>{Locale.number(row.tokens.cache.read)} cache</span>
                  ) : null}
                  <span style={{ fg: theme.textMuted }}> · {dollars(row.tokens.cost)}</span>
                </text>
              )}
            </For>
            <text fg={theme.textMuted}>
              Subagent total:{" "}
              <span style={{ fg: theme.text }}>
                {Locale.number(subTotal().input)} in · {Locale.number(subTotal().output)} out
              </span>
              {subTotal().cache.read > 0 ? (
                <span style={{ fg: theme.accent }}> · {Locale.number(subTotal().cache.read)} cache</span>
              ) : null}
              <span style={{ fg: theme.text }}> · {dollars(subTotal().cost)}</span>
            </text>
          </box>
        </Show>

        {/* Section F: Per-agent breakdown */}
        <Show when={agents().length > 1}>
          <box>
            <text fg={theme.text}>
              <b>Agents</b>
            </text>
            <For each={agents()}>
              {(row) => (
                <text fg={theme.text} wrapMode="word">
                  {row.name}{" "}
                  <span style={{ fg: theme.textMuted }}>
                    {fmt(row.tokens.count)} msgs · {Locale.number(row.tokens.input)} in ·{" "}
                    {Locale.number(row.tokens.output)} out
                    {row.tokens.cache.read > 0 ? ` · ${Locale.number(row.tokens.cache.read)} cache` : ""}
                    {" · "}
                    {dollars(row.tokens.cost)}
                  </span>
                </text>
              )}
            </For>
          </box>
        </Show>
      </scrollbox>
    </box>
  )
}
