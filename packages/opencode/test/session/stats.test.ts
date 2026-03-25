import { describe, expect, test, beforeEach } from "bun:test"
import { Stats } from "../../src/session/stats"
import type { Session, Message, Part, GlobalSession } from "@opencode-ai/sdk/v2"

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

function globalSession(id: string, projectID: string, projectName: string, created = 1000): GlobalSession {
  return {
    ...session(id, projectID, created),
    project: {
      id: projectID,
      name: projectName,
      worktree: "/tmp/worktree",
    },
  }
}

function msg(id: string, sessionID: string, modelID: string, cost: number): { info: Message; parts: Part[] } {
  return {
    info: {
      id,
      sessionID,
      role: "assistant" as const,
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

function source(sessions: Session[], messageMap: Record<string, { info: Message; parts: Part[] }[]>): Stats.Source {
  return {
    sessions,
    messages: async (id) => messageMap[id] ?? [],
    children: async () => [],
    projects: [],
  }
}

function globalSource(
  sessions: GlobalSession[],
  messageMap: Record<string, { info: Message; parts: Part[] }[]>,
): Stats.Source {
  return {
    sessions,
    messages: async (id) => messageMap[id] ?? [],
    children: async () => [],
    projects: [],
  }
}

describe("Stats.computeSessions", () => {
  beforeEach(() => Stats.clearCache())
  test("no model filter returns all messages and correct cost", async () => {
    const s = session("s1", "p1")
    const src = source([s], {
      s1: [msg("m1", "s1", "gpt-4o", 1.5), msg("m2", "s1", "claude-3", 2.5)],
    })
    const result = await Stats.sessions(src, {}, { field: "date", dir: "desc" }, 0)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].cost).toBeCloseTo(4.0)
    expect(result.items[0].messages).toBe(2)
  })

  test("modelID filter applies to cost and message count", async () => {
    const s = session("s1", "p1")
    const src = source([s], {
      s1: [msg("m1", "s1", "gpt-4o", 1.5), msg("m2", "s1", "claude-3", 2.5)],
    })
    const result = await Stats.sessions(src, { modelID: "gpt-4o" }, { field: "date", dir: "desc" }, 0)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].cost).toBeCloseTo(1.5)
    expect(result.items[0].messages).toBe(1)
    expect(result.items[0].model).toBe("gpt-4o")
  })

  test("modelID filter excludes sessions with no matching messages", async () => {
    const s = session("s1", "p1")
    const src = source([s], {
      s1: [msg("m1", "s1", "claude-3", 2.5)],
    })
    const result = await Stats.sessions(src, { modelID: "gpt-4o" }, { field: "date", dir: "desc" }, 0)
    expect(result.items).toHaveLength(0)
  })

  test("projectID filter limits sessions to that project", async () => {
    const s1 = session("s1", "p1")
    const s2 = session("s2", "p2")
    const src = source([s1, s2], {
      s1: [msg("m1", "s1", "gpt-4o", 1.0)],
      s2: [msg("m2", "s2", "gpt-4o", 2.0)],
    })
    const result = await Stats.sessions(src, { projectID: "p1" }, { field: "date", dir: "desc" }, 0)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe("s1")
  })
})

describe("Stats.computeProjects", () => {
  beforeEach(() => Stats.clearCache())
  test("aggregates sessions across multiple projects", async () => {
    const s1 = session("s1", "p1")
    const s2 = session("s2", "p2")
    const s3 = session("s3", "p1")
    const src = source([s1, s2, s3], {
      s1: [msg("m1", "s1", "gpt-4o", 1.0)],
      s2: [msg("m2", "s2", "gpt-4o", 2.0)],
      s3: [msg("m3", "s3", "gpt-4o", 3.0)],
    })
    const result = await Stats.projects(src, {})
    const p1 = result.find((r) => r.projectID === "p1")
    const p2 = result.find((r) => r.projectID === "p2")
    expect(p1?.sessions).toBe(2)
    expect(p1?.cost).toBeCloseTo(4.0)
    expect(p2?.sessions).toBe(1)
    expect(p2?.cost).toBeCloseTo(2.0)
  })

  test("modelID filter only counts matching messages in project totals", async () => {
    const s1 = session("s1", "p1")
    const src = source([s1], {
      s1: [msg("m1", "s1", "gpt-4o", 1.5), msg("m2", "s1", "claude-3", 2.5)],
    })
    const result = await Stats.projects(src, { modelID: "gpt-4o" })
    const p1 = result.find((r) => r.projectID === "p1")
    expect(p1?.cost).toBeCloseTo(1.5)
    expect(p1?.messages).toBe(1)
  })
})

