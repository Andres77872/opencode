import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { For, Show, createMemo } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"

function dash(text: string | undefined) {
  return !text || text === "none" || text === "" ? "—" : text
}

function mcpColor(status: string, theme: ReturnType<typeof useTheme>["theme"]) {
  if (status === "running" || status === "connected") return theme.success
  if (status === "stopped" || status === "disabled") return theme.textMuted
  return theme.warning
}

function SectionHeader(props: { label: string }) {
  const { theme } = useTheme()
  return (
    <text fg={theme.primary} attributes={TextAttributes.BOLD}>
      {props.label}
    </text>
  )
}

function Row(props: { label: string; value: string; dim?: boolean; lw?: number }) {
  const { theme } = useTheme()
  return (
    <text fg={theme.text}>
      <span style={{ fg: theme.textMuted }}>{(props.label + ":").padEnd(props.lw ?? 16)}</span>
      <span style={{ fg: props.dim ? theme.textMuted : theme.text }}>{props.value}</span>
    </text>
  )
}

export function Config() {
  const { theme, selected } = useTheme()
  const sync = useSync()
  const local = useLocal()
  const dim = useTerminalDimensions()
  const wide = () => dim().width >= 100
  const providers = createMemo(() => sync.data.provider.map((item) => ({ label: item.name ?? item.id, id: item.id })))
  const agents = createMemo(() =>
    local.agent
      .list()
      .filter((item) => !item.hidden)
      .map((item) => ({
        name: item.name,
        model: item.model ? `${item.model.providerID}/${item.model.modelID}` : undefined,
      })),
  )
  const mcp = createMemo(() => Object.entries(sync.data.mcp))
  const paths = createMemo(() => ({ config: sync.data.path.config || "—", state: sync.data.path.state || "—" }))

  return (
    <box flexDirection="column" gap={1}>
      <Show when={!wide()}>
        <SectionHeader label="PROVIDERS" />
        <Show when={providers().length === 0}>
          <text fg={theme.textMuted}>No providers configured</text>
        </Show>
        <For each={providers()}>{(item) => <Row label={item.label} value="configured" lw={20} />}</For>
        <SectionHeader label="MODELS" />
        <Row label="Default" value={dash(sync.data.config.model)} dim={dash(sync.data.config.model) === "—"} />
        <Row
          label="Small"
          value={dash(sync.data.config.small_model)}
          dim={dash(sync.data.config.small_model) === "—"}
        />
        <SectionHeader label="AGENTS" />
        <For each={agents()}>
          {(item) => <Row label={item.name} value={dash(item.model)} dim={!item.model} lw={14} />}
        </For>
        <SectionHeader label="MCP SERVERS" />
        <Show when={mcp().length === 0}>
          <text fg={theme.textMuted}>No MCP servers configured</text>
        </Show>
        <For each={mcp()}>
          {([name, item]) => {
            const state = item.status === "connected" ? "running" : item.status === "disabled" ? "stopped" : item.status
            return (
              <text fg={theme.text}>
                <span style={{ fg: theme.textMuted }}>{(name + ":").padEnd(20)}</span>
                <span style={{ fg: mcpColor(state, theme) }}>{state}</span>
              </text>
            )
          }}
        </For>
        <SectionHeader label="THEME" />
        <Row label="Active" value={selected} lw={10} />
        <SectionHeader label="PATHS" />
        <Row label="Config" value={paths().config} lw={10} />
        <Row label="State" value={paths().state} lw={10} />
      </Show>
      <Show when={wide()}>
        <box flexDirection="row" gap={6}>
          <box flexDirection="column" gap={1} width="50%">
            <SectionHeader label="PROVIDERS" />
            <Show when={providers().length === 0}>
              <text fg={theme.textMuted}>No providers configured</text>
            </Show>
            <For each={providers()}>
              {(item) => (
                <text fg={theme.text}>
                  <span style={{ fg: theme.textMuted }}>{(item.label + ":").padEnd(20)}</span>
                  <span style={{ fg: theme.success }}>configured</span>
                </text>
              )}
            </For>
            <SectionHeader label="MODELS" />
            <text fg={theme.text}>
              <span style={{ fg: theme.textMuted }}>{"Default:".padEnd(16)}</span>
              <span style={{ fg: dash(sync.data.config.model) === "—" ? theme.textMuted : theme.text }}>
                {dash(sync.data.config.model)}
              </span>
            </text>
            <text fg={theme.text}>
              <span style={{ fg: theme.textMuted }}>{"Small:".padEnd(16)}</span>
              <span style={{ fg: dash(sync.data.config.small_model) === "—" ? theme.textMuted : theme.text }}>
                {dash(sync.data.config.small_model)}
              </span>
            </text>
            <SectionHeader label="SETTINGS" />
            <text fg={theme.text}>
              <span style={{ fg: theme.textMuted }}>{"Default agent:".padEnd(16)}</span>
              <span style={{ fg: dash(sync.data.config.default_agent) === "—" ? theme.textMuted : theme.text }}>
                {dash(sync.data.config.default_agent)}
              </span>
            </text>
            <text fg={theme.text}>
              <span style={{ fg: theme.textMuted }}>{"Theme:".padEnd(16)}</span>
              {selected}
            </text>
            <SectionHeader label="PATHS" />
            <text fg={theme.textMuted}>
              config: <span style={{ fg: theme.text }}>{paths().config}</span>
            </text>
            <text fg={theme.textMuted}>
              state: <span style={{ fg: theme.text }}>{paths().state}</span>
            </text>
          </box>
          <box flexDirection="column" gap={1} width="50%">
            <SectionHeader label="AGENTS" />
            <For each={agents()}>
              {(item) => (
                <text fg={theme.text}>
                  <span style={{ fg: theme.textMuted }}>{(item.name + ":").padEnd(14)}</span>
                  <span style={{ fg: !item.model ? theme.textMuted : theme.text }}>{dash(item.model)}</span>
                </text>
              )}
            </For>
            <SectionHeader label="MCP SERVERS" />
            <Show when={mcp().length === 0}>
              <text fg={theme.textMuted}>No MCP servers configured</text>
            </Show>
            <For each={mcp()}>
              {([name, item]) => {
                const state =
                  item.status === "connected" ? "running" : item.status === "disabled" ? "stopped" : item.status
                return (
                  <text fg={theme.text}>
                    <span style={{ fg: theme.textMuted }}>{(name + ":").padEnd(20)}</span>
                    <span style={{ fg: mcpColor(state, theme) }}>{state}</span>
                  </text>
                )
              }}
            </For>
          </box>
        </box>
      </Show>
    </box>
  )
}
