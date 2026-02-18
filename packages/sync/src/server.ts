import { createServer as createHttpServer, type Server } from 'node:http';
import { AtomStore, createServer as createCoreServer } from '@osmosis/core';
import type { SyncConfig } from './config.js';
import { syncWithPeer } from './sync.js';
import { getAllPeers } from './meta.js';

/**
 * Create an extended API server that includes core endpoints + sync endpoints.
 * Wraps the core server and adds:
 *   GET  /sync/status  — sync status info
 *   POST /sync/trigger — manually trigger sync with all configured peers
 *
 * The core server's GET /atoms is enhanced with ?since= support via the
 * updated core API (see core/api changes).
 */
export function createSyncServer(
  store: AtomStore,
  port: number,
  config: SyncConfig,
): Server {
  // Start the core server on port — we'll just use it directly
  // But we need to add routes. Since core server is a plain http server,
  // we'll create our own that delegates to core for non-sync routes.

  const coreServer = createCoreServer(store, 0); // don't listen on real port
  // Actually, core createServer already listens. Let's close it and build our own.
  coreServer.close();

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    try {
      // Sync-specific routes
      if (method === 'GET' && path === '/sync/status') {
        const peers = getAllPeers(store);
        const allAtoms = store.getAll();
        return json(200, {
          atomCount: allAtoms.length,
          peerCount: config.peers.length,
          peers,
          configuredPeers: config.peers,
        });
      }

      if (method === 'POST' && path === '/sync/trigger') {
        const results = [];
        for (const peer of config.peers) {
          try {
            const r = await syncWithPeer(store, peer);
            results.push({ peer, ...r });
          } catch (err: any) {
            results.push({ peer, error: err.message });
          }
        }
        return json(200, { results });
      }

      // Core routes — re-implement inline to avoid double-server overhead
      const readBody = (): Promise<string> => new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
        req.on('error', reject);
      });

      // POST /atoms
      if (method === 'POST' && path === '/atoms') {
        const body = JSON.parse(await readBody());
        let atom;
        if (body.type === 'tool') {
          atom = store.createToolAtom(body);
        } else if (body.type === 'negative') {
          atom = store.createNegativeAtom(body);
        } else {
          atom = store.createAtom(body);
        }
        return json(201, atom);
      }

      // GET /atoms/search?q=...
      if (method === 'GET' && path === '/atoms/search') {
        const q = url.searchParams.get('q') ?? '';
        return json(200, store.search(q));
      }

      // GET /atoms/:id
      const idMatch = path.match(/^\/atoms\/([^/]+)$/);
      if (method === 'GET' && idMatch) {
        const atom = store.getById(idMatch[1]!);
        if (!atom) return json(404, { error: 'Not found' });
        return json(200, atom);
      }

      // GET /atoms?type=&tool_name=&since=
      if (method === 'GET' && path === '/atoms') {
        const type = url.searchParams.get('type');
        const toolName = url.searchParams.get('tool_name');
        const since = url.searchParams.get('since');

        let atoms;
        if (toolName) {
          atoms = store.queryByToolName(toolName);
        } else if (type) {
          atoms = store.queryByType(type as any);
        } else {
          atoms = store.getAll();
        }

        // Apply since filter
        if (since) {
          atoms = atoms.filter(a => a.updated_at > since);
        }

        return json(200, atoms);
      }

      json(404, { error: 'Not found' });
    } catch (err: any) {
      const status = err.name === 'ZodError' ? 400 : 500;
      json(status, { error: err.message ?? 'Internal error' });
    }
  });

  server.listen(port);
  return server;
}
