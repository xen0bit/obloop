import type { Plugin } from "@opencode-ai/plugin"

// PluginContext is the first argument to a Plugin function — derived from
// the actual SDK so it always matches what OpenCode passes at runtime.
export type PluginContext = Parameters<Plugin>[0]
