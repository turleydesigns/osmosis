/**
 * OpenClaw Transcript Watcher
 * 
 * Tails OpenClaw session JSONL files and captures tool calls as KnowledgeAtoms.
 * This is the passive instrumentation layer — agents don't need to do anything,
 * the watcher observes their work and captures knowledge automatically.
 */

import { watch, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { captureToolCall, AtomStore } from '@osmosis-ai/core';

interface WatcherConfig {
  /** OpenClaw state directory (default: ~/.openclaw) */
  openclawDir: string;
  /** Agent directories to watch */
  agentDirs: string[];
  /** How often to scan for new sessions (ms) */
  scanIntervalMs: number;
  /** Ignore tool calls older than this (ms) */
  maxAgeMs: number;
}

interface FileState {
  path: string;
  offset: number; // bytes read so far
}

const DEFAULT_CONFIG: WatcherConfig = {
  openclawDir: join(process.env.HOME ?? '/root', '.openclaw'),
  agentDirs: [],
  scanIntervalMs: 10_000,
  maxAgeMs: 24 * 60 * 60 * 1000, // 24h
};

/**
 * Extract tool calls from a JSONL message entry.
 * OpenClaw stores messages as JSON lines with role, content[], timestamp.
 */
function extractToolCalls(line: string): Array<{
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp?: number;
}> {
  const calls: Array<{
    toolName: string;
    params: Record<string, unknown>;
    result?: unknown;
    error?: string;
    timestamp?: number;
  }> = [];

  try {
    const raw = JSON.parse(line);

    // OpenClaw JSONL format: {type: "message", message: {role, content}} 
    // or flat: {role, content}
    const entry = raw.message ?? raw;
    const ts = raw.timestamp ?? entry.timestamp;

    // Tool call messages (assistant role with toolCall content)
    if (entry.role === 'assistant' && Array.isArray(entry.content)) {
      for (const block of entry.content) {
        if (block.type === 'toolCall' && block.name) {
          calls.push({
            toolName: block.name,
            params: typeof block.arguments === 'object' ? block.arguments : {},
            timestamp: typeof ts === 'string' ? new Date(ts).getTime() : ts,
          });
        }
      }
    }

    // Tool result messages (role: "toolResult" in OpenClaw JSONL)
    if (entry.role === 'toolResult' && entry.toolCallId) {
      const content = Array.isArray(entry.content) ? entry.content : [];
      const resultText = content.map((c: any) => c.text ?? c.data ?? '').join('');
      const truncated = resultText.slice(0, 500);
      
      const isError = entry.isError === true ||
        (entry.details?.status === 'error') ||
        (typeof resultText === 'string' && (
          resultText.includes('Error:') || 
          resultText.includes('ENOENT') ||
          resultText.includes('ECONNREFUSED') ||
          resultText.includes('Command failed')
        ));

      calls.push({
        toolName: entry.toolCallId,
        params: {},
        result: truncated,
        error: isError ? (entry.details?.error ?? resultText.slice(0, 200)) : undefined,
        timestamp: typeof ts === 'string' ? new Date(ts).getTime() : (entry.timestamp ?? ts),
      });
    }
  } catch {
    // Skip malformed lines
  }

  return calls;
}

/**
 * Hash an agent identifier for privacy.
 */
function hashAgent(agentId: string): string {
  return createHash('sha256').update(agentId).digest('hex').slice(0, 12);
}

export class TranscriptWatcher {
  private store: AtomStore;
  private config: WatcherConfig;
  private fileStates: Map<string, FileState> = new Map();
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private pendingCalls: Map<string, { toolName: string; params: Record<string, unknown>; timestamp?: number }> = new Map();
  private capturedCount = 0;

  constructor(store: AtomStore, config?: Partial<WatcherConfig>) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Start watching for new tool calls */
  start(): void {
    // Initial scan
    this.scanSessions();

    // Periodic scan for new sessions
    this.scanTimer = setInterval(() => this.scanSessions(), this.config.scanIntervalMs);

    console.log(`🔭 Osmosis watcher started (scanning every ${this.config.scanIntervalMs / 1000}s)`);
  }

  /** Stop watching */
  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    console.log(`🔭 Osmosis watcher stopped (captured ${this.capturedCount} tool calls)`);
  }

  /** Get stats */
  get stats() {
    return {
      filesWatched: this.fileStates.size,
      capturedCount: this.capturedCount,
      pendingCalls: this.pendingCalls.size,
    };
  }

  /** Scan for session JSONL files */
  private scanSessions(): void {
    const dirs = this.getSessionDirs();

    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      try {
        const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          const fullPath = join(dir, file);
          this.processFile(fullPath);
        }
      } catch {
        // Skip inaccessible dirs
      }
    }

    // Also check workspace for transcript files
    const workspaceDir = join(this.config.openclawDir, 'workspace');
    if (existsSync(workspaceDir)) {
      try {
        const files = readdirSync(workspaceDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          this.processFile(join(workspaceDir, file));
        }
      } catch {
        // Skip
      }
    }
  }

  /** Get all session directories to watch */
  private getSessionDirs(): string[] {
    const dirs: string[] = [];
    const agentsDir = join(this.config.openclawDir, 'agents');

    if (existsSync(agentsDir)) {
      try {
        for (const agent of readdirSync(agentsDir)) {
          const sessionsDir = join(agentsDir, agent, 'sessions');
          if (existsSync(sessionsDir)) {
            dirs.push(sessionsDir);
          }
        }
      } catch {
        // Skip
      }
    }

    // Add any explicitly configured dirs
    dirs.push(...this.config.agentDirs);

    return dirs;
  }

  /** Process new lines from a JSONL file */
  private processFile(filePath: string): void {
    try {
      const stat = statSync(filePath);
      const state = this.fileStates.get(filePath);
      const currentOffset = state?.offset ?? 0;

      // Skip if file hasn't grown
      if (stat.size <= currentOffset) return;

      // Skip files older than maxAge (based on mtime)
      if (Date.now() - stat.mtimeMs > this.config.maxAgeMs) return;

      // Read new content
      const content = readFileSync(filePath, 'utf-8');
      const newContent = content.slice(currentOffset);
      const lines = newContent.split('\n').filter(l => l.trim());

      const agentId = this.extractAgentId(filePath);
      const agentHash = hashAgent(agentId);

      for (const line of lines) {
        this.processLine(line, agentHash);
      }

      this.fileStates.set(filePath, { path: filePath, offset: stat.size });
    } catch {
      // Skip problematic files
    }
  }

  /** Process a single JSONL line */
  private processLine(line: string, agentHash: string): void {
    const calls = extractToolCalls(line);

    for (const call of calls) {
      // If this is a tool call (from assistant), store it pending by toolCall ID
      if (!call.result && !call.error && call.toolName) {
        // toolName here is the actual tool name (e.g., "exec", "read")
        // We need to also store the toolCall ID to match results
        // Extract IDs from the raw line
        const raw = JSON.parse(line);
        const entry = raw.message ?? raw;
        if (entry.role === 'assistant' && Array.isArray(entry.content)) {
          for (const block of entry.content) {
            if (block.type === 'toolCall' && block.id) {
              this.pendingCalls.set(block.id, {
                toolName: block.name,
                params: typeof block.arguments === 'object' ? block.arguments : {},
                timestamp: call.timestamp,
              });
            }
          }
        }
        continue;
      }

      // If this is a tool result, match with pending call by ID
      const callId = call.toolName; // For results, toolName holds the toolCallId
      const pending = this.pendingCalls.get(callId);
      
      if (pending) {
        captureToolCall(
          this.store,
          pending.toolName,
          pending.params,
          call.result,
          call.error ?? null,
          pending.timestamp && call.timestamp 
            ? Math.round(call.timestamp - pending.timestamp)
            : null,
        );
        this.pendingCalls.delete(callId);
        this.capturedCount++;
      }
    }

    // Expire old pending calls (>5 min)
    const now = Date.now();
    for (const [key, pending] of this.pendingCalls) {
      if (pending.timestamp && now - pending.timestamp > 5 * 60 * 1000) {
        this.pendingCalls.delete(key);
      }
    }
  }

  /** Extract agent ID from file path */
  private extractAgentId(filePath: string): string {
    // Path: ~/.openclaw/agents/{agentId}/sessions/{sessionId}.jsonl
    const parts = filePath.split('/');
    const agentsIdx = parts.indexOf('agents');
    if (agentsIdx >= 0 && agentsIdx + 1 < parts.length) {
      return parts[agentsIdx + 1]!;
    }
    return basename(filePath, '.jsonl');
  }
}
