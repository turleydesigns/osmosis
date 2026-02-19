import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { AtomStore } from '@osmosis-ai/core';
import type { KnowledgeAtom } from '@osmosis-ai/core';
import type { MeshServerConfig } from './config.js';

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/** Extract API key from Authorization header or query param */
function extractKey(req: IncomingMessage, url: URL): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return url.searchParams.get('key');
}

/** Simple in-memory rate limiter */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

/**
 * Create the centralized mesh HTTP server.
 *
 * Routes:
 *   POST /mesh/contribute         — submit atoms to the mesh
 *   GET  /mesh/atoms?since=<ISO>  — get atoms since timestamp
 *   GET  /mesh/query?q=&type=&limit= — query mesh for relevant knowledge
 *   GET  /mesh/stats              — mesh statistics
 */
export function createMeshServer(store: AtomStore, config: MeshServerConfig): Server {
  const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    try {
      const apiKey = extractKey(req, url);

      // Auth check for writes
      if (method === 'POST' && config.writeKeys.length > 0) {
        if (!apiKey || !config.writeKeys.includes(apiKey)) {
          return json(res, 401, { error: 'Invalid or missing API key. Pass via Authorization: Bearer <key>' });
        }
      }

      // Auth check for reads (if readKeys configured)
      if (method === 'GET' && config.readKeys.length > 0 && path !== '/mesh/stats') {
        if (!apiKey || !config.readKeys.includes(apiKey)) {
          return json(res, 401, { error: 'Invalid or missing API key' });
        }
      }

      // Rate limiting for writes
      if (method === 'POST' && apiKey) {
        if (!checkRateLimit(apiKey, config.rateLimitPerHour)) {
          return json(res, 429, { error: 'Rate limit exceeded. Try again later.' });
        }
      }

      // POST /mesh/contribute — accept atoms from clients
      if (method === 'POST' && path === '/mesh/contribute') {
        const body = JSON.parse(await readBody(req));
        const atoms: any[] = Array.isArray(body) ? body : [body];
        const results: Array<{ id: string; status: 'created' | 'deduped' }> = [];

        for (const atomData of atoms) {
          // Strip client-side auto fields; mesh generates its own
          const { id, created_at, updated_at, ...data } = atomData;
          // Force quarantine trust tier on mesh
          data.trust_tier = 'quarantine';

          let result: KnowledgeAtom;
          if (data.type === 'tool') {
            result = store.createToolAtom(data);
          } else if (data.type === 'negative') {
            result = store.createNegativeAtom(data);
          } else {
            result = store.createAtom(data);
          }

          // Detect dedup: if evidence_count > 1, it was merged
          const ec = (result as any).evidence_count;
          results.push({
            id: result.id,
            status: ec && ec > 1 ? 'deduped' : 'created',
          });
        }

        return json(res, 200, { accepted: results.length, results });
      }

      // GET /mesh/atoms?since=<ISO>
      if (method === 'GET' && path === '/mesh/atoms') {
        const since = url.searchParams.get('since');
        let atoms = store.getAll();
        if (since) {
          atoms = atoms.filter(a => a.updated_at > since);
        }
        return json(res, 200, atoms);
      }

      // GET /mesh/query?q=<search>&type=<type>&limit=<n>
      if (method === 'GET' && path === '/mesh/query') {
        const q = url.searchParams.get('q') ?? '';
        const type = url.searchParams.get('type');
        const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);

        let atoms: KnowledgeAtom[];
        if (q) {
          atoms = store.search(q);
        } else if (type) {
          atoms = store.queryByType(type as any);
        } else {
          atoms = store.getAll();
        }

        if (type && q) {
          atoms = atoms.filter(a => a.type === type);
        }

        atoms = atoms.slice(0, limit);
        return json(res, 200, atoms);
      }

      // GET /mesh/stats
      if (method === 'GET' && path === '/mesh/stats') {
        const all = store.getAll();
        const contributors = new Set(all.map(a => a.source_agent_hash));
        const topAtoms = [...all]
          .sort((a, b) => b.fitness_score - a.fitness_score)
          .slice(0, 10);

        return json(res, 200, {
          totalAtoms: all.length,
          contributors: contributors.size,
          topAtoms: topAtoms.map(a => ({
            id: a.id,
            type: a.type,
            observation: a.observation.slice(0, 120),
            fitness_score: a.fitness_score,
          })),
        });
      }

      json(res, 404, { error: 'Not found' });
    } catch (err: any) {
      const status = err.name === 'ZodError' ? 400 : 500;
      json(res, status, { error: err.message ?? 'Internal error' });
    }
  });

  server.listen(config.port);
  return server;
}
