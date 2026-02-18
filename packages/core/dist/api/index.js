import { createServer as createHttpServer } from 'node:http';
function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
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
export function createServer(store, port = 3917) {
    const server = createHttpServer(async (req, res) => {
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
                }
                else if (body.type === 'negative') {
                    atom = store.createNegativeAtom(body);
                }
                else {
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
                const atom = store.getById(idMatch[1]);
                if (!atom)
                    return json(res, 404, { error: 'Not found' });
                return json(res, 200, atom);
            }
            // GET /atoms?type=&tool_name=
            if (method === 'GET' && path === '/atoms') {
                const type = url.searchParams.get('type');
                const toolName = url.searchParams.get('tool_name');
                if (toolName) {
                    return json(res, 200, store.queryByToolName(toolName));
                }
                if (type) {
                    return json(res, 200, store.queryByType(type));
                }
                return json(res, 200, store.getAll());
            }
            json(res, 404, { error: 'Not found' });
        }
        catch (err) {
            const status = err.name === 'ZodError' ? 400 : 500;
            json(res, status, { error: err.message ?? 'Internal error' });
        }
    });
    server.listen(port);
    return server;
}
//# sourceMappingURL=index.js.map