import { For, createMemo } from "solid-js"
import { useTheme } from "@tui/context/theme"
import type { RGBA } from "@opentui/core"

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

  const max = createMemo(() => {
    let m = 0
    for (const d of props.data) if (d.value > m) m = d.value
    return m || 1
  })

  const pad = createMemo(() => {
    let m = 0
    for (const d of props.data) if (d.label.length > m) m = d.label.length
    return m
  })

  const suffix = createMemo(() => {
    if (!show()) return 0
    let m = 0
    for (const d of props.data) {
      const fmt = props.valueFormat ? props.valueFormat(d.value) : d.value.toLocaleString()
      if (fmt.length > m) m = fmt.length
    }
    return m
  })

  return (
    <box>
      <For each={props.data}>
        {(row) => {
          const w = () => props.width ?? 40
          const label = () => row.label.padEnd(pad())
          const fmt = () => {
            const s = props.valueFormat ? props.valueFormat(row.value) : row.value.toLocaleString()
            return s.padStart(suffix())
          }

          if (row.segments && row.segments.length > 0) {
            // Segmented bar — render each segment with its own color
            const segs = () => {
              const total = row.segments!.reduce((s, seg) => s + seg.value, 0) || 1
              const totalW = w()
              let used = 0
              return row.segments!.map((seg, i) => {
                const isLast = i === row.segments!.length - 1
                const segW = isLast ? totalW - used : Math.round((seg.value / total) * totalW)
                used += segW
                return { ...seg, w: segW }
              })
            }
            return (
              <text fg={theme.text}>
                <span style={{ fg: theme.textMuted }}>{label()} </span>
                <For each={segs()}>
                  {(seg) => (
                    <span style={{ fg: seg.color ?? theme.primary }}>
                      {(seg.char ?? fill()).repeat(Math.max(0, seg.w))}
                    </span>
                  )}
                </For>
                {show() ? <span style={{ fg: theme.text }}> {fmt()}</span> : null}
              </text>
            )
          }

          const filled = () => Math.round((row.value / max()) * w())
          const bar = () => fill().repeat(filled()) + empty().repeat(w() - filled())
          return (
            <text fg={theme.text}>
              <span style={{ fg: theme.textMuted }}>{label()} </span>
              <span style={{ fg: theme.primary }}>{bar()}</span>
              {show() ? <span style={{ fg: theme.text }}> {fmt()}</span> : null}
            </text>
          )
        }}
      </For>
    </box>
  )
}
