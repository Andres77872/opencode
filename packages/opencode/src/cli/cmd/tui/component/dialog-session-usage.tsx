import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useDialog } from "@tui/ui/dialog"
import { useRouteData } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import { useTheme } from "../context/theme"
import { For, Show, createMemo, createResource, onMount } from "solid-js"
import { Locale } from "@/util/locale"
import { Stats } from "@/session/stats"

function fmt(n: number) {
  return n.toLocaleString()
}

function dollars(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

export function DialogSessionUsage() {
  const sync = useSync()
  const sdk = useSDK()
  const route = useRouteData("session")
  const { theme } = useTheme()
  const dialog = useDialog()
  const dim = useTerminalDimensions()

  onMount(() => {
    dialog.setSize("large")
  })

  const session = createMemo(() => sync.session.get(route.sessionID))
  const msgs = createMemo(() => sync.data.message[route.sessionID] ?? [])
  const users = createMemo(() => msgs().filter((msg) => msg.role === "user").length)
  const assistants = createMemo(() => msgs().filter((msg) => msg.role === "assistant").length)
  const source: Stats.Source = {
    sessions: sync.data.session,
    messages: async (sessionID) => (await sdk.client.session.messages({ sessionID })).data ?? [],
    children: async (sessionID) => (await sdk.client.session.children({ sessionID })).data ?? [],
  }
  const [detail] = createResource(() => Stats.session(source, route.sessionID))
  const empty = createMemo(() => {
    const item = detail()
    if (!item) return false
    return (
      item.cost === 0 &&
      item.tokens.input === 0 &&
      item.tokens.output === 0 &&
      item.tokens.reasoning === 0 &&
      item.tokens.cacheRead === 0 &&
      item.tokens.cacheWrite === 0 &&
      item.tools.length === 0 &&
      item.subagents.length === 0
    )
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Session Usage
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={detail.loading}>
        <text fg={theme.textMuted}>Loading session usage…</text>
      </Show>
      <scrollbox
        gap={1}
        maxHeight={Math.floor(dim().height * 0.6)}
        verticalScrollbarOptions={{
          trackOptions: { backgroundColor: theme.backgroundPanel, foregroundColor: theme.border },
        }}
      >
        <Show when={detail()}>
          {(item) => (
            <>
              <box>
                <text fg={theme.text}>
                  <b>Summary</b>
                </text>
                <text fg={theme.textMuted}>
                  Session: <span style={{ fg: theme.text }}>{session()?.title ?? route.sessionID}</span>
                </text>
                <text fg={theme.textMuted}>
                  Messages: <span style={{ fg: theme.text }}>{fmt(msgs().length)}</span>
                  <span style={{ fg: theme.textMuted }}>
                    {" "}
                    ({fmt(users())} user · {fmt(assistants())} assistant)
                  </span>
                </text>
                <text fg={theme.textMuted}>
                  Total cost: <span style={{ fg: theme.text }}>{dollars(item().cost + item().subagentCost)}</span>
                  <Show when={item().subagentCost > 0}>
                    <span style={{ fg: theme.textMuted }}>
                      {" "}
                      (Main: {dollars(item().cost)} · Subagents: {dollars(item().subagentCost)})
                    </span>
                  </Show>
                </text>
              </box>
              <Show when={empty()}>
                <text fg={theme.textMuted}>No usage data yet</text>
              </Show>
              <box>
                <text fg={theme.text}>
                  <b>Tokens</b>
                </text>
                <text fg={theme.textMuted}>
                  Input: <span style={{ fg: theme.text }}>{fmt(item().tokens.input)}</span>
                </text>
                <text fg={theme.textMuted}>
                  Output: <span style={{ fg: theme.text }}>{fmt(item().tokens.output)}</span>
                </text>
                <Show when={item().tokens.reasoning > 0}>
                  <text fg={theme.textMuted}>
                    Reasoning: <span style={{ fg: theme.text }}>{fmt(item().tokens.reasoning)}</span>
                  </text>
                </Show>
                <Show when={item().tokens.cacheRead > 0}>
                  <text fg={theme.accent}>
                    Cache read: <b>{fmt(item().tokens.cacheRead)}</b>
                  </text>
                </Show>
                <Show when={item().tokens.cacheWrite > 0}>
                  <text fg={theme.textMuted}>
                    Cache write: <span style={{ fg: theme.text }}>{fmt(item().tokens.cacheWrite)}</span>
                  </text>
                </Show>
              </box>
              <Show when={item().tools.length > 0}>
                <box>
                  <text fg={theme.text}>
                    <b>Tools</b>
                  </text>
                  <For each={item().tools}>
                    {(tool) => (
                      <text fg={theme.text} wrapMode="word">
                        {tool.name} <span style={{ fg: theme.textMuted }}>{fmt(tool.count)} calls</span>
                      </text>
                    )}
                  </For>
                </box>
              </Show>
              <Show when={item().subagents.length > 0}>
                <box>
                  <text fg={theme.text}>
                    <b>Subagents</b>
                  </text>
                  <For each={item().subagents}>
                    {(sub) => (
                      <text fg={theme.text} wrapMode="word">
                        {sub.agent}{" "}
                        <span style={{ fg: theme.textMuted }}>
                          {sub.title} · {dollars(sub.cost)}
                        </span>
                      </text>
                    )}
                  </For>
                </box>
              </Show>
            </>
          )}
        </Show>
      </scrollbox>
    </box>
  )
}
