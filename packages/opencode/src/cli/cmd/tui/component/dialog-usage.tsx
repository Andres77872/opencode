import { TextAttributes } from "@opentui/core"
import { useDialog } from "@tui/ui/dialog"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "../context/theme"
import { For, Show, createMemo, createResource, onMount } from "solid-js"
import { Stats } from "@/session/stats"

function fmt(n: number) {
  return n.toLocaleString()
}

function dollars(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

export function DialogUsage() {
  const sync = useSync()
  const sdk = useSDK()
  const { theme } = useTheme()
  const dialog = useDialog()

  onMount(() => {
    dialog.setSize("large")
  })

  const source: Stats.Source = {
    sessions: sync.data.globalSession,
    messages: async (sessionID) => (await sdk.client.session.messages({ sessionID })).data ?? [],
    children: async (sessionID) => (await sdk.client.session.children({ sessionID })).data ?? [],
  }

  const [models] = createResource(() => Stats.models(source, {}))
  const [overview] = createResource(() => Stats.overview(source, {}))

  const providers = createMemo(() => {
    const map = new Map<
      string,
      {
        id: string
        name: string
        total: {
          input: number
          output: number
          reasoning: number
          cacheRead: number
          cacheWrite: number
          cost: number
          count: number
        }
        models: {
          id: string
          input: number
          output: number
          reasoning: number
          cacheRead: number
          cacheWrite: number
          cost: number
          count: number
        }[]
      }
    >()
    for (const item of models() ?? []) {
      const row = map.get(item.providerID) ?? {
        id: item.providerID,
        name: sync.data.provider.find((provider) => provider.id === item.providerID)?.name ?? item.providerID,
        total: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, count: 0 },
        models: [],
      }
      row.total.input += item.input
      row.total.output += item.output
      row.total.reasoning += item.reasoning
      row.total.cacheRead += item.cacheRead
      row.total.cacheWrite += item.cacheWrite
      row.total.cost += item.cost
      row.total.count += item.messages
      row.models.push({
        id: item.modelID,
        input: item.input,
        output: item.output,
        reasoning: item.reasoning,
        cacheRead: item.cacheRead,
        cacheWrite: item.cacheWrite,
        cost: item.cost,
        count: item.messages,
      })
      map.set(item.providerID, row)
    }
    return [...map.values()].sort((a, b) => b.total.count - a.total.count)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Usage by Provider
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={sync.data.globalSessionStatus === "loading" || sync.data.globalSessionStatus === "idle"}>
        <text fg={theme.textMuted}>Loading usage data…</text>
      </Show>
      <Show when={sync.data.globalSessionStatus === "error"}>
        <text fg={theme.warning}>
          Usage unavailable: {sync.data.globalSessionError ?? "aggregate session sync failed"}
        </text>
      </Show>
      <Show when={sync.data.globalSessionStatus === "ready" && overview()}>
        <box>
          <text fg={theme.textMuted}>
            Total: {fmt(overview()!.messages)} messages ·{" "}
            {fmt(
              overview()!.tokens.input +
                overview()!.tokens.output +
                overview()!.tokens.reasoning +
                overview()!.tokens.cache.read +
                overview()!.tokens.cache.write,
            )}{" "}
            tokens · {dollars(overview()!.cost)}
          </text>
        </box>
      </Show>
      <Show when={sync.data.globalSessionStatus === "ready" && !models.loading && providers().length === 0}>
        <text fg={theme.textMuted}>No usage data yet</text>
      </Show>
      <For each={providers()}>
        {(provider) => (
          <box flexDirection="column">
            <text fg={theme.text} wrapMode="word">
              <b>{provider.name}</b>{" "}
              <span style={{ fg: theme.textMuted }}>
                {fmt(provider.total.count)} msgs · {fmt(provider.total.input)} in · {fmt(provider.total.output)} out ·{" "}
                {dollars(provider.total.cost)}
              </span>
            </text>
            <For each={provider.models.sort((a, b) => b.count - a.count)}>
              {(model) => (
                <box paddingLeft={3}>
                  <text fg={theme.text} wrapMode="word">
                    {model.id}{" "}
                    <span style={{ fg: theme.textMuted }}>
                      {fmt(model.count)} msgs · {fmt(model.input)} in · {fmt(model.output)} out
                      {model.reasoning > 0 ? ` · ${fmt(model.reasoning)} reasoning` : ""}
                      {model.cacheRead > 0 ? ` · ${fmt(model.cacheRead)} cache` : ""} · {dollars(model.cost)}
                    </span>
                  </text>
                </box>
              )}
            </For>
          </box>
        )}
      </For>
    </box>
  )
}
