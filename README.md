# obloop

OpenCode plugin: run a **sequence of agents** (e.g. backward → forward) as separate sessions, one after the other. Each agent runs in a **fresh session** with no visibility to any parent or previous session; backward and forward maintain their **own** state. When one session finishes, the next agent’s session starts. Sessions stream directly to the interface; all appear in the same OpenCode instance.

Inspired by [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)’s ralph-loop; unlike ralph-loop, obloop uses **multiple sessions** (one per agent), each starting fresh. **Obloop does not preserve or pass state** between agents.

## Requirements

- [Bun](https://bun.sh)
- [OpenCode](https://opencode.ai) with plugin support

## Install

### Local (project-scoped)

```sh
make setup
```

Creates `.opencode/plugins/obloop.ts` as a symlink to `plugin.ts`, so OpenCode in this directory picks it up. Agents and skills are already present under `.opencode/`.

### Global

```sh
make install
```

Copies the plugin source, entry file, agents, and skills into `~/.config/opencode/` (Linux/macOS) or `%APPDATA%/opencode/` (Windows). Works from any project that references these agents.

```sh
make uninstall   # remove only what install placed
make clean       # remove local plugin symlink
make build       # type-check the source
```

### Manual

1. Clone or link this repo into your OpenCode plugin directory:
   - **Project:** `.opencode/plugins/` (e.g. copy or symlink `plugin.ts` as `obloop.ts`)
   - **Global:** `~/.config/opencode/plugins/`

2. Ensure the **obloop skill** is available so `/obloop` works:
   - This repo includes `.opencode/skills/obloop/` and `.opencode/skills/obloop-ack/`.
   - For a project, copy `.opencode/skills/` into your project’s `.opencode/` (or symlink).
   - For global use, copy the same into `~/.config/opencode/skills/`.

3. (Optional) Add a `package.json` in the plugin directory if you use extra deps; OpenCode uses Bun to install.

## Configuration

Configure agents and the prompt sent to each in either:

**Option A – `opencode.json` (project root):**

```json
{
  "plugin": ["obloop"],
  "obloop": {
    "agents": ["backward", "forward"],
    "prompt": "Execute your current task.",
    "loop": {
      "max_steps": 20,
      "timeout": "60m",
      "stop_phrase": "<promise>DONE</promise>",
      "stop_mode": "suffix",
      "delay": "5s"
    }
  }
}
```

**Option B – `.obloop/config.json`:**

```json
{
  "agents": ["backward", "forward"],
  "prompt": "Execute your current task.",
  "loop": {
    "max_steps": 20,
    "timeout": "60m",
    "stop_phrase": "<promise>DONE</promise>",
    "stop_mode": "suffix",
    "delay": "5s"
  }
}
```

- **agents:** list of OpenCode agent IDs (order = execution order).
- **prompt:** prompt sent to each agent. Leave empty to use a `task.md` file in the project root as the prompt, or require a prompt override via `/obloop "your prompt"`. Obloop does **not** preserve or pass state; each agent reads and maintains its own state.

**Loop options** (under `obloop.loop` or `loop` in `.obloop/config.json`):

| Option | Description | Default |
|--------|-------------|---------|
| `max_steps` | Stop after this many agent runs (one run = one session). | `100` |
| `timeout` | Stop after this duration. Use `"60m"`, `"5s"`, `"1h"`. | `"60m"` |
| `stop_phrase` | When the assistant’s reply matches this, the loop stops successfully. | `""` (disabled) |
| `stop_mode` | How to match `stop_phrase`: `"exact"` (whole reply), `"contains"`, `"suffix"` (recommended). | `"suffix"` |
| `delay` | Wait time between iterations (e.g. `"5s"`). | no delay |

## Usage

1. In OpenCode TUI, run:
   ```
   /obloop
   ```
   or with an override prompt:
   ```
   /obloop "Read state and do one step"
   ```

2. The plugin starts the loop in the background and you get a short “Obloop started. Agents: backward → forward. …” message.

3. New sessions appear in the session list, one per agent, in order. Each session is **fresh** (no parent, no prior context). Agent output **streams directly** to the interface; switch to the new session to watch it live. When a session finishes, the next agent’s session is created.

4. Optional toasts (if supported) indicate when each agent’s session starts and finishes.

## How it works

- **Trigger:** When you run `/obloop`, the plugin’s `command.execute.before` hook fires first and starts the loop. As a fallback, the `tool.execute.before` hook catches it if the model calls the skill as an explicit function call. In both cases the loop starts without awaiting and the chat shows “Obloop started …”.
- **Loop:** For each agent in config, the plugin uses the OpenCode **client** (same server as the TUI) to:
  1. Create a **new session** (no parent, no prior context – agent has no visibility to previous sessions).
  2. Send a single prompt with that **agent** set; the response **streams** to the UI.
  3. When the prompt completes, create the next session and repeat.

Obloop does not preserve or pass state; backward and forward maintain their own state. There are no separate `opencode run` processes; everything runs in the same OpenCode instance.

## Built-in agents

The repo ships two agents under `.opencode/agents/`:

- **backward** – Revision agent. On the first pass it reads `task.md`, selects an expert persona suited to the task, and writes that persona into `.opencode/state/forward.md` for the forward agent to adopt. On subsequent passes it picks one completed unit from forward's work, replaces its implementation with an inline `# TODO:` critique and re-spec, and marks the unit incomplete so forward must re-implement it to a higher standard.
- **forward** – Builder agent. Adopts whatever persona backward chose. On each session it reads `task.md`, executes one logical unit of work (sets up the project skeleton on the first pass, then implements one task queue item per pass), runs tests, and marks the unit complete. When all units are done it emits `<promise>DONE</promise>` — which, combined with the `stop_phrase` config, terminates the loop.

These agents communicate via shared state files in `.opencode/state/` and read the task from `task.md` in the project root. They are intentionally general-purpose and work for any task type (code, writing, analysis, etc.).

## Approach

See [docs/APPROACH.md](docs/APPROACH.md) for architecture, comparison with ralph-loop, and implementation notes.

## License

MIT
