import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  DEFAULT_AGENTS,
  DEFAULT_PROMPT,
  DEFAULT_MAX_STEPS,
  DEFAULT_TIMEOUT_MS,
  CONFIG_DIR,
  CONFIG_FILE,
  STOP_MODES,
  type StopMode,
} from "./constants.js"

/** Parse comma-separated agents from env var */
function parseAgentsFromEnv(envValue: string | undefined): string[] | undefined {
  if (!envValue || envValue.trim() === "") return undefined
  return envValue.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
}

export type LoopConfig = {
  max_steps: number
  timeout_ms: number
  stop_phrase: string
  stop_mode: StopMode
  delay_ms: number
}

/** Raw loop config from JSON (timeout/delay can be strings like "60m", "5s"). */
export type RawLoopConfig = Partial<Omit<LoopConfig, "timeout_ms" | "delay_ms">> & {
  timeout?: string
  delay?: string
}

export type ObloopConfig = {
  agents: string[]
  prompt: string
  loop: LoopConfig
}

const DURATION_REG = /^(\d+)(s|m|h)$/

/** Parse duration string like "60m", "5s", "1h" to milliseconds. */
export function parseDuration(s: string | undefined): number {
  if (s == null || typeof s !== "string" || s.trim() === "") return 0
  const m = s.trim().toLowerCase().match(DURATION_REG)
  if (!m) return 0
  const n = Number.parseInt(m[1], 10)
  const unit = m[2]
  if (unit === "s") return n * 1000
  if (unit === "m") return n * 60 * 1000
  if (unit === "h") return n * 60 * 60 * 1000
  return 0
}

export function normalizeLoop(raw: RawLoopConfig | undefined): LoopConfig {
  return {
    max_steps:
      typeof raw?.max_steps === "number" && raw.max_steps > 0
        ? raw.max_steps
        : DEFAULT_MAX_STEPS,
    timeout_ms:
      parseDuration(raw?.timeout) || DEFAULT_TIMEOUT_MS,
    stop_phrase:
      typeof raw?.stop_phrase === "string" ? raw.stop_phrase : "",
    stop_mode:
      STOP_MODES.includes(raw?.stop_mode as StopMode)
        ? (raw?.stop_mode as StopMode)
        : "suffix",
    delay_ms: parseDuration(raw?.delay),
  }
}

function parseJsonSafe<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    const raw = readFileSync(path, "utf-8")
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * Load obloop config from environment variables.
 * Env vars take precedence over JSON config files.
 *
 * Supported env vars:
 * - OBLOOP_AGENTS: comma-separated list (e.g., "backward,forward")
 * - OBLOOP_PROMPT: prompt string
 * - OBLOOP_MAX_STEPS: number
 * - OBLOOP_TIMEOUT: duration string (e.g., "60m", "5s")
 * - OBLOOP_STOP_PHRASE: string
 * - OBLOOP_STOP_MODE: "exact", "contains", or "suffix"
 * - OBLOOP_DELAY: duration string (e.g., "5s")
 */
function loadConfigFromEnv(): { agents?: string[]; prompt?: string; loop?: RawLoopConfig } {
  const env = process.env
  const result: { agents?: string[]; prompt?: string; loop?: RawLoopConfig } = {}

  const agents = parseAgentsFromEnv(env.OBLOOP_AGENTS)
  if (agents && agents.length > 0) {
    result.agents = agents
  }

  if (env.OBLOOP_PROMPT && env.OBLOOP_PROMPT.trim() !== "") {
    result.prompt = env.OBLOOP_PROMPT
  }

  const loop: RawLoopConfig = {}
  if (env.OBLOOP_MAX_STEPS) {
    const steps = Number.parseInt(env.OBLOOP_MAX_STEPS, 10)
    if (!Number.isNaN(steps) && steps > 0) {
      loop.max_steps = steps
    }
  }
  if (env.OBLOOP_TIMEOUT) {
    loop.timeout = env.OBLOOP_TIMEOUT
  }
  if (env.OBLOOP_STOP_PHRASE) {
    loop.stop_phrase = env.OBLOOP_STOP_PHRASE
  }
  if (env.OBLOOP_STOP_MODE && STOP_MODES.includes(env.OBLOOP_STOP_MODE as StopMode)) {
    loop.stop_mode = env.OBLOOP_STOP_MODE as StopMode
  }
  if (env.OBLOOP_DELAY) {
    loop.delay = env.OBLOOP_DELAY
  }

  if (Object.keys(loop).length > 0) {
    result.loop = loop as RawLoopConfig
  }

  return result
}

/**
 * Load obloop config with priority: env vars > opencode.json > .obloop/config.json > defaults.
 */
export function loadObloopConfig(directory: string): ObloopConfig {
  const opencodePath = join(directory, "opencode.json")
  const obloopConfigPath = join(directory, CONFIG_DIR, CONFIG_FILE)

  const fromOpencode = parseJsonSafe<{
    obloop?: Partial<{ agents: string[]; prompt: string }> & { loop?: RawLoopConfig }
  }>(opencodePath, {})
  const obloop = fromOpencode?.obloop
  if (obloop && Array.isArray(obloop.agents)) {
    const prompt = typeof obloop.prompt === "string" ? obloop.prompt : DEFAULT_PROMPT
    return {
      agents: obloop.agents,
      prompt,
      loop: normalizeLoop(obloop.loop),
    }
  }

  const fromObloopDir = parseJsonSafe<
    Partial<{ agents: string[]; prompt: string }> & { loop?: RawLoopConfig }
  >(obloopConfigPath, {})
  const fileAgents = Array.isArray(fromObloopDir.agents)
    ? fromObloopDir.agents
    : DEFAULT_AGENTS
  const filePrompt = typeof fromObloopDir.prompt === "string"
    ? fromObloopDir.prompt
    : DEFAULT_PROMPT
  const fileLoop = normalizeLoop(fromObloopDir.loop)

  const envConfig = loadConfigFromEnv()
  const mergedLoop: RawLoopConfig = {
    max_steps: envConfig.loop?.max_steps ?? fileLoop.max_steps,
    timeout: envConfig.loop?.timeout ?? `${fileLoop.timeout_ms / 1000 / 60}m`,
    stop_phrase: envConfig.loop?.stop_phrase ?? fileLoop.stop_phrase,
    stop_mode: envConfig.loop?.stop_mode ?? fileLoop.stop_mode,
    delay: envConfig.loop?.delay ?? `${fileLoop.delay_ms / 1000}s`,
  }
  return {
    agents: envConfig.agents ?? fileAgents,
    prompt: envConfig.prompt ?? filePrompt,
    loop: normalizeLoop(mergedLoop),
  }
}
