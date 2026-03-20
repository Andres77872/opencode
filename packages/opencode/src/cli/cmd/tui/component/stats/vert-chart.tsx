import { For, createMemo } from "solid-js"
import { useTheme } from "@tui/context/theme"

export function VertChart(props: {
  data: { label: string; value: number }[]
  height?: number
  fill?: string
  prefix?: string
}) {
  const { theme } = useTheme()
  const h = () => props.height ?? 8
  const char = () => props.fill ?? "#"
  const pre = () => props.prefix ?? "$"

  const max = createMemo(() => {
    let m = 0
    for (const d of props.data) if (d.value > m) m = d.value
    return m || 1
  })

  const scale = createMemo(() => max() / h())

  const ypad = createMemo(() => {
    const top = pre() + Math.ceil(max()).toString()
    return top.length
  })

  const rows = createMemo(() => {
    const lines: string[] = []
    for (let r = h(); r >= 1; r--) {
      const threshold = r * scale()
      const label = (pre() + Math.round(threshold).toString()).padStart(ypad())
      let line = label + " |"
      for (const d of props.data) {
        line += d.value >= threshold ? " " + char() + char() : "   "
      }
      lines.push(line)
    }
    return lines
  })

  const axis = createMemo(() => {
    const pad = " ".repeat(ypad())
    let line = pad + " +"
    for (let i = 0; i < props.data.length; i++) line += "---"
    return line
  })

  const labels = createMemo(() => {
    const pad = " ".repeat(ypad() + 2)
    return pad + props.data.map((d) => d.label.slice(0, 3).padStart(3)).join("")
  })

  return (
    <box>
      <For each={rows()}>
        {(line) => (
          <text fg={theme.text}>
            <span style={{ fg: theme.textMuted }}>{line.slice(0, ypad() + 2)}</span>
            <span style={{ fg: theme.primary }}>{line.slice(ypad() + 2)}</span>
          </text>
        )}
      </For>
      <text fg={theme.textMuted}>{axis()}</text>
      <text fg={theme.textMuted}>{labels()}</text>
    </box>
  )
}
