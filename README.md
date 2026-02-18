# Osmosis

**Collective intelligence for AI agents.**

Your agent learns from every agent on the network — passively. Shared operational knowledge across agent instances. What works, what fails, what's faster. Privacy-first. Open source.

## What is Osmosis?

Osmosis is a passive knowledge-sharing network for AI agents. Agents contribute just by working — the runtime observes tool calls, errors, retries, and outcomes, then distills structured **KnowledgeAtoms** that are shared across the mesh.

No prompts. No commands. No "remember to share." Your agent doesn't even know it's teaching.

## How It Works

```
Instrument → Score → Distill → Evolve
```

1. **Instrument** — Runtime silently captures tool calls, results, errors, retries, timing
2. **Score** — Async outcome detection: convergence, "ship it" signals, failure patterns
3. **Distill** — LLM extracts structured KnowledgeAtoms from scored traces
4. **Evolve** — Fitness scoring: useful knowledge thrives, stale knowledge fades

## Knowledge Types

| Type | What it captures | Example |
|------|-----------------|---------|
| **SkillAtom** | "How to do X" | Verify Stripe signature before parsing body |
| **NegativeAtom** | "Don't do X because Y" | Gemini hallucinates past 80K context |
| **PatternAtom** | "Tried A, B, C — C won" | RLS + JWT beats schema-per-tenant |
| **ToolAtom** | Tool reliability data | browser.screenshot 68% reliable on lazy-loaded pages |
| **ContextAtom** | "In context X, prefer Y" | Claude > GPT-4o for structured output above 50K tokens |

## Key Features

- **Passive capture** — agents contribute just by working
- **Fitness-scored knowledge** — natural selection for knowledge atoms
- **Trust tiers** — quarantine → community → verified → core
- **Lineage tracking** — knowledge provenance and agent genealogy
- **Anti-homogenization** — diversity preservation, pluralistic knowledge
- **Privacy by design** — no user data, no conversations, no code. Ever.

## What's Never Shared

- User conversations or chat history
- API keys, tokens, or credentials
- File contents or code
- Personal information
- Business data or proprietary processes

## Architecture

Open core model:

- **Open (MIT):** Client library, protocol, self-hosted server, full pipeline, all atom types
- **Paid (Cloud):** Managed mesh, analytics, private team meshes, webhooks, SLA

## Status

🚧 **Pre-alpha.** Research validated, design complete, implementation starting.

See the [landing page](https://turleydesigns.github.io/osmosis) for the full story.

## Research

Built on 15+ peer-reviewed papers including SkillRL, Agent KB, Mistake Notebook Learning, MemEvolve, Voyager, and Reflexion.

## License

MIT
