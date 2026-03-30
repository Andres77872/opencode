import { Match, Switch } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useRoute } from "../../context/route"
import { StatsProvider, useStats } from "./context"
import { Config } from "./config"
import { Daily } from "./daily"
import { Models } from "./models"
import { Overview } from "./overview"
import { Projects } from "./projects"
import { Sessions } from "./sessions"
import { StatusBar } from "./status-bar"
import { TabBar } from "./tab-bar"
import { Tools } from "./tools"

const presets = [7, 30, 90, undefined] as const

function Content() {
  const stats = useStats()
  const route = useRoute()

  useKeyboard((evt) => {
    if (evt.name === "tab" && evt.shift) {
      evt.preventDefault()
      evt.stopPropagation()
      stats.setTab((stats.tab - 1 + stats.tabs.length) % stats.tabs.length)
      return
    }
    if (evt.name === "tab") {
      evt.preventDefault()
      evt.stopPropagation()
      stats.setTab((stats.tab + 1) % stats.tabs.length)
      return
    }
    if (evt.name === "q" || evt.name === "escape") {
      evt.preventDefault()
      evt.stopPropagation()
      route.navigate({ type: "home" })
      return
    }
    if (evt.name === "f") {
      evt.preventDefault()
      evt.stopPropagation()
      const idx = presets.indexOf(stats.filter.days as (typeof presets)[number])
      stats.setFilter({ ...stats.filter, days: presets[(idx + 1) % presets.length] })
      return
    }
    if (evt.name === "p") {
      evt.preventDefault()
      evt.stopPropagation()
      if (stats.projects.length === 0) return
      if (!stats.filter.projectID) {
        stats.setFilter({ ...stats.filter, projectID: stats.projects[0].id })
        return
      }
      const idx = stats.projects.findIndex((item) => item.id === stats.filter.projectID)
      if (idx === -1 || idx === stats.projects.length - 1) {
        stats.setFilter({ ...stats.filter, projectID: undefined })
        return
      }
      stats.setFilter({ ...stats.filter, projectID: stats.projects[idx + 1].id })
      return
    }
    if (evt.name === "m") {
      evt.preventDefault()
      evt.stopPropagation()
      if (stats.models.length === 0) return
      if (!stats.filter.modelID) {
        stats.setFilter({ ...stats.filter, modelID: stats.models[0].id })
        return
      }
      const idx = stats.models.findIndex((item) => item.id === stats.filter.modelID)
      if (idx === -1 || idx === stats.models.length - 1) {
        stats.setFilter({ ...stats.filter, modelID: undefined })
        return
      }
      stats.setFilter({ ...stats.filter, modelID: stats.models[idx + 1].id })
      return
    }
    const num = parseInt(evt.name ?? "", 10)
    if (num >= 1 && num <= stats.tabs.length) {
      evt.preventDefault()
      evt.stopPropagation()
      stats.setTab(num - 1)
    }
  })

  return (
    <box flexDirection="column" height="100%">
      <TabBar />
      <box flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={1}>
        <Switch>
          <Match when={stats.tab === 0}>
            <Overview />
          </Match>
          <Match when={stats.tab === 1}>
            <Daily />
          </Match>
          <Match when={stats.tab === 2}>
            <Models />
          </Match>
          <Match when={stats.tab === 3}>
            <Tools />
          </Match>
          <Match when={stats.tab === 4}>
            <Projects />
          </Match>
          <Match when={stats.tab === 5}>
            <Sessions />
          </Match>
          <Match when={stats.tab === 6}>
            <Config />
          </Match>
        </Switch>
      </box>
      <StatusBar />
    </box>
  )
}

export function Stats() {
  return (
    <StatsProvider>
      <Content />
    </StatsProvider>
  )
}
