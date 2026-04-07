# Obloop Plugin – Approach

## Goal

Run a **sequence of OpenCode sessions**, each with a different agent (e.g. backward → forward), where:

1. Each session is **fresh**: no parent, no prior context. Backward and forward have **no visibility** to any parent or previous session; they maintain their **own** state. Obloop does **not** preserve or pass state.
2. When one agent’s session finishes, the next agent’s session starts in the **same** OpenCode instance. Agent output **streams directly** to the interface.
3. Agents and prompt are **configurable**.
4. Triggered by a **slash command** (e.g. `/obloop`) in the TUI, with a single view of sessions starting and stopping.

## Why not `opencode run --agent X && opencode run --agent Y`?

Running separate `opencode run` processes would:

- Start multiple processes/windows.
- Not give a “single view” of sessions in one TUI.

So we use the **OpenCode SDK/client inside the plugin** to create sessions and send prompts on the **current** server. All sessions then appear in the same OpenCode app (session list + stream).

## Architecture

### 1. Trigger: slash command → skill tool

- OpenCode exposes **skills** as slash commands (e.g. `.opencode/skills/obloop/SKILL.md` → `/obloop`).
- When the user runs `/obloop [prompt]`, the **skill** tool is invoked with a name like `obloop` or `/obloop ...`.
- The plugin hooks **`tool.execute.before`** and, when `input.tool === "skill"` and the name matches `obloop`, runs the loop and (optionally) rewrites the skill args so the tool returns a short “Obloop started” message instead of running the real obloop skill body.

### 2. Loop runner (same process, same server)

- Use the plugin context **`client`** (same server the TUI is connected to).
- **No subprocesses.** For each agent in config:
  1. **Create session** – `client.session.create({ body: { title } })` with **no parent** and no prior context. The agent has no visibility to any parent or previous session.
  2. **Send prompt with agent** – `client.session.prompt({ path: { id }, body: { agent, parts } })`. The response **streams directly** to the interface (same as any normal session).
  3. When the prompt completes (await returns), create the next session and repeat.

Obloop does **not** preserve or pass state; each agent maintains its own state. All sessions show up in the same TUI and stream to the UI as they run.

### 3. Configuration

- **Agents:** list of agent IDs, e.g. `["backward", "forward"]`.
- **Prompt:** prompt sent to each agent (configurable; can be overridden via `/obloop "..."`).
- **No obloop state:** Obloop does not preserve or pass state. Backward and forward maintain their own state and always start fresh.

Config can live in:

- `opencode.json`: `"obloop": { "agents": ["backward", "forward"], "prompt": "..." }`, or
- `.obloop/config.json` in the project.

### 4. Single view and streaming

- Because we use `client.session.create` and `client.session.prompt` on the **existing** server, every new session is in the same OpenCode instance.
- Agent output **streams directly** to the interface (same as any normal OpenCode session). The user can switch to the new session to watch it live.
- Optional: use **toasts** (`client.tui.showToast`) when each agent’s session starts/ends so the user gets a clear “backward done → forward started” signal.

## Implementation outline

| Piece | Responsibility |
|-------|----------------|
| **Plugin entry** | Export a Bun/TS plugin; receive `{ client, directory, $, project }`; return hooks. |
| **`tool.execute.before`** | If tool === `"skill"` and name matches `/obloop`, parse prompt/args, load config, start `runLoop(ctx, config)` in the background (don’t await), then rewrite skill args so the tool returns “Obloop started. Agents: …” (e.g. by pointing at a tiny ack skill). |
| **`runLoop`** | For each agent: create a fresh session (no parent) → prompt with that agent → await completion (response streams to UI) → next agent. No state preserved or passed by obloop. |
| **Config** | Read `obloop` from project config or `.obloop/config.json`; default agents and prompt if missing. No state file. |
| **Skill file** | Provide or document `.opencode/skills/obloop/SKILL.md` so `/obloop` exists; body can be minimal since the plugin does the real work. |

## Differences from ralph-loop (oh-my-openagent)

- **Ralph-loop:** one session; on each `session.idle` the same session gets a **continuation** prompt until a completion promise or max iterations.
- **Obloop:** **multiple sessions**, one per agent; each session runs once (one iteration), then we wait for idle and start the **next** session with the next agent. No continuation in the same session; “loop” is over the **sequence of agents**, not over turns in one session.

## Tech stack

- **Runtime:** Bun.
- **Plugin:** OpenCode plugin (single TS file or small module) with `tool.execute.before` and optional custom tool.
- **Config:** `opencode.json` and/or `.obloop/config.json`. No obloop-managed state; agents maintain their own state.

This gives you a clean way to run “backward then forward then …” as separate, **fresh** sessions in one view, triggered by `/obloop`, with configurable agents and prompt. Output streams directly to the interface.
