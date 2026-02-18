export interface MeshServerConfig {
  /** Port to listen on (default: 7433) */
  port: number;
  /** Path to SQLite database for mesh storage (default: ':memory:') */
  dbPath: string;
  /** Allow anonymous contributions (default: true) */
  allowAnonymous: boolean;
}

export const DEFAULT_MESH_CONFIG: MeshServerConfig = {
  port: 7433,
  dbPath: ':memory:',
  allowAnonymous: true,
};

export function resolveMeshConfig(partial?: Partial<MeshServerConfig>): MeshServerConfig {
  return { ...DEFAULT_MESH_CONFIG, ...partial };
}
