export interface SyncConfig {
  /** URLs of peer Osmosis instances */
  peers: string[];
  /** Auto-sync interval in ms (default: 5 min) */
  syncIntervalMs: number;
  /** Enable periodic sync */
  autoSync: boolean;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  peers: [],
  syncIntervalMs: 5 * 60 * 1000,
  autoSync: false,
};

export function resolveSyncConfig(partial?: Partial<SyncConfig>): SyncConfig {
  return { ...DEFAULT_SYNC_CONFIG, ...partial };
}
