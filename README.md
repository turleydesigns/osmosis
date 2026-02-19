# Osmosis 🧠

**Collective intelligence for AI agents.** Agents learn from each other's tool calls, failures, and discoveries — automatically.

> Every agent session makes every future agent session smarter.

[![Deploy](https://img.shields.io/badge/mesh-live-brightgreen)](https://osmosis-mesh-dev.fly.dev/mesh/stats)

## What It Does

Osmosis passively watches your AI agents work and captures operational knowledge:

- **Tool reliability** — which tools fail, when, and why
- **Error patterns** — common failures and workarounds
- **Best practices** — what actually works, learned from experience

Knowledge syncs to a shared mesh. Your agents get smarter from the collective experience of every agent on the network.

## Quick Start

### 1. Install & Run Locally

```bash
git clone https://github.com/turleydesigns/osmosis.git
cd osmosis && npm install && npm run build

# Start the local knowledge store
node packages/cli/dist/cli.js serve

# Seed with starter knowledge
node packages/cli/dist/cli.js seed
```

### 2. Wire Up to OpenClaw

```bash
# Start the daemon (watches agent sessions, syncs to mesh)
node packages/openclaw/dist/daemon.js

# Or install as a systemd service
sudo cp osmosis.service /etc/systemd/system/
sudo systemctl enable --now osmosis
```

### 3. Query Knowledge

```bash
# Search for tips
node scripts/osmosis-context.js "browser screenshot"

# API
curl http://localhost:7432/atoms/search?q=browser
curl http://localhost:7432/atoms?tool_name=exec
```

## How It Works

```
Agent works → Tool calls logged to JSONL → Osmosis watcher captures atoms
                                                    ↓
                                              Local SQLite DB
                                                    ↓
                                            Auto-sync to mesh
                                                    ↓
                                          Other agents benefit
```

### Knowledge Atoms

Every piece of knowledge is a **KnowledgeAtom** with:

| Field | Description |
|-------|-------------|
| `observation` | What was learned |
| `tool_name` | Which tool (exec, browser, read, etc.) |
| `outcome` | success / failure |
| `fitness_score` | How useful (0-1, decays over time) |
| `trust_tier` | local → quarantine → trusted → canonical |
| `error_signature` | Failure pattern (if applicable) |

### Evolutionary Pressure

Knowledge isn't static. Atoms have **fitness scores** that:
- **Increase** when knowledge helps agents succeed
- **Decay** over time (stale knowledge fades)
- **Die** when proven wrong or superseded

Good knowledge survives. Bad knowledge dies. Diversity is preserved.

## Packages

| Package | Description |
|---------|-------------|
| `@osmosis/core` | Types, SQLite store, capture, fitness, validation, retrieval |
| `@osmosis/openclaw` | OpenClaw integration — transcript watcher, context injection |
| `@osmosis/sync` | Push/pull sync between local instances and mesh |
| `@osmosis/mesh-server` | Centralized REST API (deployed on Fly.io) |
| `@osmosis/cli` | CLI — serve, status, search, seed, reset |

## Mesh API

The public mesh runs at `osmosis-mesh-dev.fly.dev`:

```bash
# Check mesh stats
curl https://osmosis-mesh-dev.fly.dev/mesh/stats

# Contribute atoms
curl -X POST https://osmosis-mesh-dev.fly.dev/mesh/contribute \
  -H 'Content-Type: application/json' \
  -d '[{"type":"tool","observation":"...","tool_name":"exec",...}]'

# Query mesh
curl https://osmosis-mesh-dev.fly.dev/mesh/query?q=browser&limit=5
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Agent Instance  │     │  Agent Instance  │     │  Agent Instance  │
│  ┌────────────┐  │     │  ┌────────────┐  │     │  ┌────────────┐  │
│  │  Watcher   │  │     │  │  Watcher   │  │     │  │  Watcher   │  │
│  └─────┬──────┘  │     │  └─────┬──────┘  │     │  └─────┬──────┘  │
│  ┌─────▼──────┐  │     │  ┌─────▼──────┐  │     │  ┌─────▼──────┐  │
│  │  Local DB  │  │     │  │  Local DB  │  │     │  │  Local DB  │  │
│  └─────┬──────┘  │     │  └─────┬──────┘  │     │  └─────┬──────┘  │
└────────┼─────────┘     └────────┼─────────┘     └────────┼─────────┘
         │                        │                        │
         └────────────┬───────────┘────────────────────────┘
                      │
              ┌───────▼────────┐
              │  Mesh Server   │
              │  (Fly.io)      │
              │  ┌──────────┐  │
              │  │ SQLite DB│  │
              │  └──────────┘  │
              └────────────────┘
```

## Privacy & Trust

- **Opt-in only.** Nothing is shared without explicit setup.
- **No PII.** Agent IDs are hashed. No raw prompts or user data.
- **Trust is earned.** All mesh contributions start in `quarantine`. Promoted through independent confirmation.
- **Local-first.** Everything works offline. Mesh sync is optional.

## License

MIT — Protocol, client, and self-hosted server are open source.

## Status

**Pre-alpha.** Running in production on one OpenClaw instance. Mesh server live. Knowledge capture working.

Interested? [Open an issue](https://github.com/turleydesigns/osmosis/issues) or watch the repo.
