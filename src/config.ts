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
 * Load obloop config: opencode.json "obloop" key first, then .obloop/config.json.
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
  return {
    agents: Array.isArray(fromObloopDir.agents)
      ? fromObloopDir.agents
      : DEFAULT_AGENTS,
    prompt:
      typeof fromObloopDir.prompt === "string"
        ? fromObloopDir.prompt
        : DEFAULT_PROMPT,
    loop: normalizeLoop(fromObloopDir.loop),
  }
}
