/**
 * Production entrypoint for the Osmosis mesh server.
 * Reads config from environment variables and starts the server.
 */
import { startMeshServer } from './index.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const port = parseInt(process.env.MESH_PORT || '7433', 10);
const dbPath = process.env.MESH_DB_PATH || '/data/mesh.db';

// Ensure data directory exists
try {
  mkdirSync(dirname(dbPath), { recursive: true });
} catch {}

// startMeshServer already calls server.listen() internally
const handle = startMeshServer({ port, dbPath, allowAnonymous: true });

console.log(`🧠 Osmosis mesh server running on port ${port}`);
console.log(`   Database: ${dbPath}`);
console.log(`   Ready to accept contributions`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  handle.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  handle.stop();
  process.exit(0);
});
