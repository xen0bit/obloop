# obloop

OpenCode plugin: run a **sequence of agents** (e.g. chaos → developer) as separate sessions, one after the other. Each agent runs in a **fresh session** with no visibility to any parent or previous session; chaos and developer maintain their **own** state. When one session finishes, the next agent’s session starts. Sessions stream directly to the interface; all appear in the same OpenCode instance.

Inspired by [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)’s ralph-loop; unlike ralph-loop, obloop uses **multiple sessions** (one per agent), each starting fresh. **Obloop does not preserve or pass state** between agents.

## Requirements

- [Bun](https://bun.sh)
- [OpenCode](https://opencode.ai) with plugin support

## Install

**Using Make (Linux/macOS, or Git Bash/WSL on Windows):**

```bash
make install   # install plugin + skills to ~/.config/opencode (or %APPDATA%\opencode on Windows)
make uninstall # remove them
```

**Manual:**

1. Clone or link this repo into your OpenCode plugin directory, or point OpenCode at the entry file `obloop.ts`:
   - **Project:** `.opencode/plugins/` (e.g. copy or symlink `obloop.ts`)
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
    "agents": ["chaos", "developer"],
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
  "agents": ["chaos", "developer"],
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
- **prompt:** prompt sent to each agent. Leave empty to require a prompt override via `/obloop "your prompt"`. Obloop does **not** preserve or pass state; each agent reads and maintains its own state.

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

2. The plugin starts the loop in the background and you get a short “Obloop started. Agents: chaos → developer. …” message.

3. New sessions appear in the session list, one per agent, in order. Each session is **fresh** (no parent, no prior context). Agent output **streams directly** to the interface; switch to the new session to watch it live. When a session finishes, the next agent’s session is created.

4. Optional toasts (if supported) indicate when each agent’s session starts and finishes.

## Troubleshooting: `/obloop` not in the TUI

- **Plugin loading:** OpenCode only auto-loads plugin **files that are directly inside** the plugins directory. `make install` now installs `obloop.ts` and `src/` at the top level of `~/.config/opencode/plugins/` so the plugin is loaded without adding it to your config.
- **Slash command:** `/obloop` comes from the **skill** (`.opencode/skills/obloop/`). For it to appear:
  - If you run OpenCode from the obloop repo, the project’s `.opencode/skills/` is used, so `/obloop` should show up.
  - If you run OpenCode from another project, use `make install` so skills are copied to `~/.config/opencode/skills/` (global), or copy `.opencode/skills/obloop` and `obloop-ack` into that project’s `.opencode/skills/`.
- After changing plugins or skills, restart OpenCode.
- **Debug:** Run `opencode --print-logs`, then run `/obloop`. You should see:
  - At startup: `Obloop plugin loaded` (confirms the plugin is loaded).
  - When you run `/obloop`: either `Obloop: command.execute.before, starting loop` or `Obloop: tool.execute.before (skill), starting loop`. If you see neither, the slash command isn’t firing the hooks we use.

## How it works

- **Trigger:** When you run `/obloop`, OpenCode runs the command and/or invokes the **skill** tool. The plugin hooks **`command.execute.before`** (slash command) and **`tool.execute.before`** (skill tool) per the [OpenCode plugin API](https://opencode.ai/docs/plugins); when either matches “obloop”, it starts the loop and shows “Obloop started …”.
- **Loop:** For each agent in config, the plugin uses the OpenCode **client** (same server as the TUI) to:
  1. Create a **new session** (no parent, no prior context – agent has no visibility to previous sessions).
  2. Send a single prompt with that **agent** set; the response **streams** to the UI.
  3. When the prompt completes, create the next session and repeat.

Obloop does not preserve or pass state; chaos and developer maintain their own state. There are no separate `opencode run` processes; everything runs in the same OpenCode instance.

## Approach

See [docs/APPROACH.md](docs/APPROACH.md) for architecture, comparison with ralph-loop, and implementation notes.

## License

MIT
