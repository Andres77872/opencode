import type { Session, Message, Part, ToolPart, AssistantMessage } from "@opencode-ai/sdk/v2"

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

  const cache = new Map<string, { data: unknown; expires: number }>()
  const TTL = 30_000

  function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const entry = cache.get(key)
    if (entry && entry.expires > Date.now()) return entry.data as Promise<T>
    const result = fn()
    result.then((data) => cache.set(key, { data, expires: Date.now() + TTL }))
    return result
  }

  function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = []
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
    return result
  }

  function msgcost(msg: AssistantMessage): number {
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

  function filterSessions(sessions: Session[], filter: Filter): Session[] {
    const cutoff = filter.days ? Date.now() - filter.days * 86_400_000 : 0
    return sessions.filter((s) => {
      if (cutoff && s.time.created < cutoff) return false
      if (filter.projectID && s.projectID !== filter.projectID) return false
      return true
    })
  }

  export function overview(source: Source, filter: Filter): Promise<Overview> {
    const key = `overview:${JSON.stringify(filter)}`
    return cached(key, () => computeOverview(source, filter))
  }

  async function computeOverview(source: Source, filter: Filter): Promise<Overview> {
    const sessions = filterSessions(source.sessions, filter)
    let cost = 0
    let messages = 0
    const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }

    for (const batch of chunk(sessions, 20)) {
      const results = await Promise.all(batch.map((s) => source.messages(s.id)))
      for (const msgs of results) {
        for (const msg of msgs) {
          if (msg.info.role !== "assistant") continue
          const info = msg.info as AssistantMessage
          if (filter.modelID && info.modelID !== filter.modelID) continue
          const t = msgtokens(info)
          cost += msgcost(info)
          tokens.input += t.input
          tokens.output += t.output
          tokens.reasoning += t.reasoning
          tokens.cache.read += t.cacheRead
          tokens.cache.write += t.cacheWrite
          messages++
        }
      }
    }

    const days = computeDays(sessions)
    return {
      sessions: sessions.length,
      messages,
      cost,
      tokens,
      costPerDay: days > 0 ? cost / days : 0,
      days,
    }
  }

  export function daily(source: Source, filter: Filter): Promise<Daily[]> {
    const key = `daily:${JSON.stringify(filter)}`
    return cached(key, () => computeDaily(source, filter))
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

    // Count sessions by their creation date
    for (const s of sessions) {
      const date = new Date(s.time.created).toISOString().slice(0, 10)
      const entry = byDay.get(date) ?? {
        cost: 0,
        sessions: new Set<string>(),
        userMessages: 0,
        messages: 0,
        requests: 0,
        input: 0,
        cacheRead: 0,
        output: 0,
      }
      entry.sessions.add(s.id)
      byDay.set(date, entry)
    }

    for (const batch of chunk(sessions, 20)) {
      const results = await Promise.all(batch.map((s) => source.messages(s.id)))
      for (let i = 0; i < batch.length; i++) {
        for (const msg of results[i]) {
          const date = new Date(batch[i].time.created).toISOString().slice(0, 10)
          const entry = byDay.get(date) ?? {
            cost: 0,
            sessions: new Set<string>(),
            userMessages: 0,
            messages: 0,
            requests: 0,
            input: 0,
            cacheRead: 0,
            output: 0,
          }

          entry.requests++

          if (msg.info.role === "user") {
            entry.userMessages++
            byDay.set(date, entry)
            continue
          }

          const info = msg.info as AssistantMessage
          if (filter.modelID && info.modelID !== filter.modelID) continue

          entry.cost += msgcost(info)
          entry.sessions.add(batch[i].id)
          entry.messages++
          entry.input += info.tokens?.input ?? 0
          entry.cacheRead += info.tokens?.cache?.read ?? 0
          entry.output += info.tokens?.output ?? 0
          byDay.set(date, entry)
        }
      }
    }

    return [...byDay.entries()]
      .map(([date, data]) => ({
        date,
        cost: data.cost,
        sessions: data.sessions.size,
        userMessages: data.userMessages,
        messages: data.messages,
        requests: data.requests,
        input: data.input,
        cacheRead: data.cacheRead,
        output: data.output,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  export function models(source: Source, filter: Filter): Promise<Model[]> {
    const key = `models:${JSON.stringify(filter)}`
    return cached(key, () => computeModels(source, filter))
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

    for (const batch of chunk(sessions, 20)) {
      const results = await Promise.all(batch.map((s) => source.messages(s.id)))
      for (const msgs of results) {
        for (const msg of msgs) {
          if (msg.info.role !== "assistant") continue
          const info = msg.info as AssistantMessage
          if (filter.modelID && info.modelID !== filter.modelID) continue

          const key = info.modelID
          const entry = byModel.get(key) ?? {
            providerID: info.providerID,
            messages: 0,
            cost: 0,
            input: 0,
            output: 0,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
          }

          entry.messages++
          entry.cost += msgcost(info)
          const t = msgtokens(info)
          entry.input += t.input
          entry.output += t.output
          entry.reasoning += t.reasoning
          entry.cacheRead += t.cacheRead
          entry.cacheWrite += t.cacheWrite
          byModel.set(key, entry)
        }
      }
    }

    return [...byModel.entries()]
      .map(([modelID, data]) => ({
        modelID,
        providerID: data.providerID,
        messages: data.messages,
        cost: data.cost,
        input: data.input,
        output: data.output,
        reasoning: data.reasoning,
        cacheRead: data.cacheRead,
        cacheWrite: data.cacheWrite,
        cacheRate: data.input + data.cacheRead > 0 ? data.cacheRead / (data.input + data.cacheRead) : 0,
        reasoningRatio: data.output + data.reasoning > 0 ? data.reasoning / (data.output + data.reasoning) : 0,
        avgCost: data.messages > 0 ? data.cost / data.messages : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
  }

  export function tools(source: Source, filter: Filter): Promise<Tool[]> {
    const key = `tools:${JSON.stringify(filter)}`
    return cached(key, () => computeTools(source, filter))
  }

  async function computeTools(source: Source, filter: Filter): Promise<Tool[]> {
    const sessions = filterSessions(source.sessions, filter)
    const byTool = new Map<
      string,
      {
        calls: number
        errors: number
        totalMs: number
        timed: number
      }
    >()

    for (const batch of chunk(sessions, 20)) {
      const results = await Promise.all(
        batch.map(async (s) => {
          const msgs = await source.messages(s.id)
          return msgs.flatMap((m) => m.parts).filter((p): p is ToolPart => p.type === "tool")
        }),
      )

      for (const parts of results) {
        for (const part of parts) {
          const name = part.tool
          const entry = byTool.get(name) ?? {
            calls: 0,
            errors: 0,
            totalMs: 0,
            timed: 0,
          }

          entry.calls++

          if (part.state.status === "error") entry.errors++

          if ((part.state.status === "completed" || part.state.status === "error") && part.state.time) {
            const duration = part.state.time.end - part.state.time.start
            entry.totalMs += duration
            entry.timed++
          }

          byTool.set(name, entry)
        }
      }
    }

    return [...byTool.entries()]
      .map(([tool, data]) => ({
        tool,
        calls: data.calls,
        errors: data.errors,
        errorRate: data.calls > 0 ? data.errors / data.calls : 0,
        avgMs: data.timed > 0 ? Math.round(data.totalMs / data.timed) : 0,
        totalMs: data.totalMs,
      }))
      .sort((a, b) => b.calls - a.calls)
  }

  export function projects(source: Source, filter: Filter): Promise<ProjectStat[]> {
    const key = `projects:${JSON.stringify(filter)}`
    return cached(key, () => computeProjects(source, filter))
  }

  async function computeProjects(source: Source, filter: Filter): Promise<ProjectStat[]> {
    const sessions = filterSessions(source.sessions, filter)
    const byProject = new Map<
      string,
      {
        name: string
        sessions: number
        cost: number
        messages: number
        additions: number
        deletions: number
        files: number
      }
    >()

    if (source.projects) {
      for (const proj of source.projects) {
        byProject.set(proj.id, {
          name: proj.name,
          sessions: 0,
          cost: 0,
          messages: 0,
          additions: 0,
          deletions: 0,
          files: 0,
        })
      }
    }

    for (const batch of chunk(sessions, 20)) {
      const results = await Promise.all(batch.map((s) => source.messages(s.id)))
      for (let i = 0; i < batch.length; i++) {
        const session = batch[i]
        if (!byProject.has(session.projectID)) {
          byProject.set(session.projectID, {
            name: session.projectID,
            sessions: 0,
            cost: 0,
            messages: 0,
            additions: 0,
            deletions: 0,
            files: 0,
          })
        }
        const entry = byProject.get(session.projectID)!

        entry.sessions++
        entry.additions += session.summary?.additions ?? 0
        entry.deletions += session.summary?.deletions ?? 0
        entry.files += session.summary?.files ?? 0

        for (const msg of results[i]) {
          if (msg.info.role !== "assistant") continue
          const info = msg.info as AssistantMessage
          if (filter.modelID && info.modelID !== filter.modelID) continue
          entry.cost += msgcost(info)
          entry.messages++
        }
      }
    }

    return [...byProject.entries()]
      .filter(([, data]) => data.sessions > 0)
      .map(([projectID, data]) => ({ projectID, ...data }))
      .sort((a, b) => b.cost - a.cost)
  }

  export function sessions(
    source: Source,
    filter: Filter,
    sort: { field: SortField; dir: SortDir },
    page: number,
    pageSize = 20,
  ): Promise<SessionList> {
    const key = `sessions:${JSON.stringify(filter)}:${JSON.stringify(sort)}:${page}:${pageSize}`
    return cached(key, () => computeSessions(source, filter, sort, page, pageSize))
  }

  async function computeSessions(
    source: Source,
    filter: Filter,
    sort: { field: SortField; dir: SortDir },
    page: number,
    pageSize: number,
  ): Promise<SessionList> {
    const all = filterSessions(source.sessions, filter)
    const withMetrics = await Promise.all(
      all.map(async (s) => {
        const msgs = await source.messages(s.id)
        const assistant = msgs.filter(
          (m): m is { info: AssistantMessage; parts: Part[] } => m.info.role === "assistant",
        )

        if (filter.modelID) {
          const filtered = assistant.filter((m) => m.info.modelID === filter.modelID)
          if (filtered.length === 0) return null
        }

        const cost = assistant.reduce((sum, m) => sum + msgcost(m.info), 0)
        const primary = assistant.length > 0 ? assistant[0].info.modelID : "unknown"
        const agent = assistant.length > 0 ? assistant[0].info.agent : "unknown"

        return {
          id: s.id,
          title: s.title,
          date: s.time.created,
          cost,
          messages: assistant.length,
          model: primary,
          agent,
          duration: s.time.updated - s.time.created,
        }
      }),
    )

    const filtered = withMetrics.filter((s): s is SessionSummary => s !== null)

    const sorted = filtered.sort((a, b) => {
      const mul = sort.dir === "desc" ? -1 : 1
      if (sort.field === "date") return (a.date - b.date) * mul
      if (sort.field === "cost") return (a.cost - b.cost) * mul
      if (sort.field === "messages") return (a.messages - b.messages) * mul
      return a.model.localeCompare(b.model) * mul
    })

    return {
      items: sorted.slice(page * pageSize, (page + 1) * pageSize),
      total: sorted.length,
      page,
      pages: Math.ceil(sorted.length / pageSize),
    }
  }

  export function session(source: Source, sessionID: string): Promise<SessionDetail> {
    return computeSession(source, sessionID)
  }

  async function computeSession(source: Source, sessionID: string): Promise<SessionDetail> {
    const msgs = await source.messages(sessionID)
    const children = await source.children(sessionID)
    const assistant = msgs.filter((m): m is { info: AssistantMessage; parts: Part[] } => m.info.role === "assistant")
    const toolParts = msgs.flatMap((m) => m.parts).filter((p): p is ToolPart => p.type === "tool")

    const tokens = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
    let cost = 0

    for (const msg of assistant) {
      const t = msgtokens(msg.info)
      cost += msgcost(msg.info)
      tokens.input += t.input
      tokens.output += t.output
      tokens.reasoning += t.reasoning
      tokens.cacheRead += t.cacheRead
      tokens.cacheWrite += t.cacheWrite
    }

    const summary = new Map<string, number>()
    for (const part of toolParts) {
      summary.set(part.tool, (summary.get(part.tool) ?? 0) + 1)
    }

    const subagents = await Promise.all(
      children.map(async (child) => {
        const childMsgs = await source.messages(child.id)
        const childCost = childMsgs
          .filter((m): m is { info: AssistantMessage; parts: Part[] } => m.info.role === "assistant")
          .reduce((sum, m) => sum + msgcost(m.info), 0)
        return { id: child.id, title: child.title, agent: child.title, cost: childCost }
      }),
    )

    return {
      cost,
      tokens,
      tools: [...summary.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      subagents,
      subagentCost: subagents.reduce((sum, s) => sum + s.cost, 0),
    }
  }

  function computeDays(sessions: Session[]): number {
    if (sessions.length === 0) return 0
    const times = sessions.map((s) => s.time.created)
    const min = Math.min(...times)
    const max = Math.max(...times)
    return Math.max(1, Math.ceil((max - min) / 86_400_000))
  }
}
