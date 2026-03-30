import { For, createMemo } from "solid-js"
import { useTheme } from "@tui/context/theme"

export function VertChart(props: {
  data: { label: string; value: number }[]
  height?: number
  fill?: string
  prefix?: string
}) {
  const { theme } = useTheme()
  const height = () => props.height ?? 8
  const fill = () => props.fill ?? "#"
  const prefix = () => props.prefix ?? "$"
  const max = createMemo(() => Math.max(1, ...props.data.map((item) => item.value)))
  const scale = createMemo(() => max() / height())
  const pad = createMemo(() => (prefix() + Math.ceil(max()).toString()).length)
  const rows = createMemo(() =>
    Array.from({ length: height() }, (_, index) => height() - index).map((row) => {
      const threshold = row * scale()
      const label = (prefix() + Math.round(threshold).toString()).padStart(pad())
      return label + " |" + props.data.map((item) => (item.value >= threshold ? ` ${fill()}${fill()}` : "   ")).join("")
    }),
  )
  const axis = createMemo(() => `${" ".repeat(pad())} +${props.data.map(() => "---").join("")}`)
  const labels = createMemo(
    () => `${" ".repeat(pad() + 2)}${props.data.map((item) => item.label.slice(0, 3).padStart(3)).join("")}`,
  )

  return (
    <box>
      <For each={rows()}>
        {(row) => (
          <text fg={theme.text}>
            <span style={{ fg: theme.textMuted }}>{row.slice(0, pad() + 2)}</span>
            <span style={{ fg: theme.primary }}>{row.slice(pad() + 2)}</span>
          </text>
        )}
      </For>
      <text fg={theme.textMuted}>{axis()}</text>
      <text fg={theme.textMuted}>{labels()}</text>
    </box>
  )
}
