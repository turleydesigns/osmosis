export interface SyncConfig {
  /** URL of the Osmosis mesh server */
  meshUrl: string;
  /** Auto-sync interval in ms (default: 5 min) */
  syncIntervalMs: number;
  /** Enable periodic sync */
  autoSync: boolean;
  /** API key for mesh authentication */
  meshApiKey?: string;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  meshUrl: 'https://mesh.osmosis.dev',
  syncIntervalMs: 5 * 60 * 1000,
  autoSync: false,
};

export function resolveSyncConfig(partial?: Partial<SyncConfig>): SyncConfig {
  return { ...DEFAULT_SYNC_CONFIG, ...partial };
}
