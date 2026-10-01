/**
 * Fox3 Academy DCS MCP server (stdio). An MCP client (Claude Desktop, Claude Code) starts this process; it
 * connects to the DCS link bridge (npm run dcs-link) on 127.0.0.1, runs the copilot monitor at 10 Hz and serves
 * read-only tools. stdout carries the protocol, so logs go to stderr. Build: npm run dcs-mcp:build. Docs: docs/mcp.md.
 */
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DcsLink } from '../../src/dcs/client';
import { CopilotMonitor } from '../../src/copilot/monitor';
import { NodeEventSource } from './nodeEventSource';
import { loadNotes } from './notes';
import { createDcsServer, SERVER_VERSION } from './tools';

// Built to dcs-link/mcp/dist/; the repository root is three levels up.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const notes = loadNotes(root);

const link = new DcsLink({ eventSource: url => new NodeEventSource(url) });
const monitor = new CopilotMonitor();
link.start();
const t0 = performance.now();
const timer = setInterval(() => monitor.update(link.snapshot(), (performance.now() - t0) / 1000), 100);

console.error(`fox3-dcs MCP server v${SERVER_VERSION}: ${notes.length} note sections, bridge ${link.snapshot().bridge}`);
serveStdio(() => createDcsServer({ snapshot: () => link.snapshot(), monitor, notes }));

const quit = () => { clearInterval(timer); link.stop(); process.exit(0); };
process.on('SIGINT', quit);
process.on('SIGTERM', quit);
process.stdin.on('end', quit);
