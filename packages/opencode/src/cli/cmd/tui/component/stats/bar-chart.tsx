import type { RGBA } from "@opentui/core"
import { For, createMemo } from "solid-js"
import { useTheme } from "@tui/context/theme"

export type Segment = {
  value: number
  color?: RGBA
  char?: string
}

export function BarChart(props: {
  data: { label: string; value: number; segments?: Segment[] }[]
  width?: number
  fill?: string
  empty?: string
  showValue?: boolean
  valueFormat?: (n: number) => string
}) {
  const { theme } = useTheme()
  const fill = () => props.fill ?? "█"
  const empty = () => props.empty ?? " "
  const show = () => props.showValue ?? true
  const max = createMemo(() => Math.max(1, ...props.data.map((item) => item.value)))
  const pad = createMemo(() => Math.max(0, ...props.data.map((item) => item.label.length)))
  const suffix = createMemo(() => {
    if (!show()) return 0
    return Math.max(
      0,
      ...props.data.map(
        (item) => (props.valueFormat ? props.valueFormat(item.value) : item.value.toLocaleString()).length,
      ),
    )
  })

  return (
    <box>
      <For each={props.data}>
        {(row) => {
          const width = () => props.width ?? 40
          const label = () => row.label.padEnd(pad())
          const text = () => {
            const value = props.valueFormat ? props.valueFormat(row.value) : row.value.toLocaleString()
            return value.padStart(suffix())
          }
          if (row.segments?.length) {
            const segs = () => {
              const total = row.segments!.reduce((sum, item) => sum + item.value, 0) || 1
              let used = 0
              return row.segments!.map((item, index) => {
                const last = index === row.segments!.length - 1
                const w = last ? width() - used : Math.round((item.value / total) * width())
                used += w
                return { ...item, w }
              })
            }
            return (
              <text fg={theme.text}>
                <span style={{ fg: theme.textMuted }}>{label()} </span>
                <For each={segs()}>
                  {(item) => (
                    <span style={{ fg: item.color ?? theme.primary }}>
                      {(item.char ?? fill()).repeat(Math.max(0, item.w))}
                    </span>
                  )}
                </For>
                {show() ? <span style={{ fg: theme.text }}> {text()}</span> : null}
              </text>
            )
          }
          const filled = () => Math.round((row.value / max()) * width())
          return (
            <text fg={theme.text}>
              <span style={{ fg: theme.textMuted }}>{label()} </span>
              <span style={{ fg: theme.primary }}>{fill().repeat(filled()) + empty().repeat(width() - filled())}</span>
              {show() ? <span style={{ fg: theme.text }}> {text()}</span> : null}
            </text>
          )
        }}
      </For>
    </box>
  )
}
