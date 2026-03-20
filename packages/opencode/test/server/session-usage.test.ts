import { describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, type SessionID } from "../../src/session/schema"
import { Log } from "../../src/util/log"

const root = path.join(__dirname, "../..")
Log.init({ print: false })

async function createAssistantMessage(
  sessionID: SessionID,
  providerID: string,
  modelID: string,
  tokens: { input: number; output: number; reasoning?: number; cache?: { read: number; write: number } },
  cost: number,
) {
  const id = MessageID.ascending()
  await Session.updateMessage({
    id,
    sessionID,
    role: "assistant",
    time: { created: Date.now(), completed: Date.now() },
    parentID: MessageID.ascending(),
    providerID,
    modelID,
    mode: "chat",
    agent: "test",
    path: { cwd: root, root },
    cost,
    tokens: {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning ?? 0,
      cache: tokens.cache ?? { read: 0, write: 0 },
    },
  } as MessageV2.Assistant)
  return id
}

describe("session usage endpoint", () => {
  test("returns empty usage for session with no assistant messages", async () => {
    await Instance.provide({
      directory: root,
      fn: async () => {
        const session = await Session.create({})
        const app = Server.Default()

        const res = await app.request(`/session/${session.id}/usage`)
        expect(res.status).toBe(200)
        const body = (await res.json()) as {
          models: Record<string, unknown>
          total: { messages: number; cost: number }
        }
        expect(body.models).toEqual({})
        expect(body.total.messages).toBe(0)
        expect(body.total.cost).toBe(0)

        await Session.remove(session.id)
      },
    })
  })

  test("aggregates usage by provider/model", async () => {
    await Instance.provide({
      directory: root,
      fn: async () => {
        const session = await Session.create({})

        await createAssistantMessage(session.id, "github-copilot", "gpt-4o", { input: 100, output: 50 }, 0.01)
        await createAssistantMessage(session.id, "github-copilot", "gpt-4o", { input: 200, output: 100 }, 0.02)
        await createAssistantMessage(session.id, "alibaba-coding-plan", "qwen-max", { input: 500, output: 250 }, 0.05)

        const app = Server.Default()

        const res = await app.request(`/session/${session.id}/usage`)
        expect(res.status).toBe(200)
        const body = (await res.json()) as {
          models: Record<
            string,
            {
              providerID: string
              modelID: string
              messages: number
              tokens: { input: number; output: number }
              cost: number
            }
          >
          total: { messages: number; tokens: { input: number; output: number }; cost: number }
        }

        expect(Object.keys(body.models)).toHaveLength(2)

        const copilot = body.models["github-copilot/gpt-4o"]
        expect(copilot).toBeDefined()
        expect(copilot.messages).toBe(2)
        expect(copilot.tokens.input).toBe(300)
        expect(copilot.tokens.output).toBe(150)
        expect(copilot.cost).toBeCloseTo(0.03)

        const alibaba = body.models["alibaba-coding-plan/qwen-max"]
        expect(alibaba).toBeDefined()
        expect(alibaba.messages).toBe(1)
        expect(alibaba.tokens.input).toBe(500)
        expect(alibaba.tokens.output).toBe(250)
        expect(alibaba.cost).toBeCloseTo(0.05)

        expect(body.total.messages).toBe(3)
        expect(body.total.tokens.input).toBe(800)
        expect(body.total.tokens.output).toBe(400)
        expect(body.total.cost).toBeCloseTo(0.08)

        await Session.remove(session.id)
      },
    })
  })

  test("separates token types correctly", async () => {
    await Instance.provide({
      directory: root,
      fn: async () => {
        const session = await Session.create({})

        await createAssistantMessage(
          session.id,
          "anthropic",
          "claude-3-opus",
          {
            input: 1000,
            output: 500,
            reasoning: 200,
            cache: { read: 300, write: 100 },
          },
          0.1,
        )

        const app = Server.Default()

        const res = await app.request(`/session/${session.id}/usage`)
        expect(res.status).toBe(200)
        const body = (await res.json()) as {
          models: Record<
            string,
            { tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } } }
          >
          total: {
            tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
          }
        }

        const model = body.models["anthropic/claude-3-opus"]
        expect(model.tokens.input).toBe(1000)
        expect(model.tokens.output).toBe(500)
        expect(model.tokens.reasoning).toBe(200)
        expect(model.tokens.cache.read).toBe(300)
        expect(model.tokens.cache.write).toBe(100)

        expect(body.total.tokens.input).toBe(1000)
        expect(body.total.tokens.output).toBe(500)
        expect(body.total.tokens.reasoning).toBe(200)
        expect(body.total.tokens.cache.read).toBe(300)
        expect(body.total.tokens.cache.write).toBe(100)

        await Session.remove(session.id)
      },
    })
  })

  test("returns 404 for non-existent session", async () => {
    await Instance.provide({
      directory: root,
      fn: async () => {
        const app = Server.Default()
        const res = await app.request("/session/ses_nonexistent/usage")
        expect(res.status).toBe(404)
      },
    })
  })
})
