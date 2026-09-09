const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const Daemon = require('../approved-bridge/daemon.cjs');
const Store = require('../native-host/src/approvedBridgeStore');

test('daemon accepts explicit clearing of optional project slots', () => {
  assert.deepEqual(
    Daemon.parseArgs(['configure', '--clear-test-project', '--port', '17382']),
    {
      command: 'configure',
      options: {
        testProject: '',
        port: 17382
      }
    }
  );
});

test('daemon is loopback-token protected and can queue a test-only approved proposal', async t => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-overleaf-daemon-'));
  const projectId = '1234567890abcdef12345678';
  Store.initializeState({ stateDir, config: { testProjectId: projectId } });
  const tokenPath = Daemon.ensureToken(stateDir);
  const token = fs.readFileSync(tokenPath, 'utf8').trim();
  const server = Daemon.createServer({ stateDir, token });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const unauthorized = await fetch(`${base}/health`);
  assert.equal(unauthorized.status, 401);

  const status = await fetch(`${base}/health`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(status.status, 200);
  const statusPolicy = (await status.json()).result.policy;
  assert.equal(statusPolicy.writeAccessMode, 'automatic_after_verified_project_policy');
  assert.equal('productionEnabled' in statusPolicy, false);

  const preview = await rpc(base, token, 'preview', {
    scope: 'test',
    projectId,
    path: 'Template.tex',
    beforeContent: 'before\n',
    afterContent: 'after\n'
  });
  assert.ok(preview.approvalId);
  const applied = await rpc(base, token, 'apply', {
    approvalId: preview.approvalId,
    approvalText: Store.TEST_APPROVAL_PHRASE,
    waitMs: 0
  });
  assert.equal(applied.queued.action, 'apply');

  const claimed = Store.claimNextJob(stateDir, { projectId });
  assert.equal(claimed.id, applied.queued.id);
});

async function rpc(base, token, action, input) {
  const response = await fetch(`${base}/rpc`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, input })
  });
  const payload = await response.json();
  assert.equal(payload.ok, true, JSON.stringify(payload));
  return payload.result;
}
