import type { AssistantMessage, Message, Part, Session, ToolPart } from "@opencode-ai/sdk/v2"

export namespace Stats {
  export type Source = {
    sessions: Session[]
    messages: (sessionID: string) => Promise<{ info: Message; parts: Part[] }[]>
    children: (sessionID: string) => Promise<Session[]>
    projects?: { id: string; name: string }[]
  }

  export type Filter = {
    days?: number
    projectID?: string
    modelID?: string
  }

  export type SortField = "date" | "cost" | "messages" | "model"
  export type SortDir = "asc" | "desc"

  export type Overview = {
    sessions: number
    messages: number
    cost: number
    tokens: {
      input: number
      output: number
      reasoning: number
      cache: { read: number; write: number }
    }
    costPerDay: number
    days: number
  }

  export type Daily = {
    date: string
    cost: number
    sessions: number
    userMessages: number
    messages: number
    requests: number
    input: number
    cacheRead: number
    output: number
  }

  export type Model = {
    modelID: string
    providerID: string
    messages: number
    cost: number
    input: number
    output: number
    reasoning: number
    cacheRead: number
    cacheWrite: number
    cacheRate: number
    reasoningRatio: number
    avgCost: number
  }

  export type Tool = {
    tool: string
    calls: number
    errors: number
    errorRate: number
    avgMs: number
    totalMs: number
  }

  export type ProjectStat = {
    projectID: string
    name: string
    sessions: number
    cost: number
    messages: number
    additions: number
    deletions: number
    files: number
  }

  export type SessionSummary = {
    id: string
    title: string
    date: number
    cost: number
    messages: number
    model: string
    agent: string
    duration: number
  }

  export type SessionList = {
    items: SessionSummary[]
    total: number
    page: number
    pages: number
  }

  export type SessionDetail = {
    cost: number
    tokens: {
      input: number
      output: number
      reasoning: number
      cacheRead: number
      cacheWrite: number
    }
    tools: { name: string; count: number }[]
    subagents: { id: string; title: string; agent: string; cost: number }[]
    subagentCost: number
  }

  const cache = new Map<string, { data: Promise<unknown>; expires: number }>()
  const ttl = 30_000

  export function clearCache() {
    cache.clear()
  }

  function cached<T>(key: string, fn: () => Promise<T>) {
    const hit = cache.get(key)
    if (hit && hit.expires > Date.now()) return hit.data as Promise<T>
    const data = fn()
    cache.set(key, { data, expires: Date.now() + ttl })
    return data
  }

  function chunk<T>(arr: T[], size: number) {
    const result: T[][] = []
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
    return result
  }

  function msgcost(msg: AssistantMessage) {
    return msg.cost ?? 0
  }

  function msgtokens(msg: AssistantMessage) {
    return {
      input: msg.tokens?.input ?? 0,
      output: msg.tokens?.output ?? 0,
      reasoning: msg.tokens?.reasoning ?? 0,
      cacheRead: msg.tokens?.cache?.read ?? 0,
      cacheWrite: msg.tokens?.cache?.write ?? 0,
    }
  }

  function filterSessions(sessions: Session[], filter: Filter) {
    const cutoff = filter.days ? Date.now() - filter.days * 86_400_000 : 0
    return sessions.filter((session) => {
      if (cutoff && session.time.created < cutoff) return false
      if (filter.projectID && session.projectID !== filter.projectID) return false
      return true
    })
  }

  export function overview(source: Source, filter: Filter) {
    return cached(`overview:${JSON.stringify(filter)}`, () => computeOverview(source, filter))
  }

  async function computeOverview(source: Source, filter: Filter): Promise<Overview> {
    const sessions = filterSessions(source.sessions, filter)
    const matched = new Set<string>()
    let cost = 0
    let messages = 0
    const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }

