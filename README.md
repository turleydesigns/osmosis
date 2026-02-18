# Osmosis 🧠

Evolutionary knowledge store for AI agents. Captures tool call patterns, failures, and insights — then injects relevant context into future tasks.

## Quick Start

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Seed with example knowledge atoms
node packages/cli/dist/cli.js seed

# Check what's in the store
node packages/cli/dist/cli.js status

# Search for knowledge
node packages/cli/dist/cli.js search "browser screenshot"

# Start the REST API server
node packages/cli/dist/cli.js serve

# Run all tests
npm test
```

## Packages

| Package | Description |
|---------|-------------|
| `@osmosis/core` | Types, SQLite store, capture, fitness, validation, retrieval, API server |
| `@osmosis/openclaw` | OpenClaw integration — instrument tool calls, inject context |
| `@osmosis/cli` | CLI runner — serve, status, search, seed, reset |

## Architecture

```
Agent Tool Call → instrumentToolCall() → captureToolCall() → AtomStore (SQLite)
                                                                    ↓
Agent Task Start ← getRelevantContext() ← searchAtoms (FTS5) ←────┘
```

**Atoms** are units of knowledge with types: `tool`, `negative`, `pattern`, `skill`, `context`.
Each atom has a fitness score that decays over time and increases with evidence/usage.

## API

Default port: `7432`

- `POST /atoms` — Create an atom
- `GET /atoms` — List atoms (filter: `?type=`, `?tool_name=`)
- `GET /atoms/search?q=` — Full-text search
- `GET /atoms/:id` — Get single atom

## CLI

```
osmosis serve   [--port N] [--db PATH]  Start the REST API server
osmosis status  [--db PATH]             Show atom count and top atoms
osmosis search  <query> [--db PATH]     Search atoms
osmosis seed    [--db PATH]             Seed with example atoms
osmosis reset   [--db PATH]             Wipe all atoms
```

## License

MIT
