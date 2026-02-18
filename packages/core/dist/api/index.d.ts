import { type Server } from 'node:http';
import { AtomStore } from '../store/index.js';
/**
 * Create an HTTP server for the AtomStore.
 *
 * Routes:
 *   POST   /atoms              — create atom (validates, dedup, insert)
 *   GET    /atoms               — list/filter atoms (?type=, ?tool_name=)
 *   GET    /atoms/search?q=     — text search
 *   GET    /atoms/:id           — get single atom
 */
export declare function createServer(store: AtomStore, port?: number): Server;
