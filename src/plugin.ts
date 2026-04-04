import type { PluginContext } from "./types.js"
import { OBLOOP_ACK_SKILL, OBLOOP_COMMAND_NAMES } from "./constants.js"
import { loadObloopConfig } from "./config.js"
import { runLoop } from "./run-loop.js"

export type ObloopPlugin = (
  ctx: PluginContext,
) => Promise<{
  "tool.execute.before"?: (
    input: { tool: string; sessionID?: string; callID?: string },
    output: { args: Record<string, unknown> },
  ) => Promise<void>
}>

export const obloopPlugin: ObloopPlugin = async (ctx) => {
  let loopRunning = false

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "skill") return

      const rawName =
        typeof output.args?.name === "string" ? output.args.name : ""
      const normalized = rawName.replace(/^\//, "").trim().toLowerCase()
      const isObloop = OBLOOP_COMMAND_NAMES.some(
        (c) => normalized === c.replace(/^\//, "").toLowerCase(),
      )
      if (!isObloop) return

      const directory = typeof ctx.directory === "string" ? ctx.directory : ""
      if (!directory) return

      if (loopRunning) {
        output.args = {
          ...output.args,
          name: OBLOOP_ACK_SKILL,
          arguments: "Obloop is already running.",
        } as Record<string, unknown>
        return
      }

      const promptFromArgs = rawName
        .replace(/^\/?(obloop)\s*/i, "")
        .trim()
        .replace(/^["']|["']$/g, "")

      const config = loadObloopConfig(directory)
      const agents = config.agents.join(" → ")

      loopRunning = true
      runLoop(ctx, {
        directory,
        promptOverride: promptFromArgs || undefined,
      }).finally(() => {
        loopRunning = false
      }).catch((err) => {
        ctx.client.app?.log?.({
          body: {
            service: "obloop",
            level: "error",
            message: "Obloop loop failed",
            extra: { error: String(err) },
          },
        })
      })

      output.args = {
        ...output.args,
        name: OBLOOP_ACK_SKILL,
        arguments: `Obloop started. Agents: ${agents}. Sessions will appear in the session list.`,
      } as Record<string, unknown>
    },
  }
}

export default obloopPlugin
