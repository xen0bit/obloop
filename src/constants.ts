export const OBLOOP_COMMAND_NAMES = ["obloop", "/obloop"] as const
export const OBLOOP_ACK_SKILL = "/obloop-ack"
export const DEFAULT_AGENTS = ["chaos", "developer"]
export const DEFAULT_PROMPT = ""
export const CONFIG_DIR = ".obloop"
export const CONFIG_FILE = "config.json"

export const DEFAULT_MAX_STEPS = 100
export const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000 // 60 minutes
export const STOP_MODES = ["exact", "contains", "suffix"] as const
export type StopMode = (typeof STOP_MODES)[number]
