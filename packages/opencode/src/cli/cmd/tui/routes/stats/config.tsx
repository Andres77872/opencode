import { TextAttributes } from "@opentui/core"
import { For, Show, createMemo } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { useTerminalDimensions } from "@opentui/solid"

function dash(s: string | undefined): string {
  return !s || s === "none" || s === "" ? "—" : s
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
  const lw = () => props.lw ?? 16
  return (
    <text fg={theme.text}>
      <span style={{ fg: theme.textMuted }}>{(props.label + ":").padEnd(lw())}</span>
      <span style={{ fg: props.dim ? theme.textMuted : theme.text }}>{props.value}</span>
    </text>
  )
}

export function Config() {
  const { theme } = useTheme()
  const selected = useTheme().selected
  const sync = useSync()
  const local = useLocal()
  const dimensions = useTerminalDimensions()

  const wide = () => dimensions().width >= 100

  const providers = createMemo(() =>
    sync.data.provider.map((p) => ({
      label: p.name ?? p.id,
      id: p.id,
    })),
  )

  const agents = createMemo(() =>
    local.agent
      .list()
      .filter((a) => !a.hidden)
      .map((a) => ({
        name: a.name,
        model: a.model ? `${a.model.providerID}/${a.model.modelID}` : undefined,
      })),
  )

  const cfg = () => sync.data.config

  const defaultModel = () => dash(cfg().model)
  const smallModel = () => dash(cfg().small_model)
  const defaultAgent = () => dash(cfg().default_agent)

  const mcp = createMemo(() => Object.entries(sync.data.mcp))

  const paths = createMemo(() => {
    const p = sync.data.path
    return {
      config: p.config || "—",
      state: p.state || "—",
      dir: p.directory || "—",
    }
  })

  return (
    <box flexDirection="column" gap={1}>
      <Show when={!wide()}>
        {/* Narrow layout — single column stacked sections */}
        <SectionHeader label="PROVIDERS" />
        <Show when={providers().length === 0}>
          <text fg={theme.textMuted}>No providers configured</text>
        </Show>
        <For each={providers()}>{(p) => <Row label={p.label} value="configured" lw={20} />}</For>

        <SectionHeader label="MODELS" />
        <Row label="Default" value={defaultModel()} dim={defaultModel() === "—"} />
        <Row label="Small" value={smallModel()} dim={smallModel() === "—"} />

        <SectionHeader label="AGENTS" />
        <For each={agents()}>{(a) => <Row label={a.name} value={dash(a.model)} dim={!a.model} lw={14} />}</For>

        <SectionHeader label="MCP SERVERS" />
        <Show when={mcp().length === 0}>
          <text fg={theme.textMuted}>No MCP servers configured</text>
        </Show>
        <For each={mcp()}>
          {([name, status]) => {
            const state =
              status.status === "connected" ? "running" : status.status === "disabled" ? "stopped" : status.status
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
        {/* Wide layout — two columns */}
        <box flexDirection="row" gap={6}>
          {/* Left column */}
          <box flexDirection="column" gap={1} width="50%">
            <SectionHeader label="PROVIDERS" />
            <Show when={providers().length === 0}>
              <text fg={theme.textMuted}>No providers configured</text>
            </Show>
            <For each={providers()}>
              {(p) => (
                <text fg={theme.text}>
                  <span style={{ fg: theme.textMuted }}>{(p.label + ":").padEnd(20)}</span>
                  <span style={{ fg: theme.success }}>configured</span>
                </text>
              )}
            </For>

            <SectionHeader label="MODELS" />
            <text fg={theme.text}>
              <span style={{ fg: theme.textMuted }}>{"Default:".padEnd(16)}</span>
              <span style={{ fg: defaultModel() === "—" ? theme.textMuted : theme.text }}>{defaultModel()}</span>
            </text>
            <text fg={theme.text}>
              <span style={{ fg: theme.textMuted }}>{"Small:".padEnd(16)}</span>
              <span style={{ fg: smallModel() === "—" ? theme.textMuted : theme.text }}>{smallModel()}</span>
            </text>

            <SectionHeader label="SETTINGS" />
            <text fg={theme.text}>
              <span style={{ fg: theme.textMuted }}>{"Default agent:".padEnd(16)}</span>
              <span style={{ fg: defaultAgent() === "—" ? theme.textMuted : theme.text }}>{defaultAgent()}</span>
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

          {/* Right column */}
          <box flexDirection="column" gap={1} width="50%">
            <SectionHeader label="AGENTS" />
            <For each={agents()}>
              {(a) => (
                <text fg={theme.text}>
                  <span style={{ fg: theme.textMuted }}>{(a.name + ":").padEnd(14)}</span>
                  <span style={{ fg: !a.model ? theme.textMuted : theme.text }}>{dash(a.model)}</span>
                </text>
              )}
            </For>

            <SectionHeader label="MCP SERVERS" />
            <Show when={mcp().length === 0}>
              <text fg={theme.textMuted}>No MCP servers configured</text>
            </Show>
            <For each={mcp()}>
              {([name, status]) => {
                const state =
                  status.status === "connected" ? "running" : status.status === "disabled" ? "stopped" : status.status
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
