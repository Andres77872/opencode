import { TextAttributes } from "@opentui/core"
import { For, Show, createMemo } from "solid-js"
import { useTheme } from "@tui/context/theme"

type GridItem = {
  label: string
  value: string | number
}

export function StatGrid(props: { title?: string; items: GridItem[]; columns?: number; labelWidth?: number }) {
  const { theme } = useTheme()
  const cols = () => props.columns ?? 1
  const lw = () => props.labelWidth ?? 16

  const groups = createMemo(() => {
    if (cols() <= 1) return [props.items]
    const mid = Math.ceil(props.items.length / 2)
    return [props.items.slice(0, mid), props.items.slice(mid)]
  })

  const row = (item: GridItem) => {
    const label = (item.label + ":").padEnd(lw())
    const val = String(item.value)
    return (
      <text fg={theme.text}>
        <span style={{ fg: theme.textMuted }}>{label}</span>
        {val}
      </text>
    )
  }

  return (
    <box>
      <Show when={props.title}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          {props.title}
        </text>
      </Show>
      <Show when={cols() <= 1}>
        <For each={props.items}>{(item) => row(item)}</For>
      </Show>
      <Show when={cols() > 1}>
        {(() => {
          const left = () => groups()[0]
          const right = () => groups()[1] ?? []
          const count = () => Math.max(left().length, right().length)
          return (
            <For each={Array.from({ length: count() }, (_, i) => i)}>
              {(i) => (
                <box flexDirection="row" gap={4}>
                  <box width={lw() + 16}>
                    <Show when={left()[i]}>{row(left()[i])}</Show>
                  </box>
                  <Show when={right()[i]}>
                    <box>{row(right()[i])}</box>
                  </Show>
                </box>
              )}
            </For>
          )
        })()}
      </Show>
    </box>
  )
}
