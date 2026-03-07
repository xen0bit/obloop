import type { Plugin } from "@opencode-ai/plugin"
import type { PluginContext } from "./types.js"
import { OBLOOP_ACK_SKILL, OBLOOP_COMMAND_NAMES } from "./constants.js"
import { loadObloopConfig } from "./config.js"
import { runLoop } from "./run-loop.js"

/** Match oh-my-openagent: skill name comes from output.args.name (see tool-execute-before.ts). */
function getSkillName(output: { args?: Record<string, unknown> }): string {
  const name = output.args && typeof output.args.name === "string" ? output.args.name : ""
  return name
}

function startObloop(
  ctx: PluginContext,
  directory: string,
  promptOverride?: string,
): void {
  runLoop(ctx, {
    directory,
    promptOverride,
  }).catch((err) => {
    ctx.client.app?.log?.({
      body: {
        service: "obloop",
        level: "error",
        message: "Obloop loop failed",
        extra: { error: String(err), stack: err instanceof Error ? err.stack : undefined },
      },
    })
  })
}

/**
 * Obloop plugin. Implements hooks per OpenCode plugin API and oh-my-openagent pattern:
 * - command.execute.before: when /obloop is run as a slash command (input.command, input.arguments)
 * - tool.execute.before: when the "skill" tool is invoked with name obloop (output.args.name)
 * @see https://github.com/code-yeongyu/oh-my-openagent/tree/v3.10.0/src/plugin (tool-execute-before.ts, ulw-loop/ralph-loop)
 */
export const obloopPlugin: Plugin = async (ctx) => {
  const directory =
    (typeof ctx.directory === "string" && ctx.directory.trim() !== "")
      ? ctx.directory.trim()
      : process.cwd()

  try {
    await ctx.client.app?.log?.({
      body: {
        service: "obloop",
        level: "info",
        message: "Obloop plugin loaded",
        extra: { directory },
      },
    })
  } catch {
    // ignore
  }

  return {
    // Official hook: runs when a slash command is executed (e.g. /obloop). OpenCode API: command.execute.before
    "command.execute.before": async (input, output) => {
      const command = (input.command ?? "").replace(/^\//, "").trim().toLowerCase()
      if (command !== "obloop") return
      const promptFromArgs = (input.arguments ?? "").trim().replace(/^["']|["']$/g, "")
      try {
        await ctx.client.app?.log?.({
          body: {
            service: "obloop",
            level: "info",
            message: "Obloop: command.execute.before, starting loop",
            extra: { command: input.command, arguments: promptFromArgs?.slice(0, 60) },
          },
        })
      } catch {
        // ignore
      }
      startObloop(ctx as unknown as PluginContext, directory, promptFromArgs || undefined)
      // Replace command output with ack message so user sees "Obloop started..." instead of skill body
      const config = loadObloopConfig(directory)
      const agents = config.agents.join(" → ")
      const ack = `Obloop started. Agents: ${agents}. Sessions will appear in the session list.`
      output.parts = [{ type: "text", text: ack }] as typeof output.parts
    },

    // When the "skill" tool is invoked (e.g. model or TUI calls skill with name "obloop"). Same pattern as oh-my-openagent ulw-loop/ralph-loop.
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "skill") return
      const rawName = getSkillName(output)
      const command = rawName.replace(/^\//, "").trim().toLowerCase()
      const isObloop = OBLOOP_COMMAND_NAMES.some(
        (c) => command === c.replace(/^\//, "").toLowerCase(),
      )
      if (!isObloop) return

      const promptFromArgs = rawName
        .replace(/^\/?(obloop)\s*/i, "")
        .trim()
        .replace(/^["']|["']$/g, "")

      try {
        await ctx.client.app?.log?.({
          body: {
            service: "obloop",
            level: "info",
            message: "Obloop: tool.execute.before (skill), starting loop",
            extra: { directory, rawName: rawName.slice(0, 60) },
          },
        })
      } catch {
        // ignore
      }

      startObloop(ctx as unknown as PluginContext, directory, promptFromArgs || undefined)

      const config = loadObloopConfig(directory)
      const agents = config.agents.join(" → ")
      output.args = {
        ...output.args,
        name: OBLOOP_ACK_SKILL,
        arguments: `Obloop started. Agents: ${agents}. Sessions will appear in the session list.`,
      }
    },
  }
}

export default obloopPlugin