describe("Stats with GlobalSession (dashboard aggregation)", () => {
  beforeEach(() => Stats.clearCache())

  test("global sessions aggregate across all projects", async () => {
    const g1 = globalSession("s1", "p1", "Project Alpha")
    const g2 = globalSession("s2", "p2", "Project Beta")
    const g3 = globalSession("s3", "p1", "Project Alpha")
    const src = globalSource([g1, g2, g3], {
      s1: [msg("m1", "s1", "gpt-4o", 1.0)],
      s2: [msg("m2", "s2", "gpt-4o", 2.0)],
      s3: [msg("m3", "s3", "gpt-4o", 3.0)],
    })
    const overview = await Stats.overview(src, {})
    expect(overview.sessions).toBe(3)
    expect(overview.cost).toBeCloseTo(6.0)
  })

  test("projectID filter works with global sessions", async () => {
    const g1 = globalSession("s1", "p1", "Project Alpha")
    const g2 = globalSession("s2", "p2", "Project Beta")
    const src = globalSource([g1, g2], {
      s1: [msg("m1", "s1", "gpt-4o", 1.0)],
      s2: [msg("m2", "s2", "gpt-4o", 2.0)],
    })
    const result = await Stats.sessions(src, { projectID: "p1" }, { field: "date", dir: "desc" }, 0)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe("s1")
  })

  test("projects tab aggregates by projectID from global sessions", async () => {
    const g1 = globalSession("s1", "p1", "Project Alpha")
    const g2 = globalSession("s2", "p2", "Project Beta")
    const g3 = globalSession("s3", "p1", "Project Alpha")
    const src = globalSource([g1, g2, g3], {
      s1: [msg("m1", "s1", "gpt-4o", 1.0)],
      s2: [msg("m2", "s2", "gpt-4o", 2.0)],
      s3: [msg("m3", "s3", "gpt-4o", 3.0)],
    })
    const result = await Stats.projects(src, {})
    expect(result).toHaveLength(2)
    const p1 = result.find((r) => r.projectID === "p1")
    const p2 = result.find((r) => r.projectID === "p2")
    expect(p1?.sessions).toBe(2)
    expect(p1?.cost).toBeCloseTo(4.0)
    expect(p2?.sessions).toBe(1)
    expect(p2?.cost).toBeCloseTo(2.0)
  })
})

describe("Stats project-scoped session isolation", () => {
  beforeEach(() => Stats.clearCache())

  test("project-scoped sessions do not leak across projects", async () => {
    const s1 = session("s1", "current-project")
    const src = source([s1], {
      s1: [msg("m1", "s1", "gpt-4o", 1.0)],
    })
    const result = await Stats.sessions(src, {}, { field: "date", dir: "desc" }, 0)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe("s1")
  })

  test("global sessions can be filtered to single project for display", async () => {
    const g1 = globalSession("s1", "p1", "Project Alpha")
    const g2 = globalSession("s2", "p2", "Project Beta")
    const src = globalSource([g1, g2], {
      s1: [msg("m1", "s1", "gpt-4o", 1.0)],
      s2: [msg("m2", "s2", "gpt-4o", 2.0)],
    })
    const result = await Stats.sessions(src, { projectID: "p1" }, { field: "date", dir: "desc" }, 0)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe("s1")
  })

  test("global sessions without projectID filter return all sessions", async () => {
    const g1 = globalSession("s1", "p1", "Project Alpha")
    const g2 = globalSession("s2", "p2", "Project Beta")
    const g3 = globalSession("s3", "p3", "Project Gamma")
    const src = globalSource([g1, g2, g3], {
      s1: [msg("m1", "s1", "gpt-4o", 1.0)],
      s2: [msg("m2", "s2", "gpt-4o", 2.0)],
      s3: [msg("m3", "s3", "gpt-4o", 3.0)],
    })
    const overview = await Stats.overview(src, {})
    expect(overview.sessions).toBe(3)
    expect(overview.cost).toBeCloseTo(6.0)
  })
})
