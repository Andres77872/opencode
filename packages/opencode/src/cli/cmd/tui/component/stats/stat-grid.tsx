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
  const row = (item: GridItem) => (
    <text fg={theme.text}>
      <span style={{ fg: theme.textMuted }}>{(item.label + ":").padEnd(lw())}</span>
      {String(item.value)}
    </text>
  )

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
        <For each={Array.from({ length: Math.max(groups()[0].length, groups()[1]?.length ?? 0) }, (_, index) => index)}>
          {(index) => (
            <box flexDirection="row" gap={4}>
              <box width={lw() + 16}>
                <Show when={groups()[0][index]}>{row(groups()[0][index])}</Show>
              </box>
              <Show when={groups()[1]?.[index]}>
                <box>{row(groups()[1]![index])}</box>
              </Show>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}