    for (const items of chunk(sessions, 20)) {
      const results = await Promise.all(items.map((session) => source.messages(session.id)))
      for (const [index, list] of results.entries()) {
        const session = items[index]
        for (const msg of list) {
          if (msg.info.role !== "assistant") continue
          const info = msg.info as AssistantMessage
          if (filter.modelID && info.modelID !== filter.modelID) continue
          matched.add(session.id)
          const part = msgtokens(info)
          cost += msgcost(info)
          tokens.input += part.input
          tokens.output += part.output
          tokens.reasoning += part.reasoning
          tokens.cache.read += part.cacheRead
          tokens.cache.write += part.cacheWrite
          messages++
        }
      }
    }

    const matchedSessions = filter.modelID ? sessions.filter((s) => matched.has(s.id)) : sessions
    const days = computeDays(matchedSessions)
    return {
      sessions: matchedSessions.length,
      messages,
      cost,
      tokens,
      costPerDay: days > 0 ? cost / days : 0,
      days,
    }
  }

  export function daily(source: Source, filter: Filter) {
    return cached(`daily:${JSON.stringify(filter)}`, () => computeDaily(source, filter))
  }

  async function computeDaily(source: Source, filter: Filter): Promise<Daily[]> {
    const sessions = filterSessions(source.sessions, filter)
    const byDay = new Map<
      string,
      {
        cost: number
        sessions: Set<string>
        userMessages: number
        messages: number
        requests: number
        input: number
        cacheRead: number
        output: number
      }
    >()

    for (const items of chunk(sessions, 20)) {
      const results = await Promise.all(items.map((session) => source.messages(session.id)))
      for (const [index, list] of results.entries()) {
        const session = items[index]
        const date = new Date(session.time.created).toISOString().slice(0, 10)
        let row = byDay.get(date)
        for (const msg of list) {
          if (!row) {
            row = {
              cost: 0,
              sessions: new Set<string>(),
              userMessages: 0,
              messages: 0,
              requests: 0,
              input: 0,
              cacheRead: 0,
              output: 0,
            }
          }
          row.requests++
          if (msg.info.role === "user") {
            row.userMessages++
            continue
          }
          const info = msg.info as AssistantMessage
          if (filter.modelID && info.modelID !== filter.modelID) continue
          row.cost += msgcost(info)
          row.sessions.add(session.id)
          row.messages++
          row.input += info.tokens?.input ?? 0
          row.cacheRead += info.tokens?.cache?.read ?? 0
          row.output += info.tokens?.output ?? 0
        }
        if (row) byDay.set(date, row)
      }
    }

    const result = [...byDay.entries()]
      .map(([date, row]) => ({
        date,
        cost: row.cost,
        sessions: row.sessions.size,
        userMessages: row.userMessages,
        messages: row.messages,
        requests: row.requests,
        input: row.input,
        cacheRead: row.cacheRead,
        output: row.output,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))

    if (filter.modelID) {
      return result.filter((row) => row.messages > 0)
    }
    return result
  }

  export function models(source: Source, filter: Filter) {
    return cached(`models:${JSON.stringify(filter)}`, () => computeModels(source, filter))
  }

  async function computeModels(source: Source, filter: Filter): Promise<Model[]> {
    const sessions = filterSessions(source.sessions, filter)
    const byModel = new Map<
      string,
      {
        providerID: string
        messages: number
        cost: number
        input: number
        output: number
        reasoning: number
        cacheRead: number
        cacheWrite: number
      }
    >()

    for (const items of chunk(sessions, 20)) {
      const results = await Promise.all(items.map((session) => source.messages(session.id)))
      for (const list of results) {
        for (const msg of list) {
          if (msg.info.role !== "assistant") continue
          const info = msg.info as AssistantMessage
          if (filter.modelID && info.modelID !== filter.modelID) continue
          const row = byModel.get(info.modelID) ?? {
            providerID: info.providerID,
            messages: 0,
            cost: 0,
            input: 0,
            output: 0,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
          }
          const part = msgtokens(info)
          row.messages++
          row.cost += msgcost(info)
          row.input += part.input
          row.output += part.output
          row.reasoning += part.reasoning
          row.cacheRead += part.cacheRead
          row.cacheWrite += part.cacheWrite
          byModel.set(info.modelID, row)
        }
      }
    }

    return [...byModel.entries()]
      .map(([modelID, row]) => ({
        modelID,
        providerID: row.providerID,
        messages: row.messages,
        cost: row.cost,
        input: row.input,
        output: row.output,
        reasoning: row.reasoning,
        cacheRead: row.cacheRead,
        cacheWrite: row.cacheWrite,
        cacheRate: row.input + row.cacheRead > 0 ? row.cacheRead / (row.input + row.cacheRead) : 0,
        reasoningRatio: row.output + row.reasoning > 0 ? row.reasoning / (row.output + row.reasoning) : 0,
        avgCost: row.messages > 0 ? row.cost / row.messages : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
  }

  export function tools(source: Source, filter: Filter) {
    return cached(`tools:${JSON.stringify(filter)}`, () => computeTools(source, filter))
  }

  async function computeTools(source: Source, filter: Filter): Promise<Tool[]> {
    const sessions = filterSessions(source.sessions, filter)
    const byTool = new Map<string, { calls: number; errors: number; totalMs: number; timed: number }>()

    for (const items of chunk(sessions, 20)) {
      const results = await Promise.all(
        items.map(async (session) => {
          const list = await source.messages(session.id)
          return list.flatMap((msg) => msg.parts).filter((part): part is ToolPart => part.type === "tool")
        }),
      )
      for (const list of results) {
        for (const part of list) {
          const row = byTool.get(part.tool) ?? { calls: 0, errors: 0, totalMs: 0, timed: 0 }
          row.calls++
          if (part.state.status === "error") row.errors++
          if ((part.state.status === "completed" || part.state.status === "error") && part.state.time) {
            row.totalMs += part.state.time.end - part.state.time.start
            row.timed++
          }
          byTool.set(part.tool, row)
        }
      }
    }

    return [...byTool.entries()]
      .map(([tool, row]) => ({
        tool,
        calls: row.calls,
        errors: row.errors,
        errorRate: row.calls > 0 ? row.errors / row.calls : 0,
        avgMs: row.timed > 0 ? Math.round(row.totalMs / row.timed) : 0,
        totalMs: row.totalMs,
      }))
      .sort((a, b) => b.calls - a.calls)
  }

  export function projects(source: Source, filter: Filter) {
    return cached(`projects:${JSON.stringify(filter)}`, () => computeProjects(source, filter))
  }

  async function computeProjects(source: Source, filter: Filter): Promise<ProjectStat[]> {
    const sessions = filterSessions(source.sessions, filter)
    const byProject = new Map<
      string,
      {
        name: string
        matchedSessions: Set<string>
        cost: number
        messages: number
        additions: number
        deletions: number
        files: number
      }
    >()

    for (const project of source.projects ?? []) {
      byProject.set(project.id, {
        name: project.name,
        matchedSessions: new Set<string>(),
        cost: 0,
        messages: 0,
        additions: 0,
        deletions: 0,
        files: 0,
      })
    }

    for (const items of chunk(sessions, 20)) {
      const results = await Promise.all(items.map((session) => source.messages(session.id)))
      for (const [index, list] of results.entries()) {
        const session = items[index]
        const row = byProject.get(session.projectID) ?? {
          name: session.projectID,
          matchedSessions: new Set<string>(),
          cost: 0,
          messages: 0,
          additions: 0,
          deletions: 0,
          files: 0,
        }
        row.additions += session.summary?.additions ?? 0
        row.deletions += session.summary?.deletions ?? 0
        row.files += session.summary?.files ?? 0
        for (const msg of list) {
          if (msg.info.role !== "assistant") continue
          const info = msg.info as AssistantMessage
          if (filter.modelID && info.modelID !== filter.modelID) continue
          row.matchedSessions.add(session.id)
          row.cost += msgcost(info)
          row.messages++
        }
        byProject.set(session.projectID, row)
      }
    }

    return [...byProject.entries()]
      .map(([projectID, row]) => ({
        projectID,
        name: row.name,
        sessions: row.matchedSessions.size,
        cost: row.cost,
        messages: row.messages,
        additions: row.additions,
        deletions: row.deletions,
        files: row.files,
      }))
      .filter((row) => (filter.modelID ? row.messages > 0 : true))
      .sort((a, b) => b.cost - a.cost)
  }

  export function sessions(
    source: Source,
    filter: Filter,
    sort: { field: SortField; dir: SortDir },
    page: number,
    size = 20,
  ) {
    return cached(`sessions:${JSON.stringify(filter)}:${JSON.stringify(sort)}:${page}:${size}`, () =>
      computeSessions(source, filter, sort, page, size),
    )
  }

  async function computeSessions(
    source: Source,
    filter: Filter,
    sort: { field: SortField; dir: SortDir },
    page: number,
    size: number,
  ): Promise<SessionList> {
    const all = filterSessions(source.sessions, filter)
    const rows = await Promise.all(
      all.map(async (session) => {
        const list = await source.messages(session.id)
        const assistant = list.filter(
          (msg): msg is { info: AssistantMessage; parts: Part[] } => msg.info.role === "assistant",
        )
        const scoped = filter.modelID ? assistant.filter((msg) => msg.info.modelID === filter.modelID) : assistant
        if (filter.modelID && scoped.length === 0) return null
        return {
          id: session.id,
          title: session.title,
          date: session.time.created,
          cost: scoped.reduce((sum, msg) => sum + msgcost(msg.info), 0),
          messages: scoped.length,
          model: scoped[0]?.info.modelID ?? "unknown",
          agent: scoped[0]?.info.agent ?? "unknown",
          duration: session.time.updated - session.time.created,
        }
      }),
    )

    const items = rows.filter((row): row is SessionSummary => row !== null)
    const mul = sort.dir === "desc" ? -1 : 1
    const sorted = items.sort((a, b) => {
      if (sort.field === "date") return (a.date - b.date) * mul
      if (sort.field === "cost") return (a.cost - b.cost) * mul
      if (sort.field === "messages") return (a.messages - b.messages) * mul
      return a.model.localeCompare(b.model) * mul
    })

    return {
      items: sorted.slice(page * size, (page + 1) * size),
      total: sorted.length,
      page,
      pages: Math.ceil(sorted.length / size),
    }
  }

  export function session(source: Source, sessionID: string) {
    return computeSession(source, sessionID)
  }

  async function computeSession(source: Source, sessionID: string): Promise<SessionDetail> {
    const msgs = await source.messages(sessionID)
    const children = await source.children(sessionID)
    const assistant = msgs.filter(
      (msg): msg is { info: AssistantMessage; parts: Part[] } => msg.info.role === "assistant",
    )
    const tools = msgs.flatMap((msg) => msg.parts).filter((part): part is ToolPart => part.type === "tool")
    const tokens = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
    let cost = 0

    for (const msg of assistant) {
      const part = msgtokens(msg.info)
      cost += msgcost(msg.info)
      tokens.input += part.input
      tokens.output += part.output
      tokens.reasoning += part.reasoning
      tokens.cacheRead += part.cacheRead
      tokens.cacheWrite += part.cacheWrite
    }

    const summary = new Map<string, number>()
    for (const tool of tools) {
      summary.set(tool.tool, (summary.get(tool.tool) ?? 0) + 1)
    }

    const subagents = await Promise.all(
      children.map(async (child) => {
        const list = await source.messages(child.id)
        const assistant = list.filter(
          (msg): msg is { info: AssistantMessage; parts: Part[] } => msg.info.role === "assistant",
        )
        const first = assistant[0]?.info
        return {
          id: child.id,
          title: child.title,
          agent: first?.agent ?? "unknown",
          cost: assistant.reduce((sum, msg) => sum + msgcost(msg.info), 0),
        }
      }),
    )

    return {
      cost,
      tokens,
      tools: [...summary.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      subagents,
      subagentCost: subagents.reduce((sum, item) => sum + item.cost, 0),
    }
  }

  function computeDays(sessions: Session[]) {
    if (sessions.length === 0) return 0
    const times = sessions.map((session) => session.time.created)
    return Math.max(1, Math.ceil((Math.max(...times) - Math.min(...times)) / 86_400_000))
  }
}
