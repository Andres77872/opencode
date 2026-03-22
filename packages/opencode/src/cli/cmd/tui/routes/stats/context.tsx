import { createSignal, createResource } from "solid-js"
import { createSimpleContext } from "../../context/helper"
import { useSync } from "../../context/sync"
import { useSDK } from "../../context/sdk"
import type { Stats } from "../../../../../session/stats"

const tabs = ["overview", "daily", "models", "tools", "projects", "sessions", "config"] as const
export type TabName = (typeof tabs)[number]

export const { use: useStats, provider: StatsProvider } = createSimpleContext({
  name: "Stats",
  init: () => {
    const sdk = useSDK()
    const [tab, setTab] = createSignal(0)
    const [filter, setFilter] = createSignal<Stats.Filter>({})
    const [projects] = createResource(async () => {
      const r = await sdk.client.project.list()
      return (r.data ?? []).map((p) => ({
        id: p.id,
        name: p.name || p.worktree?.split("/").pop() || p.id,
      }))
    })
    return {
      get tab() {
        return tab()
      },
      get filter() {
        return filter()
      },
      get projects() {
        return projects() ?? []
      },
      tabs,
      setTab,
      setFilter,
    }
  },
})

export function useSource(): Stats.Source {
  const sync = useSync()
  const sdk = useSDK()
  const stats = useStats()
  return {
    sessions: sync.data.session,
    messages: async (sessionID: string) => {
      const r = await sdk.client.session.messages({ sessionID })
      return r.data ?? []
    },
    children: async (sessionID: string) => {
      const r = await sdk.client.session.children({ sessionID })
      return r.data ?? []
    },
    projects: stats.projects,
  }
}
