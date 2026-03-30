import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import { useStats } from "./context"

export function TabBar() {
  const { theme } = useTheme()
  const stats = useStats()

  return (
    <box flexDirection="row" flexShrink={0} paddingLeft={1} paddingRight={1}>
      <For each={[...stats.tabs]}>
        {(name, index) => (
          <text>
            {index() > 0 ? <span style={{ fg: theme.textMuted }}> │ </span> : ""}
            <span
              style={{ fg: stats.tab === index() ? theme.primary : theme.textMuted, bold: stats.tab === index() }}
            >{` ${name.charAt(0).toUpperCase() + name.slice(1)} `}</span>
          </text>
        )}
      </For>
    </box>
  )
}
