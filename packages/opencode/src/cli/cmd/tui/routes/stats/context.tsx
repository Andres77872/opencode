import { createSignal } from "solid-js"
import { createSimpleContext } from "../../context/helper"
import { useSync } from "../../context/sync"
import { useSDK } from "../../context/sdk"
import type { Stats } from "../../../../../session/stats"

const tabs = ["overview", "daily", "models", "tools", "projects", "sessions", "config"] as const
export type TabName = (typeof tabs)[number]

export const { use: useStats, provider: StatsProvider } = createSimpleContext({
  name: "Stats",
  init: () => {
    const [tab, setTab] = createSignal(0)
    const [filter, setFilter] = createSignal<Stats.Filter>({})
    return {
      get tab() {
        return tab()
      },
      get filter() {
        return filter()
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
  }
}
