export interface MeshServerConfig {
  /** Port to listen on (default: 7433) */
  port: number;
  /** Path to SQLite database for mesh storage (default: ':memory:') */
  dbPath: string;
  /** Allow anonymous contributions (default: true for reads, false for writes) */
  allowAnonymous: boolean;
  /** API keys that can contribute (write). Empty = no auth required. */
  writeKeys: string[];
  /** API keys that can read. Empty = public reads. */
  readKeys: string[];
  /** Rate limit: max contributions per key per hour */
  rateLimitPerHour: number;
}

export const DEFAULT_MESH_CONFIG: MeshServerConfig = {
  port: 7433,
  dbPath: ':memory:',
  allowAnonymous: true,
  writeKeys: [],
  readKeys: [],
  rateLimitPerHour: 1000,
};

export function resolveMeshConfig(partial?: Partial<MeshServerConfig>): MeshServerConfig {
  return { ...DEFAULT_MESH_CONFIG, ...partial };
}
