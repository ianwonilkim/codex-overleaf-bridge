const assert = require('node:assert/strict');
const test = require('node:test');

const Mcp = require('../approved-bridge/mcp-server.cjs');

test('MCP advertises policy gates plus approved mutation tools with correct annotations', async () => {
  const initialized = await Mcp.dispatch('initialize', { protocolVersion: '2025-06-18' });
  assert.equal(initialized.protocolVersion, '2025-06-18');
  const listed = await Mcp.dispatch('tools/list', {});
  assert.deepEqual(listed.tools.map(tool => tool.name), [
    'overleaf_status',
    'overleaf_connect_project',
    'overleaf_set_project_rules',
    'overleaf_verify_project_policy',
    'overleaf_preview_diff',
    'overleaf_apply_approved',
    'overleaf_compile',
    'overleaf_undo'
  ]);
  assert.equal(listed.tools.find(tool => tool.name === 'overleaf_status').annotations.readOnlyHint, true);
  assert.equal(listed.tools.find(tool => tool.name === 'overleaf_apply_approved').annotations.readOnlyHint, false);
  assert.equal(listed.tools.find(tool => tool.name === 'overleaf_apply_approved').annotations.destructiveHint, true);
  assert.equal(listed.tools.find(tool => tool.name === 'overleaf_connect_project').annotations.readOnlyHint, false);
  assert.equal(listed.tools.find(tool => tool.name === 'overleaf_connect_project').annotations.destructiveHint, false);
  assert.equal(listed.tools.find(tool => tool.name === 'overleaf_set_project_rules').annotations.destructiveHint, false);
  assert.equal(listed.tools.find(tool => tool.name === 'overleaf_verify_project_policy').annotations.readOnlyHint, true);
  const registration = listed.tools.find(tool => tool.name === 'overleaf_connect_project');
  assert.equal(registration.inputSchema.properties.confirm_connection.const, true);
  assert.deepEqual(registration.inputSchema.properties.protected_path_patterns.default, []);
  assert.deepEqual(registration.inputSchema.properties.allowed_preamble_directives.default, []);
  assert.equal(registration.inputSchema.required.includes('policy_source_sha256'), false);
  assert.equal(registration.inputSchema.required.includes('paper_rule_profile'), false);
  assert.equal(registration.inputSchema.properties.paper_rule_profile.properties.rules.minItems, 1);
  assert.match(
    registration.inputSchema.properties.external_module_approval_text.description,
    /확인, Overleaf 외부 모듈 정책을 등록해줘/
  );
  const paperRules = listed.tools.find(tool => tool.name === 'overleaf_set_project_rules');
  assert.deepEqual(paperRules.inputSchema.properties.operation.enum, ['set', 'clear']);
  assert.equal(paperRules.inputSchema.properties.confirm_update.const, true);
});

test('MCP refuses a non-loopback bridge URL', () => {
  const previous = process.env.OVERLEAF_BRIDGE_URL;
  process.env.OVERLEAF_BRIDGE_URL = 'https://example.com';
  try {
    assert.throws(() => Mcp.resolveBridgeUrl(), error => error.code === 'unsafe_bridge_url');
  } finally {
    if (previous === undefined) delete process.env.OVERLEAF_BRIDGE_URL;
    else process.env.OVERLEAF_BRIDGE_URL = previous;
  }
});
