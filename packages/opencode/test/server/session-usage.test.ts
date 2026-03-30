import { describe, expect, test } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, type SessionID } from "../../src/session/schema"
import { Stats } from "../../src/session/stats"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

async function createAssistant(
  sessionID: SessionID,
  providerID: string,
  modelID: string,
  tokens: { input: number; output: number; reasoning?: number; cache?: { read: number; write: number } },
  cost: number,
) {
  await Session.updateMessage({
    id: MessageID.ascending(),
    sessionID,
    role: "assistant",
    time: { created: Date.now(), completed: Date.now() },
    parentID: MessageID.ascending(),
    providerID,
    modelID,
    mode: "chat",
    agent: "test",
    path: { cwd: "/tmp", root: "/tmp" },
    cost,
    tokens: {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning ?? 0,
      cache: tokens.cache ?? { read: 0, write: 0 },
    },
  } as MessageV2.Assistant)
}

async function sourceFromGlobal() {
  const sessions = [...Session.listGlobal({ limit: 200 })]
  const map = new Map<string, (typeof sessions)[number]>(sessions.map((session) => [session.id, session]))
  return {
    sessions,
    messages: async (sessionID: string) => {
      const session = map.get(sessionID)
      if (!session) return []
      return Instance.provide({ directory: session.directory, fn: () => Session.messages({ sessionID: session.id }) })
    },
    children: async (sessionID: string) => {
      const session = map.get(sessionID)
      if (!session) return []
      return Instance.provide({ directory: session.directory, fn: () => Session.children(session.id) })
    },
  } satisfies Stats.Source
}

describe("session usage and aggregate stats", () => {
  test("returns zero usage for a session with no assistant messages", async () => {
    await using tmp = await tmpdir({ git: true })
    const session = await Instance.provide({
      directory: tmp.path,
      fn: async () => Session.create({ title: "empty-session" }),
    })

    const source = await sourceFromGlobal()
    const detail = await Stats.session(source, session.id)

    expect(detail.cost).toBe(0)
    expect(detail.tokens.input).toBe(0)
    expect(detail.tokens.output).toBe(0)
    expect(detail.tools).toEqual([])
  })

  test("global aggregate totals stay consistent with session data across projects", async () => {
    await using first = await tmpdir({ git: true })
    await using second = await tmpdir({ git: true })

    const a = await Instance.provide({
      directory: first.path,
      fn: async () => {
        const session = await Session.create({ title: "alpha" })
        await createAssistant(session.id, "github-copilot", "gpt-4o", { input: 100, output: 50 }, 0.01)
        await createAssistant(session.id, "github-copilot", "gpt-4o", { input: 200, output: 100 }, 0.02)
        return session
      },
    })

    await Instance.provide({
      directory: second.path,
      fn: async () => {
        const session = await Session.create({ title: "beta" })
        await createAssistant(session.id, "anthropic", "claude-3", { input: 500, output: 250 }, 0.05)
        return session
      },
    })

    const source = await sourceFromGlobal()
    const overview = await Stats.overview(source, {})
    const detail = await Stats.session(source, a.id)

    expect(overview.messages).toBe(3)
    expect(overview.cost).toBeCloseTo(0.08)
    expect(detail.cost).toBeCloseTo(0.03)
    expect(detail.tokens.input).toBe(300)
    expect(detail.tokens.output).toBe(150)
  })

  test("global session listing remains available independently from project-scoped session access", async () => {
    await using first = await tmpdir({ git: true })
    await using second = await tmpdir({ git: true })

    const one = await Instance.provide({ directory: first.path, fn: async () => Session.create({ title: "one" }) })
    const two = await Instance.provide({ directory: second.path, fn: async () => Session.create({ title: "two" }) })

    const global = [...Session.listGlobal({ limit: 200 })].map((session) => session.id)
    const local = await Instance.provide({
      directory: first.path,
      fn: async () => [...Session.list({ limit: 200 })].map((session) => session.id),
    })

    expect(global).toContain(one.id)
    expect(global).toContain(two.id)
    expect(local).toContain(one.id)
    expect(local).not.toContain(two.id)
  })
})
