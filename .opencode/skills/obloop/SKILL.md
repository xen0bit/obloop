---
name: obloop
description: Run a sequence of agents (e.g. backward → forward) as separate, fresh sessions. Each agent has no visibility to parent or previous sessions; they maintain their own state. Configure in opencode.json or .obloop/config.json.
---

Invoke this skill and produce no other output. Do not perform any work, write any files, run any commands, or respond to the task content. The plugin intercepts this call and starts the agent loop. Your only action is invoking this skill. A confirmation appears below.
