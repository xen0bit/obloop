import { readFileSync } from "fs"
import { join } from "path"
import type { ObloopConfig, LoopConfig, RawLoopConfig } from "./config.js"
import { loadObloopConfig, normalizeLoop } from "./config.js"
import type { PluginContext } from "./types.js"
import type { StopMode } from "./constants.js"

function readTaskMd(directory: string): string {
  try {
    return readFileSync(join(directory, "task.md"), "utf8").trim()
  } catch {
    return ""
  }
}

export type RunLoopOptions = {
  directory: string
  promptOverride?: string
  configOverride?: Partial<ObloopConfig>
}

function matchesStopPhrase(content: string, phrase: string, mode: StopMode): boolean {
  if (!phrase) return false
  if (mode === "exact") return content.trim() === phrase
  if (mode === "contains") return content.includes(phrase)
  if (mode === "suffix") return content.trimEnd().endsWith(phrase.trimEnd())
  return false
}

type Client = PluginContext["client"]
type Level = "debug" | "info" | "warn" | "error"
type MessagePart = { type?: string; text?: string }
type SessionMessage = { info?: { role?: string }; parts?: MessagePart[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const appLog = (client: Client, level: Level, message: string, extra?: Record<string, unknown>) =>
  client.app.log({ body: { service: "obloop", level, message, extra } } as any).catch(() => {})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tuiToast = (client: Client, message: string, variant: "info" | "success" | "warning" | "error") =>
  client.tui.showToast({ body: { message, variant } } as any).catch(() => {})

async function getLastAssistantText(client: Client, sessionId: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await client.session.messages({ path: { id: sessionId } } as any)
    const list: SessionMessage[] = Array.isArray(res.data) ? res.data as SessionMessage[] : []
    for (let i = list.length - 1; i >= 0; i--) {
      const msg = list[i]
      if (msg?.info?.role === "assistant") {
        const parts = msg.parts ?? []
        return parts
          .filter((p: MessagePart) => p?.type === "text" && p?.text != null)
          .map((p: MessagePart) => p.text as string)
          .join("\n")
      }
    }
  } catch {
    // ignore
  }
  return ""
}

/**
 * Run the agent sequence in a loop: create a fresh session per step → send prompt with agent.
 * Stops when: stop_phrase found in assistant output, max_steps reached, or timeout.
 * Optional delay between iterations. Response streams to the UI.
 */
export async function runLoop(ctx: PluginContext, options: RunLoopOptions): Promise<void> {
  const base = loadObloopConfig(options.directory)
  const config: ObloopConfig = {
    ...base,
    ...options.configOverride,
    agents: options.configOverride?.agents?.length ? options.configOverride.agents : base.agents,
    prompt: options.promptOverride ?? options.configOverride?.prompt ?? base.prompt,
  }
  const prompt: string = config.prompt || readTaskMd(options.directory)
  const agents: string[] = config.agents?.length ? config.agents : ["backward", "forward"]
  const loop: LoopConfig =
    options.configOverride?.loop != null
      ? normalizeLoop(options.configOverride.loop as RawLoopConfig)
      : base.loop

  const { client } = ctx
  const startTime = Date.now()
  let step = 0
  let stoppedByPhrase = false

  await appLog(client, "info", "Obloop started", {
    agents,
    prompt: prompt.slice(0, 80),
    loop: { max_steps: loop.max_steps, timeout_ms: loop.timeout_ms, stop_phrase: loop.stop_phrase || "(none)" },
  })

  outer: while (step < loop.max_steps) {
    if (loop.timeout_ms > 0 && Date.now() - startTime >= loop.timeout_ms) {
      await appLog(client, "info", "Obloop stopped: timeout", { step, elapsed_ms: Date.now() - startTime })
      break
    }

    for (let i = 0; i < agents.length; i++) {
      if (step >= loop.max_steps) break outer
      if (loop.timeout_ms > 0 && Date.now() - startTime >= loop.timeout_ms) break outer

      const agent = agents[i] ?? "default"
      const title = `obloop: ${agent} (step ${step + 1}/${loop.max_steps})`
      let sessionId = ""

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const session = await client.session.create({ body: { title } } as any)
        sessionId = (session.data as { id?: string } | undefined)?.id ?? ""
        if (!sessionId) {
          await appLog(client, "error", "Obloop: session.create did not return an id", { agent })
          break outer
        }
      } catch (err) {
        await appLog(client, "error", "Obloop: failed to create session", { agent, error: String(err) })
        break outer
      }

      tuiToast(client, `Obloop: starting ${agent} (step ${step + 1})`, "info")

      try {
        await client.session.prompt({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          path: { id: sessionId }, body: { agent, parts: [{ type: "text", text: prompt }] },
        } as any)
      } catch (err) {
        await appLog(client, "error", "Obloop: failed to send prompt", { agent, sessionId, error: String(err) })
        break outer
      }

      if (loop.stop_phrase) {
        const text = await getLastAssistantText(client, sessionId)
        if (matchesStopPhrase(text, loop.stop_phrase, loop.stop_mode)) {
          stoppedByPhrase = true
          await appLog(client, "info", "Obloop stopped: stop phrase matched", { step: step + 1, stop_phrase: loop.stop_phrase })
          tuiToast(client, "Obloop: done (stop phrase matched)", "success")
          break outer
        }
      }

      step += 1
      tuiToast(client, `Obloop: ${agent} done`, "success")

      if (loop.delay_ms > 0) {
        await new Promise((r) => setTimeout(r, loop.delay_ms))
      }
    }
  }

  await appLog(client, "info", "Obloop finished", { agents, step, stoppedByPhrase })
}
