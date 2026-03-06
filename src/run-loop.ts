import type { ObloopConfig, LoopConfig, RawLoopConfig } from "./config.js"
import { loadObloopConfig, normalizeLoop } from "./config.js"
import type { PluginContext } from "./types.js"
import type { StopMode } from "./constants.js"

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

type MessagePart = { type?: string; text?: string }
type SessionMessage = { info?: { role?: string }; parts?: MessagePart[] }

async function getLastAssistantText(
  client: PluginContext["client"],
  sessionId: string,
): Promise<string> {
  try {
    const res = await client.session.messages({ path: { id: sessionId } })
    const list: SessionMessage[] = Array.isArray(res.data) ? res.data as SessionMessage[] : []
    for (let i = list.length - 1; i >= 0; i--) {
      const msg = list[i]
      if (msg?.info?.role === "assistant") {
        const parts = msg.parts ?? []
        const texts = parts
          .filter((p: MessagePart) => p?.type === "text" && p?.text != null)
          .map((p: MessagePart) => (p.text as string))
        return texts.join("\n")
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
export async function runLoop(
  ctx: PluginContext,
  options: RunLoopOptions,
): Promise<void> {
  const base = loadObloopConfig(options.directory)
  const config: ObloopConfig = {
    ...base,
    ...options.configOverride,
    agents: options.configOverride?.agents?.length ? options.configOverride.agents : base.agents,
    prompt: options.promptOverride ?? options.configOverride?.prompt ?? base.prompt,
  }
  const prompt: string = config.prompt ?? ""
  const agents: string[] = config.agents?.length ? config.agents : ["chaos", "developer"]
  const loop: LoopConfig =
    options.configOverride?.loop != null
      ? normalizeLoop(options.configOverride.loop as RawLoopConfig)
      : base.loop

  const { client } = ctx
  const startTime = Date.now()
  let step = 0
  let stoppedByPhrase = false

  try {
    await client.app?.log?.({
      body: {
        service: "obloop",
        level: "info",
        message: "Obloop started",
        extra: {
          agents,
          prompt: prompt.slice(0, 80),
          loop: {
            max_steps: loop.max_steps,
            timeout_ms: loop.timeout_ms,
            stop_phrase: loop.stop_phrase || "(none)",
          },
        },
      },
    })
  } catch {
    // ignore
  }

  outer: while (step < loop.max_steps) {
    if (loop.timeout_ms > 0 && Date.now() - startTime >= loop.timeout_ms) {
      await client.app?.log?.({
        body: {
          service: "obloop",
          level: "info",
          message: "Obloop stopped: timeout",
          extra: { step, elapsed_ms: Date.now() - startTime },
        },
      })
      break
    }

    for (let i = 0; i < agents.length; i++) {
      if (step >= loop.max_steps) break outer
      if (loop.timeout_ms > 0 && Date.now() - startTime >= loop.timeout_ms) break outer

      const agent = agents[i] ?? "default"
      const title = `obloop: ${agent} (step ${step + 1}/${loop.max_steps})`
      let sessionId = ""

      try {
        const session = await client.session.create({
          body: { title },
        })
        const sid = session.data?.id ?? (session as { id?: string }).id
        sessionId = sid ?? ""
        if (!sessionId) {
          await client.app?.log?.({
            body: {
              service: "obloop",
              level: "error",
              message: "Obloop: session.create did not return an id",
              extra: { agent },
            },
          })
          break outer
        }
      } catch (err) {
        await client.app?.log?.({
          body: {
            service: "obloop",
            level: "error",
            message: "Obloop: failed to create session",
            extra: { agent, error: String(err) },
          },
        })
        break outer
      }

      try {
        await client.tui?.showToast?.({
          body: { message: `Obloop: starting ${agent} (step ${step + 1})`, variant: "info" },
        })
      } catch {
        // ignore
      }

      try {
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            agent,
            parts: [{ type: "text", text: prompt }],
          },
        })
      } catch (err) {
        await client.app?.log?.({
          body: {
            service: "obloop",
            level: "error",
            message: "Obloop: failed to send prompt",
            extra: { agent, sessionId, error: String(err) },
          },
        })
        break outer
      }

      if (loop.stop_phrase) {
        const text = await getLastAssistantText(client, sessionId)
        if (matchesStopPhrase(text, loop.stop_phrase, loop.stop_mode)) {
          stoppedByPhrase = true
          await client.app?.log?.({
            body: {
              service: "obloop",
              level: "info",
              message: "Obloop stopped: stop phrase matched",
              extra: { step: step + 1, stop_phrase: loop.stop_phrase },
            },
          })
          try {
            await client.tui?.showToast?.({
              body: { message: "Obloop: done (stop phrase matched)", variant: "success" },
            })
          } catch {
            // ignore
          }
          break outer
        }
      }

      step += 1
      try {
        await client.tui?.showToast?.({
          body: { message: `Obloop: ${agent} done`, variant: "success" },
        })
      } catch {
        // ignore
      }

      if (loop.delay_ms > 0) {
        await new Promise((r) => setTimeout(r, loop.delay_ms))
      }
    }
  }

  try {
    await client.app?.log?.({
      body: {
        service: "obloop",
        level: "info",
        message: "Obloop finished",
        extra: { agents, step, stoppedByPhrase },
      },
    })
  } catch {
    // ignore
  }
}
