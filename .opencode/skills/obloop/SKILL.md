---
name: obloop
description: Run a sequence of agents (e.g. chaos → developer) as separate, fresh sessions. Each agent has no visibility to parent or previous sessions; they maintain their own state. Configure in opencode.json or .obloop/config.json.
---

Obloop runs each configured agent in its own fresh session (no shared state). Output streams to the interface. Triggered by the plugin when you use this command; the reply below confirms start.
