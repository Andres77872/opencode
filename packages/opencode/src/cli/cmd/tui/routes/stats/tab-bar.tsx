import { For } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { useStats } from "./context"

export function TabBar() {
  const { theme } = useTheme()
  const stats = useStats()

  return (
    <box flexDirection="row" flexShrink={0} paddingLeft={1} paddingRight={1}>
      <For each={[...stats.tabs]}>
        {(name, i) => (
          <text>
            {i() > 0 ? <span style={{ fg: theme.textMuted }}> │ </span> : ""}
            <span
              style={{
                fg: stats.tab === i() ? theme.primary : theme.textMuted,
                bold: stats.tab === i(),
              }}
            >
              {" "}
              {name.charAt(0).toUpperCase() + name.slice(1)}{" "}
            </span>
          </text>
        )}
      </For>
    </box>
  )
}
