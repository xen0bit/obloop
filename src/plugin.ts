import type { Plugin } from "@opencode-ai/plugin"
import { OBLOOP_ACK_SKILL, OBLOOP_COMMAND_NAMES } from "./constants.js"
import { loadObloopConfig } from "./config.js"
import { runLoop } from "./run-loop.js"

type Ctx = Parameters<Plugin>[0]
type Level = "debug" | "info" | "warn" | "error"

const log = (ctx: Ctx, level: Level, message: string, extra?: Record<string, unknown>) =>
  ctx.client.app.log({ body: { service: "obloop", level, message, extra } } as Parameters<Ctx["client"]["app"]["log"]>[0]).catch(() => {})

export const obloopPlugin: Plugin = async (ctx) => {
  await log(ctx, "info", "Obloop plugin loaded", { directory: ctx.directory })

  let loopRunning = false

  const tryStartLoop = (directory: string, promptOverride?: string): boolean => {
    if (loopRunning) return false
    loopRunning = true
    runLoop(ctx, { directory, promptOverride })
      .finally(() => { loopRunning = false })
      .catch((err) => { void log(ctx, "error", "Obloop loop failed", { error: String(err) }) })
    return true
  }

  const isObloopCommand = (name: string): boolean => {
    const normalized = name.replace(/^\//, "").trim().toLowerCase()
    return OBLOOP_COMMAND_NAMES.some((c) => {
      const base = c.replace(/^\//, "").toLowerCase()
      return normalized === base || normalized.startsWith(base + " ")
    })
  }

  return {
    // Primary hook: fires when user executes a slash command like /obloop.
    // Model-agnostic — intercepts the command before the model ever sees it.
    "command.execute.before": async (input, output) => {
      try {
        await log(ctx, "debug", "command.execute.before fired", { command: input.command, sessionID: input.sessionID })

        if (!isObloopCommand(input.command)) return

        const directory = ctx.directory
        if (!directory) {
          await log(ctx, "error", "command.execute.before: ctx.directory is empty")
          return
        }

        const prompt = input.arguments?.trim().replace(/^["']|["']$/g, "") || undefined
        const config = loadObloopConfig(directory)
        const agents = config.agents.join(" → ")

        await log(ctx, "info", "command.execute.before: starting loop", { prompt, agents, directory })

        const ack = tryStartLoop(directory, prompt)
          ? `Obloop started. Agents: ${agents}. Sessions will appear in the session list.`
          : "Obloop is already running."

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        output.parts = [{ type: "text", text: ack } as any]
      } catch (err) {
        await log(ctx, "error", "command.execute.before hook threw", { error: String(err) })
      }
    },

    // Fallback: for models that call the skill tool as an explicit function call.
    // The loopRunning guard prevents double-starting.
    "tool.execute.before": async (input, output) => {
      try {
        if (input.tool !== "skill") return

        const rawName = typeof output.args?.name === "string" ? output.args.name : ""
        if (!isObloopCommand(rawName)) return

        await log(ctx, "info", "tool.execute.before: obloop skill detected", { rawName })

        const directory = ctx.directory
        if (!directory) {
          await log(ctx, "error", "tool.execute.before: ctx.directory is empty")
          return
        }

        const prompt = (
          rawName.replace(/^\/?(obloop)\s*/i, "").trim() ||
          (typeof output.args?.arguments === "string" ? output.args.arguments.trim() : "")
        ).replace(/^["']|["']$/g, "")

        const config = loadObloopConfig(directory)
        const agents = config.agents.join(" → ")

        if (!tryStartLoop(directory, prompt || undefined)) {
          output.args = { ...output.args, name: OBLOOP_ACK_SKILL, arguments: "Obloop is already running." } as Record<string, unknown>
          return
        }

        output.args = {
          ...output.args,
          name: OBLOOP_ACK_SKILL,
          arguments: `Obloop started. Agents: ${agents}. Sessions will appear in the session list.`,
        } as Record<string, unknown>
      } catch (err) {
        await log(ctx, "error", "tool.execute.before hook threw", { error: String(err) })
      }
    },
  }
}

export default obloopPlugin
