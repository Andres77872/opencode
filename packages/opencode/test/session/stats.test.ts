import { beforeEach, describe, expect, test } from "bun:test"
import type { GlobalSession, Message, Part, Session } from "@opencode-ai/sdk/v2"
import { Stats } from "../../src/session/stats"

function session(id: string, projectID: string, created = 1000): Session {
  return {
    id,
    slug: id,
    projectID,
    directory: "/tmp",
    title: id,
    version: "1",
    time: { created, updated: created + 100 },
  }
}

function globalSession(id: string, projectID: string, name: string, created = 1000): GlobalSession {
  return {
    ...session(id, projectID, created),
    project: {
      id: projectID,
      name,
      worktree: "/tmp/worktree",
    },
  }
}

function msg(id: string, sessionID: string, modelID: string, cost: number): { info: Message; parts: Part[] } {
  return {
    info: {
      id,
      sessionID,
      role: "assistant",
      modelID,
      providerID: "test",
      parentID: "",
      mode: "default",
      agent: "default",
      path: { cwd: "/tmp", root: "/tmp" },
      cost,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 0 },
    } as unknown as Message,
    parts: [],
  }
}

function source(sessions: Session[], map: Record<string, { info: Message; parts: Part[] }[]>): Stats.Source {
  return {
    sessions,
    messages: async (id) => map[id] ?? [],
    children: async () => [],
    projects: [],
  }
}

function globalSource(
  sessions: GlobalSession[],
  map: Record<string, { info: Message; parts: Part[] }[]>,
): Stats.Source {
  return {
    sessions,
    messages: async (id) => map[id] ?? [],
    children: async () => [],
    projects: [],
  }
}

describe("Stats", () => {
  beforeEach(() => Stats.clearCache())

  test("filters sessions by project and model", async () => {
    const s1 = session("s1", "p1")
    const s2 = session("s2", "p2")
    const src = source([s1, s2], {
      s1: [msg("m1", "s1", "gpt-4o", 1)],
      s2: [msg("m2", "s2", "claude-3", 2)],
    })
    const result = await Stats.sessions(src, { projectID: "p1", modelID: "gpt-4o" }, { field: "date", dir: "desc" }, 0)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe("s1")
    expect(result.items[0].cost).toBe(1)
  })

  test("returns empty but valid stats when no sessions match model filter", async () => {
    const src = source([session("s1", "p1")], {
      s1: [msg("m1", "s1", "claude-3", 2)],
    })
    const overview = await Stats.overview(src, { modelID: "gpt-4o" })
    const daily = await Stats.daily(src, { modelID: "gpt-4o" })
    const projects = await Stats.projects(src, { modelID: "gpt-4o" })
    const sessions = await Stats.sessions(src, { modelID: "gpt-4o" }, { field: "date", dir: "desc" }, 0)
    expect(overview.sessions).toBe(0)
    expect(overview.messages).toBe(0)
    expect(overview.cost).toBe(0)
    expect(daily).toHaveLength(0)
    expect(projects).toHaveLength(0)
    expect(sessions.items).toHaveLength(0)
  })

  test("aggregates global sessions across projects", async () => {
    const g1 = globalSession("s1", "p1", "Project Alpha")
    const g2 = globalSession("s2", "p2", "Project Beta")
    const g3 = globalSession("s3", "p1", "Project Alpha")
    const src = globalSource([g1, g2, g3], {
      s1: [msg("m1", "s1", "gpt-4o", 1)],
      s2: [msg("m2", "s2", "gpt-4o", 2)],
      s3: [msg("m3", "s3", "gpt-4o", 3)],
    })
    const overview = await Stats.overview(src, {})
    const projects = await Stats.projects(src, {})
    expect(overview.sessions).toBe(3)
    expect(overview.cost).toBe(6)
    expect(projects.find((item) => item.projectID === "p1")?.cost).toBe(4)
    expect(projects.find((item) => item.projectID === "p2")?.cost).toBe(2)
  })

  test("overview filters sessions by modelID", async () => {
    const s1 = session("s1", "p1", 1000)
    const s2 = session("s2", "p1", 2000)
    const src = source([s1, s2], {
      s1: [msg("m1", "s1", "gpt-4o", 1), msg("m2", "s1", "gpt-4o", 2)],
      s2: [msg("m3", "s2", "claude-3", 5)],
    })
    const overview = await Stats.overview(src, { modelID: "gpt-4o" })
    expect(overview.sessions).toBe(1)
    expect(overview.messages).toBe(2)
    expect(overview.cost).toBe(3)
  })

  test("daily filters sessions by modelID per day", async () => {
    const day1 = new Date("2024-01-01").getTime()
    const day2 = new Date("2024-01-02").getTime()
    const s1 = session("s1", "p1", day1)
    const s2 = session("s2", "p1", day1)
    const s3 = session("s3", "p1", day2)
    const src = source([s1, s2, s3], {
      s1: [msg("m1", "s1", "gpt-4o", 1)],
      s2: [msg("m2", "s2", "claude-3", 2)],
      s3: [msg("m3", "s3", "gpt-4o", 3)],
    })
    const daily = await Stats.daily(src, { modelID: "gpt-4o" })
    const day1Row = daily.find((d) => d.date === "2024-01-01")
    const day2Row = daily.find((d) => d.date === "2024-01-02")
    expect(day1Row?.sessions).toBe(1)
    expect(day1Row?.messages).toBe(1)
    expect(day1Row?.cost).toBe(1)
    expect(day2Row?.sessions).toBe(1)
    expect(day2Row?.messages).toBe(1)
    expect(day2Row?.cost).toBe(3)
  })

  test("projects filters sessions by modelID per project", async () => {
    const s1 = session("s1", "p1")
    const s2 = session("s2", "p1")
    const s3 = session("s3", "p2")
    const src = source([s1, s2, s3], {
      s1: [msg("m1", "s1", "gpt-4o", 1)],
      s2: [msg("m2", "s2", "claude-3", 2)],
      s3: [msg("m3", "s3", "gpt-4o", 3)],
    })
    const projects = await Stats.projects(src, { modelID: "gpt-4o" })
    expect(projects).toHaveLength(2)
    const p1 = projects.find((p) => p.projectID === "p1")
    const p2 = projects.find((p) => p.projectID === "p2")
    expect(p1?.sessions).toBe(1)
    expect(p1?.cost).toBe(1)
    expect(p2?.sessions).toBe(1)
    expect(p2?.cost).toBe(3)
  })

  test("handles empty source sessions", async () => {
    const src = source([], {})
    const overview = await Stats.overview(src, {})
    const daily = await Stats.daily(src, {})
    const projects = await Stats.projects(src, {})
    const sessions = await Stats.sessions(src, {}, { field: "date", dir: "desc" }, 0)
    expect(overview.sessions).toBe(0)
    expect(overview.messages).toBe(0)
    expect(overview.cost).toBe(0)
    expect(daily).toHaveLength(0)
    expect(projects).toHaveLength(0)
    expect(sessions.items).toHaveLength(0)
  })
})
