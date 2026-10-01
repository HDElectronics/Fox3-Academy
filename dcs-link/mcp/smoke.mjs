// Smoke test for the built server over real stdio, the way an MCP client starts it:
//   npm run dcs-mcp:build && node dcs-link/mcp/smoke.mjs
// Lists the tools, then calls dcs_status, flight_state and search_notes. Works with or without DCS running.
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';

const server = fileURLToPath(new URL('./dist/fox3-dcs-mcp.mjs', import.meta.url));
const transport = new StdioClientTransport({ command: process.execPath, args: [server], stderr: 'inherit' });
const client = new Client({ name: 'fox3-smoke', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();
console.log('tools:', tools.map(t => t.name).join(', '));
await new Promise(r => setTimeout(r, 1500)); // let the server reach the bridge
for (const [name, args] of [['dcs_status', {}], ['flight_state', {}], ['search_notes', { query: 'Hornet bingo IFEI', limit: 1 }]]) {
  const res = await client.callTool({ name, arguments: args });
  console.log(`\n${name}:`, res.content[0].text.slice(0, 600));
}
await client.close();
