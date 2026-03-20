import { TextAttributes } from "@opentui/core"
import { For, Show, createMemo, type JSX } from "solid-js"
import { useTheme } from "@tui/context/theme"

type Column = {
  key: string
  label: string
  width?: number
  align?: "left" | "right"
  format?: (value: unknown) => string
}

function cell(value: unknown, col: Column, w: number): string {
  const text = col.format ? col.format(value) : String(value ?? "")
  return col.align === "right" ? text.padStart(w) : text.padEnd(w)
}

function colwidth(col: Column, data: Record<string, unknown>[]): number {
  if (col.width) return col.width
  let max = col.label.length
  for (const row of data) {
    const text = col.format ? col.format(row[col.key]) : String(row[col.key] ?? "")
    if (text.length > max) max = text.length
  }
  return max
}

export function StatTable(props: {
  columns: Column[]
  data: Record<string, unknown>[]
  selected?: number
  expanded?: number
  expandContent?: (row: Record<string, unknown>) => JSX.Element
  sortBy?: string
  sortDir?: "asc" | "desc"
}) {
  const { theme } = useTheme()

  const widths = createMemo(() => props.columns.map((col) => colwidth(col, props.data)))

  const header = createMemo(() => props.columns.map((col, i) => cell(col.label, col, widths()[i])).join("  "))

  return (
    <box>
      <text fg={theme.text} attributes={TextAttributes.BOLD}>
        {header()}
      </text>
      <For each={props.data}>
        {(row, idx) => {
          const active = () => idx() === props.selected
          const open = () => idx() === props.expanded
          const line = () => props.columns.map((col, i) => cell(row[col.key], col, widths()[i])).join("  ")
          return (
            <box>
              <text fg={active() ? theme.primary : theme.text} attributes={active() ? TextAttributes.BOLD : undefined}>
                {active() ? "> " : "  "}
                {line()}
              </text>
              <Show when={open() && props.expandContent}>
                <box paddingLeft={4}>{props.expandContent!(row)}</box>
              </Show>
            </box>
          )
        }}
      </For>
    </box>
  )
}
