const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const packageRoot = path.resolve(__dirname, '..');
const installer = path.join(packageRoot, 'scripts', 'install-approved-bridge-macos.mjs');

test('installer is project-agnostic and has no production enable switch', t => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-overleaf-installer-simple-'));
  t.after(() => fs.rmSync(fakeHome, { recursive: true, force: true }));

  const result = runInstaller(fakeHome, [
    '--allow-non-darwin',
    '--no-launch'
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.approvedBridgeRevision, 'v6');
  assert.equal(output.testProjectId, '');
  assert.equal(output.writeAccessMode, 'automatic_after_verified_project_policy');
  assert.equal('productionProjectId' in output, false);
  assert.equal('productionEnabled' in output, false);

  const config = JSON.parse(fs.readFileSync(
    path.join(fakeHome, '.codex-overleaf', 'approved-bridge-v1', 'config.json'),
    'utf8'
  ));
  assert.equal(config.testProjectId, '');
  assert.equal('productionProjectId' in config, false);
  assert.equal('productionEnabled' in config, false);
});

test('installer retains the optional isolated test-project path', t => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-overleaf-installer-test-'));
  t.after(() => fs.rmSync(fakeHome, { recursive: true, force: true }));
  const testProjectId = '1234567890abcdef12345678';

  const result = runInstaller(fakeHome, [
    '--allow-non-darwin',
    '--no-launch',
    '--test-project', testProjectId
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.testProjectId, testProjectId);
  assert.equal(output.writeAccessMode, 'automatic_after_verified_project_policy');
});

test('project-agnostic reinstall preserves an optional test slot', t => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-overleaf-installer-reinstall-'));
  t.after(() => fs.rmSync(fakeHome, { recursive: true, force: true }));
  const projectId = '1234567890abcdef12345678';

  const testInstall = runInstaller(fakeHome, [
    '--allow-non-darwin',
    '--no-launch',
    '--test-project', projectId
  ]);
  assert.equal(testInstall.status, 0, testInstall.stderr || testInstall.stdout);

  const reinstall = runInstaller(fakeHome, [
    '--allow-non-darwin',
    '--no-launch'
  ]);
  assert.equal(reinstall.status, 0, reinstall.stderr || reinstall.stdout);
  const output = JSON.parse(reinstall.stdout);
  assert.equal(output.testProjectId, projectId);
});

test('upgrade install preserves project policies, receipts, and policy history', t => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-overleaf-installer-state-'));
  t.after(() => fs.rmSync(fakeHome, { recursive: true, force: true }));
  const first = runInstaller(fakeHome, [
    '--allow-non-darwin',
    '--no-launch'
  ]);
  assert.equal(first.status, 0, first.stderr || first.stdout);

  const stateDir = path.join(fakeHome, '.codex-overleaf', 'approved-bridge-v1');
  const sentinels = [
    path.join(stateDir, 'policies', 'sentinel.json'),
    path.join(stateDir, 'policy-history', 'sentinel.json'),
    path.join(stateDir, 'receipts', 'sentinel.json')
  ];
  for (const file of sentinels) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"preserve":true}\n', 'utf8');
  }

  const upgrade = runInstaller(fakeHome, [
    '--allow-non-darwin',
    '--no-launch'
  ]);
  assert.equal(upgrade.status, 0, upgrade.stderr || upgrade.stdout);
  for (const file of sentinels) {
    assert.equal(fs.readFileSync(file, 'utf8'), '{"preserve":true}\n');
  }
});

test('removed production configuration flags are rejected instead of creating stale state', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-overleaf-installer-collision-'));
  try {
    const projectId = '1234567890abcdef12345678';
    const legacy = runInstaller(fakeHome, [
      '--allow-non-darwin',
      '--no-launch',
      '--production-project', projectId
    ]);
    assert.notEqual(legacy.status, 0);
    assert.match(legacy.stderr, /Unknown option: --production-project/);
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

function runInstaller(fakeHome, args) {
  return spawnSync(process.execPath, [installer, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome
    }
  });
}
