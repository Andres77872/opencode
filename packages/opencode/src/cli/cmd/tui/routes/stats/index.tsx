import { Match, Switch } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useRoute } from "../../context/route"
import { StatsProvider, useStats } from "./context"
import { TabBar } from "./tab-bar"
import { StatusBar } from "./status-bar"
import { Overview } from "./overview"
import { Daily } from "./daily"
import { Models } from "./models"
import { Tools } from "./tools"
import { Projects } from "./projects"
import { Sessions } from "./sessions"
import { Config } from "./config"

function Content() {
  const stats = useStats()
  const route = useRoute()

  useKeyboard((evt) => {
    if (evt.name === "tab" && evt.shift) {
      evt.preventDefault()
      stats.setTab((stats.tab - 1 + stats.tabs.length) % stats.tabs.length)
      return
    }
    if (evt.name === "tab") {
      evt.preventDefault()
      stats.setTab((stats.tab + 1) % stats.tabs.length)
      return
    }
    if (evt.name === "q" || evt.name === "escape") {
      evt.preventDefault()
      route.navigate({ type: "home" })
      return
    }
    if (evt.name === "f") {
      evt.preventDefault()
      // placeholder for filter dialog
      return
    }
    // Number keys 1-7 for tab switching
    const num = parseInt(evt.name ?? "", 10)
    if (num >= 1 && num <= 7) {
      evt.preventDefault()
      stats.setTab(num - 1)
      return
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
