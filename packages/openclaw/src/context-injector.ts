/**
 * Context Injector — Writes relevant Osmosis knowledge tips into agent workspace
 * files that get loaded into system prompts automatically.
 * 
 * Strategy: Write a OSMOSIS_TIPS.md file that agents read at session start.
 * Updated periodically with the most relevant knowledge for each agent's tools.
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AtomStore, getTopAtoms, searchAtoms } from '@osmosis-ai/core';
import type { KnowledgeAtom } from '@osmosis-ai/core';

export interface InjectorConfig {
  /** OpenClaw workspace directory */
  workspaceDir: string;
  /** Agent workspace directories to inject into */
  agentWorkspaces: string[];
  /** Max tips per file */
  maxTips: number;
  /** Update interval (ms) */
  updateIntervalMs: number;
}

const DEFAULT_INJECTOR_CONFIG: InjectorConfig = {
  workspaceDir: join(process.env.HOME ?? '/root', '.openclaw', 'workspace'),
  agentWorkspaces: [],
  maxTips: 10,
  updateIntervalMs: 15 * 60 * 1000, // 15 min
};

/**
 * Format atoms as a readable tips file for agents.
 */
function formatTipsFile(atoms: KnowledgeAtom[]): string {
  if (atoms.length === 0) return '';

  const lines = [
    '# 🧠 Osmosis Tips',
    '',
    '_Auto-generated from collective agent experience. Updated periodically._',
    '',
    '## Tool Tips',
    '',
  ];

  const toolAtoms = atoms.filter(a => a.type === 'tool');
  const negativeAtoms = atoms.filter(a => a.type === 'negative');
  const otherAtoms = atoms.filter(a => a.type !== 'tool' && a.type !== 'negative');

  for (const atom of toolAtoms) {
    const tool = (atom as any).tool_name;
    const outcome = (atom as any).outcome;
    const icon = outcome === 'failure' ? '⚠️' : '✅';
    lines.push(`- ${icon} **${tool || 'general'}**: ${atom.observation}`);
    if ((atom as any).error_signature) {
      lines.push(`  - Error: \`${(atom as any).error_signature}\``);
    }
  }

  if (negativeAtoms.length > 0) {
    lines.push('', '## Anti-Patterns', '');
    for (const atom of negativeAtoms) {
      lines.push(`- 🚫 ${atom.observation}`);
      if ((atom as any).anti_pattern) {
        lines.push(`  - Pattern: ${(atom as any).anti_pattern}`);
      }
    }
  }

  if (otherAtoms.length > 0) {
    lines.push('', '## Insights', '');
    for (const atom of otherAtoms) {
      lines.push(`- 💡 ${atom.observation}`);
    }
  }

  lines.push('', `_${atoms.length} tips from ${new Set(atoms.map(a => a.source_agent_hash)).size} sources. Fitness range: ${Math.min(...atoms.map(a => a.fitness_score)).toFixed(2)}–${Math.max(...atoms.map(a => a.fitness_score)).toFixed(2)}_`);

  return lines.join('\n');
}

export class ContextInjector {
  private store: AtomStore;
  private config: InjectorConfig;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(store: AtomStore, config?: Partial<InjectorConfig>) {
    this.store = store;
    this.config = { ...DEFAULT_INJECTOR_CONFIG, ...config };
  }

  /** Start periodic injection */
  start(): void {
    // Inject immediately
    this.inject();

    // Then periodically
    this.timer = setInterval(() => this.inject(), this.config.updateIntervalMs);
    console.log(`💉 Context injector started (updates every ${this.config.updateIntervalMs / 60000}min)`);
  }

  /** Stop */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Run injection once */
  inject(): void {
    const atoms = getTopAtoms(this.store, undefined, this.config.maxTips);
    if (atoms.length === 0) return;

    const content = formatTipsFile(atoms);
    const dirs = this.getTargetDirs();

    for (const dir of dirs) {
      try {
        if (!existsSync(dir)) continue;
        const tipPath = join(dir, 'OSMOSIS_TIPS.md');
        
        // Only write if content changed
        const existing = existsSync(tipPath) ? readFileSync(tipPath, 'utf-8') : '';
        if (existing !== content) {
          writeFileSync(tipPath, content, 'utf-8');
        }
      } catch {
        // Skip inaccessible dirs
      }
    }
  }

  /** Get all directories to inject tips into */
  private getTargetDirs(): string[] {
    const dirs = [this.config.workspaceDir];
    
    // Discover agent workspaces
    const openclawDir = join(this.config.workspaceDir, '..');
    const agentsDir = join(openclawDir, 'agents');
    
    if (existsSync(agentsDir)) {
      try {
        const { readdirSync } = require('node:fs');
        for (const agent of readdirSync(agentsDir)) {
          // Check for workspace-{agent} pattern
          const agentWorkspace = join(openclawDir, `workspace-${agent}`);
          if (existsSync(agentWorkspace)) {
            dirs.push(agentWorkspace);
          }
        }
      } catch {
        // Skip
      }
    }

    dirs.push(...this.config.agentWorkspaces);
    return dirs;
  }
}
