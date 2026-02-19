import { createServer as createHttpServer, type Server } from 'node:http';
import { AtomStore } from '@osmosis-ai/core';
import type { SyncConfig } from './config.js';

/**
 * Create a local API server for querying the local atom store.
 * This is the "osmosis serve" server — local queries only, no peer sync routes.
 */
export function createSyncServer(
  store: AtomStore,
  port: number,
  _config: SyncConfig,
): Server {
  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    try {
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

        if (since) {
          atoms = atoms.filter(a => a.updated_at > since);
        }

        return json(200, atoms);
      }

      // GET /sync/status — kept for backward compat
      if (method === 'GET' && path === '/sync/status') {
        const allAtoms = store.getAll();
        return json(200, {
          atomCount: allAtoms.length,
          meshUrl: _config.meshUrl,
        });
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
