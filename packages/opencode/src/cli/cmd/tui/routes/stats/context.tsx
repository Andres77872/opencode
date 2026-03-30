import { createMemo, createResource, createSignal } from "solid-js"
import type { Stats } from "@/session/stats"
import { createSimpleContext } from "../../context/helper"
import { useSDK } from "../../context/sdk"
import { useSync } from "../../context/sync"

const tabs = ["overview", "daily", "models", "tools", "projects", "sessions", "config"] as const

export const { use: useStats, provider: StatsProvider } = createSimpleContext({
  name: "Stats",
  init: () => {
    const sdk = useSDK()
    const sync = useSync()
    const [tab, setTab] = createSignal(0)
    const [filter, setFilter] = createSignal<Stats.Filter>({})
    const [projects] = createResource(async () => {
      const result = await sdk.client.project.list()
      return (result.data ?? []).map((item) => ({
        id: item.id,
        name: item.name || item.worktree?.split("/").pop() || item.id,
      }))
    })
    const models = createMemo(() =>
      sync.data.provider_next.all.flatMap((provider) =>
        Object.values(provider.models).map((model) => ({ id: model.id, name: model.name })),
      ),
    )
    return {
      tabs,
      get tab() {
        return tab()
      },
      get filter() {
        return filter()
      },
      get projects() {
        return projects() ?? []
      },
      get models() {
        return models()
      },
      get status() {
        return sync.data.globalSessionStatus
      },
      get error() {
        return sync.data.globalSessionError
      },
      get loading() {
        return sync.data.globalSessionStatus === "loading" || sync.data.globalSessionStatus === "idle"
      },
      get unavailable() {
        return sync.data.globalSessionStatus === "error"
      },
      setTab,
      setFilter,
    }
  },
})

export function useSource(): Stats.Source {
  const sdk = useSDK()
  const sync = useSync()
  const stats = useStats()
  return {
    sessions: sync.data.globalSession,
    messages: async (sessionID: string) => (await sdk.client.session.messages({ sessionID })).data ?? [],
    children: async (sessionID: string) => (await sdk.client.session.children({ sessionID })).data ?? [],
    projects: stats.projects,
  }
}
