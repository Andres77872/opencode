import { useTheme } from "../../context/theme"
import { useStats } from "./context"

export function StatusBar() {
  const { theme } = useTheme()
  const stats = useStats()
  const range = () => (stats.filter.days ? `${stats.filter.days}d` : "all")
  const project = () => {
    if (!stats.filter.projectID) return "project:all"
    const item = stats.projects.find((project) => project.id === stats.filter.projectID)
    return `project:${item?.name ?? stats.filter.projectID}`
  }
  const model = () => (stats.filter.modelID ? `model:${stats.filter.modelID}` : "model:all")

  return (
    <box flexDirection="row" flexShrink={0} paddingLeft={1} paddingRight={1}>
      <text fg={theme.textMuted}>
        <span style={{ fg: theme.primary }}>[{range()}]</span> {project()} {model()}
      </text>
      <box flexGrow={1} />
      <text fg={theme.textMuted}>q:back tab:next f:days p:project m:model</text>
    </box>
  )
}
