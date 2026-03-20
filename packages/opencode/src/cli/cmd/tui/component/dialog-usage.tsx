import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import { For, Show, createMemo, createSignal, createResource } from "solid-js"
import { Auth } from "@/auth"
import type { AssistantMessage } from "@opencode-ai/sdk/v2"

type ModelUsage = {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
  cost: number
  count: number
}

type ProviderUsage = {
  id: string
  name: string
  models: Record<string, ModelUsage>
  total: ModelUsage
}

type CopilotInfo = {
  login: string
  plan?: string
}

async function copilot(): Promise<CopilotInfo | null> {
  const auth = await Auth.get("github-copilot").catch(() => null)
  if (!auth || auth.type !== "oauth") return null
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${auth.refresh}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  }).catch(() => null)
  if (!res || !res.ok) return null
  const data = (await res.json().catch(() => null)) as { login?: string; plan?: { name?: string } } | null
  if (!data) return null
  return { login: data.login ?? "unknown", plan: data.plan?.name }
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

function aggregate(messages: AssistantMessage[], providers: { id: string; name: string }[]) {
  const result: Record<string, ProviderUsage> = {}
  for (const msg of messages) {
    const pid = msg.providerID
    if (!result[pid]) {
      const meta = providers.find((p) => p.id === pid)
      result[pid] = {
        id: pid,
        name: meta?.name ?? pid,
        models: {},
        total: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, cost: 0, count: 0 },
      }
    }
    const prov = result[pid]
    if (!prov.models[msg.modelID]) {
      prov.models[msg.modelID] = {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
        cost: 0,
        count: 0,
      }
    }
    const model = prov.models[msg.modelID]

    model.input += msg.tokens.input
    model.output += msg.tokens.output
    model.reasoning += msg.tokens.reasoning
    model.cache.read += msg.tokens.cache.read
    model.cache.write += msg.tokens.cache.write
    model.cost += msg.cost
    model.count += 1

    prov.total.input += msg.tokens.input
    prov.total.output += msg.tokens.output
    prov.total.reasoning += msg.tokens.reasoning
    prov.total.cache.read += msg.tokens.cache.read
    prov.total.cache.write += msg.tokens.cache.write
    prov.total.cost += msg.cost
    prov.total.count += 1
  }
  return Object.values(result).toSorted((a, b) => b.total.count - a.total.count)
}

export function DialogUsage() {
  const sync = useSync()
  const sdk = useSDK()
  const { theme } = useTheme()
  const dialog = useDialog()
  const [expanded, setExpanded] = createSignal<string | null>(null)

  const [info] = createResource(copilot)

  const [data] = createResource(async () => {
    const sessions = sync.data.session
    const all: AssistantMessage[] = []
    const batch = 20
    for (let i = 0; i < sessions.length; i += batch) {
      const chunk = sessions.slice(i, i + batch)
      const results = await Promise.all(
        chunk.map((s) => sdk.client.session.messages({ sessionID: s.id }).then((r) => r.data ?? [])),
      )
      for (const msgs of results) {
        for (const m of msgs) {
          if (m.info.role === "assistant") all.push(m.info)
        }
      }
    }
    return all
  })

  const usage = createMemo(() => {
    if (!data()) return []
    return aggregate(data()!, sync.data.provider)
  })

  const grand = createMemo(() =>
    usage().reduce(
      (acc, p) => ({
        input: acc.input + p.total.input,
        output: acc.output + p.total.output,
        cost: acc.cost + p.total.cost,
        count: acc.count + p.total.count,
      }),
      { input: 0, output: 0, cost: 0, count: 0 },
    ),
  )

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

      <Show when={data.loading}>
        <text fg={theme.textMuted}>Loading usage data…</text>
      </Show>

      <Show when={!data.loading}>
        <box>
          <text fg={theme.textMuted}>
            Total: {fmt(grand().count)} messages · {fmt(grand().input + grand().output)} tokens ·{" "}
            {dollars(grand().cost)}
          </text>
        </box>
      </Show>

      <Show when={info() && !info.loading}>
        <box>
          <text fg={theme.text}>
            <b>GitHub Copilot</b>
          </text>
          <text fg={theme.textMuted}>
            User: <span style={{ fg: theme.text }}>{info()!.login}</span>
            {info()!.plan ? (
              <>
                {" "}
                · Plan: <span style={{ fg: theme.text }}>{info()!.plan}</span>
              </>
            ) : null}
          </text>
        </box>
      </Show>

      <Show when={!data.loading && usage().length === 0}>
        <text fg={theme.textMuted}>No usage data yet</text>
      </Show>

      <For each={usage()}>
        {(prov) => {
          const models = () => Object.entries(prov.models).toSorted(([, a], [, b]) => b.count - a.count)
          const open = () => expanded() === prov.id
          return (
            <box>
              <box flexDirection="row" gap={1} onMouseDown={() => setExpanded(open() ? null : prov.id)}>
                <text fg={theme.text}>{open() ? "▼" : "▶"}</text>
                <text fg={theme.text} wrapMode="word">
                  <b>{prov.name}</b>{" "}
                  <span style={{ fg: theme.textMuted }}>
                    {fmt(prov.total.count)} msgs · {fmt(prov.total.input)} in · {fmt(prov.total.output)} out ·{" "}
                    {dollars(prov.total.cost)}
                  </span>
                </text>
              </box>
              <Show when={open()}>
                <For each={models()}>
                  {([id, model]) => (
                    <box paddingLeft={3}>
                      <text fg={theme.text} wrapMode="word">
                        {id}{" "}
                        <span style={{ fg: theme.textMuted }}>
                          {fmt(model.count)} msgs · {fmt(model.input)} in · {fmt(model.output)} out
                          {model.reasoning > 0 ? ` · ${fmt(model.reasoning)} reasoning` : ""}
                          {model.cache.read > 0 ? ` · ${fmt(model.cache.read)} cache` : ""} · {dollars(model.cost)}
                        </span>
                      </text>
                    </box>
                  )}
                </For>
              </Show>
            </box>
          )
        }}
      </For>
    </box>
  )
}
