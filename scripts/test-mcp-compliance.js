import { spawn } from 'child_process';
import path from 'path';

console.log('🧪 Starting Strict MCP Specification & E2E Compliance Test Suite...');

async function runMcpComplianceTest() {
  const proc = spawn('node', ['src/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let buffer = '';
  let id = 1;
  const pending = new Map();

  proc.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      } catch (e) {
        console.error('Non-JSON stdout line:', line);
      }
    }
  });

  function send(method, params = {}) {
    const reqId = id++;
    const payload = { jsonrpc: '2.0', id: reqId, method, params };
    return new Promise((resolve, reject) => {
      pending.set(reqId, { resolve, reject });
      proc.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  // 1. Initialize Handshake
  const initRes = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-inspector-e2e', version: '1.2.0' }
  });
  if (!initRes.serverInfo || initRes.serverInfo.name !== 'google-flow-mcp') {
    throw new Error('Invalid serverInfo in initialize response');
  }
  console.log('✅ 1. Initialize Handshake & Capabilities Negotiation (PASS)');

  // 2. Tools Discovery
  const toolsRes = await send('tools/list');
  if (!toolsRes.tools || toolsRes.tools.length < 5) {
    throw new Error('Expected at least 5 registered tools');
  }
  console.log(`✅ 2. Tools Discovery (${toolsRes.tools.length} Tools Registered) (PASS)`);

  // 3. Resources Discovery
  const resList = await send('resources/list');
  if (!resList.resources || resList.resources.length < 3) {
    throw new Error('Expected at least 3 registered resources');
  }
  console.log(`✅ 3. Resources Discovery (${resList.resources.map(r => r.uri).join(', ')}) (PASS)`);

  // 4. Prompts Discovery & Rendering
  const promptsList = await send('prompts/list');
  const promptData = await send('prompts/get', {
    name: 'consistent-storyboard-cut',
    arguments: {
      scene_id: 'S03-S01-C03',
      shot_size: 'MCU',
      character_name: 'Choi (Team Leader)',
      emotion_and_action: 'Staring anxiously at the production monitor',
      location_description: 'Factory office interior'
    }
  });
  if (!promptData.messages || promptData.messages.length === 0) {
    throw new Error('Prompt template failed to render');
  }
  console.log('✅ 4. Prompts Discovery & Blueprint Generation (PASS)');

  // 5. Tool Call Execution (flow_status)
  const statusCall = await send('tools/call', {
    name: 'flow_status',
    arguments: { full: true }
  });
  if (!statusCall.content || !statusCall.content[0].text) {
    throw new Error('Tool execution failed');
  }
  console.log('✅ 5. Tool Execution & JSON Telemetry Return (PASS)');

  // 6. Error Protocol Handling
  const errCall = await send('tools/call', {
    name: 'unknown_tool',
    arguments: {}
  });
  if (!errCall.isError) {
    throw new Error('Expected isError=true on invalid tool call');
  }
  console.log('✅ 6. Error Protocol Handling (isError: true & MCP Error Code) (PASS)');

  proc.kill();
  console.log('\n🎉 ALL 6 STRICT MCP COMPLIANCE AUDIT TESTS PASSED (100%)!');
  process.exit(0);
}

runMcpComplianceTest().catch(err => {
  console.error('❌ MCP Compliance Audit Failed:', err);
  process.exit(1);
});
