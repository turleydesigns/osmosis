import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { AtomStore } from '../store/index.js';
import { validateCreateAtom, validateCreateToolAtom, validateCreateNegativeAtom } from '../validation/index.js';

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
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
 * Create an HTTP server for the AtomStore.
 *
 * Routes:
 *   POST   /atoms              — create atom (validates, dedup, insert)
 *   GET    /atoms               — list/filter atoms (?type=, ?tool_name=)
 *   GET    /atoms/search?q=     — text search
 *   GET    /atoms/:id           — get single atom
 */
export function createServer(store: AtomStore, port: number = 3917): Server {
  const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    try {
      // POST /atoms
      if (method === 'POST' && path === '/atoms') {
        const body = JSON.parse(await readBody(req));
        let atom;
        if (body.type === 'tool') {
          atom = store.createToolAtom(body);
        } else if (body.type === 'negative') {
          atom = store.createNegativeAtom(body);
        } else {
          atom = store.createAtom(body);
        }
        return json(res, 201, atom);
      }

      // GET /atoms/search?q=...
      if (method === 'GET' && path === '/atoms/search') {
        const q = url.searchParams.get('q') ?? '';
        return json(res, 200, store.search(q));
      }

      // GET /atoms/:id
      const idMatch = path.match(/^\/atoms\/([^/]+)$/);
      if (method === 'GET' && idMatch) {
        const atom = store.getById(idMatch[1]!);
        if (!atom) return json(res, 404, { error: 'Not found' });
        return json(res, 200, atom);
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

        return json(res, 200, atoms);
      }

      json(res, 404, { error: 'Not found' });
    } catch (err: any) {
      const status = err.name === 'ZodError' ? 400 : 500;
      json(res, status, { error: err.message ?? 'Internal error' });
    }
  });

  server.listen(port);
  return server;
}
