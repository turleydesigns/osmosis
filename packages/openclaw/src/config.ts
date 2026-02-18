import { homedir } from 'node:os';
import { join } from 'node:path';

export interface OsmosisConfig {
  /** Enable Osmosis integration (default: false) */
  enabled: boolean;
  /** Path to the SQLite database (default: ~/.osmosis/atoms.db) */
  dbPath: string;
  /** REST API port (default: 7432) */
  apiPort: number;
  /** Capture tool calls automatically (default: true when enabled) */
  captureToolCalls: boolean;
  /** Inject knowledge context at task start (default: true when enabled) */
  injectContext: boolean;
  /** Peer Osmosis instance URLs for sync */
  peers: string[];
  /** Sync interval in ms (default: 5 min) */
  syncInterval: number;
}

export const DEFAULT_CONFIG: OsmosisConfig = {
  enabled: false,
  dbPath: join(homedir(), '.osmosis', 'atoms.db'),
  apiPort: 7432,
  captureToolCalls: true,
  injectContext: true,
  peers: [],
  syncInterval: 5 * 60 * 1000,
};

export function resolveConfig(partial?: Partial<OsmosisConfig>): OsmosisConfig {
  return { ...DEFAULT_CONFIG, ...partial };
}
