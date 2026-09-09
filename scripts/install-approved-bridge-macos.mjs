#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installNativeHost } from './install-native-host.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(scriptPath), '..');
const MARKER = '.approved-overleaf-bridge-install.json';
const LABEL = 'com.codex.overleaf.approved-bridge';

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (process.platform !== 'darwin' && !options.allowNonDarwin) {
    throw new Error('This installer must run on the Mac where Google Chrome runs.');
  }
  assertNodeVersion();
  const testProjectId = options.testProject
    ? validateProjectId(options.testProject, 'test')
    : '';
  const userHome = os.homedir();
  const installBase = path.join(userHome, '.codex-overleaf');
  const extensionRoot = path.join(installBase, 'approved-extension-v2.3.5');
  const companionRoot = path.join(installBase, 'approved-bridge-runtime-v1');
  const stateDir = path.join(installBase, 'approved-bridge-v1');
  const logsDir = path.join(stateDir, 'logs');
  const launchAgentPath = path.join(userHome, 'Library', 'LaunchAgents', `${LABEL}.plist`);
  const bundlePath = path.join(packageRoot, 'extension', 'src', 'content', 'generated', 'content.bundle.js');
  if (!fs.existsSync(bundlePath)) {
    throw new Error('Generated content bundle is missing. This distribution is incomplete; verify its checksum and obtain a fresh copy.');
  }
  fs.mkdirSync(installBase, { recursive: true, mode: 0o700 });
  fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });

  installMarkedTree({
    sourceRoot: path.join(packageRoot, 'extension'),
    targetRoot: extensionRoot,
    kind: 'extension',
    version: '2.3.5-approved-bridge-v6'
  });
  installCompanionRuntime(companionRoot);

  const daemonPath = path.join(companionRoot, 'approved-bridge', 'daemon.cjs');
  const mcpServerPath = path.join(companionRoot, 'approved-bridge', 'mcp-server.cjs');
  const initializeArgs = [
    daemonPath,
    'init',
    '--state-dir', stateDir
  ];
  if (testProjectId) initializeArgs.push('--test-project', testProjectId);
  const initialized = run(process.execPath, initializeArgs);
  if (initialized.status !== 0) throw new Error(initialized.stderr || initialized.stdout || 'Bridge initialization failed.');
  const initializedConfig = parseJsonOutput(initialized.stdout)?.config || {};

  const native = installNativeHost({
    packageRoot,
    platform: 'darwin',
    browser: 'chrome',
    env: process.env
  });

  const plist = buildLaunchAgentPlist({
    label: LABEL,
    nodePath: process.execPath,
    daemonPath,
    stateDir,
    companionRoot,
    stdoutPath: path.join(logsDir, 'daemon.stdout.log'),
    stderrPath: path.join(logsDir, 'daemon.stderr.log')
  });
  fs.mkdirSync(path.dirname(launchAgentPath), { recursive: true });
  fs.writeFileSync(launchAgentPath, plist, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(launchAgentPath, 0o600);

  if (!options.noLaunch) {
    const domain = `gui/${process.getuid()}`;
    run('launchctl', ['bootout', `${domain}/${LABEL}`]);
    const bootstrap = run('launchctl', ['bootstrap', domain, launchAgentPath]);
    if (bootstrap.status !== 0) throw new Error(bootstrap.stderr || bootstrap.stdout || 'launchctl bootstrap failed.');
    const kickstart = run('launchctl', ['kickstart', '-k', `${domain}/${LABEL}`]);
    if (kickstart.status !== 0) throw new Error(kickstart.stderr || kickstart.stdout || 'launchctl kickstart failed.');
  }

  const codexMcp = configureCodexMcp({
    skip: options.skipCodexMcp || process.platform !== 'darwin',
    nodePath: process.execPath,
    mcpServerPath,
    tokenPath: path.join(stateDir, 'token')
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    upstream: {
      version: '2.3.5',
      commit: '4cbaff3b99a05625c4cca48ea4fabd4bcffc5a7d'
    },
    approvedBridgeRevision: 'v6',
    testProjectId: initializedConfig.testProjectId || '',
    writeAccessMode: 'automatic_after_verified_project_policy',
    extension: {
      loadUnpackedPath: extensionRoot,
      expectedId: native.extensionId
    },
    nativeHost: native,
    companion: {
      root: companionRoot,
      stateDir,
      tokenPath: path.join(stateDir, 'token'),
      mcpServerPath,
      nodePath: process.execPath,
      bridgeUrl: 'http://127.0.0.1:17381',
      launchAgentPath,
      launched: !options.noLaunch
    },
    codexMcp,
    next: 'Load or reload extension.loadUnpackedPath in chrome://extensions, restart Codex, open the target Overleaf project, then ask Codex to connect this project.'
  }, null, 2)}\n`);
}

function installCompanionRuntime(targetRoot) {
  const staging = `${targetRoot}.staging-${process.pid}-${Date.now()}`;
  assertReplaceableTarget(targetRoot, 'companion');
  fs.mkdirSync(path.join(staging, 'approved-bridge'), { recursive: true });
  fs.mkdirSync(path.join(staging, 'native-host', 'src'), { recursive: true });
  fs.mkdirSync(path.join(staging, 'extension', 'src', 'shared'), { recursive: true });
  fs.copyFileSync(path.join(packageRoot, 'approved-bridge', 'daemon.cjs'), path.join(staging, 'approved-bridge', 'daemon.cjs'));
  fs.copyFileSync(path.join(packageRoot, 'approved-bridge', 'mcp-server.cjs'), path.join(staging, 'approved-bridge', 'mcp-server.cjs'));
  fs.copyFileSync(path.join(packageRoot, 'native-host', 'src', 'approvedBridgeStore.js'), path.join(staging, 'native-host', 'src', 'approvedBridgeStore.js'));
  fs.copyFileSync(path.join(packageRoot, 'extension', 'src', 'shared', 'approvedBridgePolicy.js'), path.join(staging, 'extension', 'src', 'shared', 'approvedBridgePolicy.js'));
  fs.chmodSync(path.join(staging, 'approved-bridge', 'daemon.cjs'), 0o700);
  fs.chmodSync(path.join(staging, 'approved-bridge', 'mcp-server.cjs'), 0o700);
  writeMarker(staging, 'companion', '7');
  replaceTree(targetRoot, staging);
}

function configureCodexMcp({ skip, nodePath, mcpServerPath, tokenPath }) {
  if (skip) return { configured: false, action: 'skipped' };
  const existing = run('codex', ['mcp', 'get', 'overleaf-approved']);
  if (existing.status === 0) {
    return { configured: true, action: 'kept_existing', serverName: 'overleaf-approved' };
  }
  if (existing.error?.code === 'ENOENT') {
    return { configured: false, action: 'codex_cli_not_found' };
  }
  const added = run('codex', [
    'mcp', 'add', 'overleaf-approved',
    '--env', 'OVERLEAF_BRIDGE_URL=http://127.0.0.1:17381',
    '--env', `OVERLEAF_BRIDGE_TOKEN_FILE=${tokenPath}`,
    '--', nodePath, mcpServerPath
  ]);
  if (added.status !== 0) {
    throw new Error(added.stderr || added.stdout || 'Codex MCP registration failed.');
  }
  return { configured: true, action: 'added', serverName: 'overleaf-approved' };
}

function installMarkedTree({ sourceRoot, targetRoot, kind, version }) {
  const staging = `${targetRoot}.staging-${process.pid}-${Date.now()}`;
  assertReplaceableTarget(targetRoot, kind);
  fs.cpSync(sourceRoot, staging, { recursive: true, dereference: false, errorOnExist: true });
  writeMarker(staging, kind, version);
  replaceTree(targetRoot, staging);
}

function replaceTree(targetRoot, staging) {
  const backup = `${targetRoot}.rollback-${process.pid}-${Date.now()}`;
  let moved = false;
  try {
    if (fs.existsSync(targetRoot)) {
      fs.renameSync(targetRoot, backup);
      moved = true;
    }
    fs.renameSync(staging, targetRoot);
    if (moved) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(targetRoot) && moved && fs.existsSync(backup)) fs.renameSync(backup, targetRoot);
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function assertReplaceableTarget(targetRoot, expectedKind) {
  if (!fs.existsSync(targetRoot)) return;
  const marker = readJson(path.join(targetRoot, MARKER));
  if (marker?.managedBy !== LABEL || marker?.kind !== expectedKind) {
    throw new Error(`Refusing to replace unmarked ${expectedKind} directory: ${targetRoot}`);
  }
}

function writeMarker(root, kind, version) {
  fs.writeFileSync(path.join(root, MARKER), `${JSON.stringify({
    managedBy: LABEL,
    kind,
    version,
    upstreamCommit: '4cbaff3b99a05625c4cca48ea4fabd4bcffc5a7d',
    installedAt: new Date().toISOString()
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function buildLaunchAgentPlist(input) {
  const esc = xmlEscape;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${esc(input.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(input.nodePath)}</string>
    <string>${esc(input.daemonPath)}</string>
    <string>serve</string>
    <string>--state-dir</string>
    <string>${esc(input.stateDir)}</string>
  </array>
  <key>WorkingDirectory</key><string>${esc(input.companionRoot)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${esc(input.stdoutPath)}</string>
  <key>StandardErrorPath</key><string>${esc(input.stderrPath)}</string>
</dict>
</plist>
`;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--test-project') options.testProject = readValue(argv, ++index, arg);
    else if (arg === '--no-launch') options.noLaunch = true;
    else if (arg === '--skip-codex-mcp') options.skipCodexMcp = true;
    else if (arg === '--allow-non-darwin') options.allowNonDarwin = true;
    else if (arg === '--help') {
      process.stdout.write([
        'Usage:',
        '  node scripts/install-approved-bridge-macos.mjs [--no-launch] [--skip-codex-mcp]',
        '  node scripts/install-approved-bridge-macos.mjs --test-project PROJECT_ID [--no-launch] [--skip-codex-mcp]',
        '',
        'Production projects are connected from Codex after installation; no production-enable flag is used.',
        ''
      ].join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function validateProjectId(value, scope) {
  const text = String(value || '').trim();
  if (!/^[a-f0-9]{24}$/.test(text)) {
    throw new Error(`Overleaf ${scope} project ID must be the 24-character lowercase hex ID from /project/<id>, not a link-sharing token.`);
  }
  return text;
}

function parseJsonOutput(value) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return null;
  }
}

function assertNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isInteger(major) || major < 20) throw new Error('Node.js 20 or later is required.');
}

function readValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
  return value;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function run(command, args) {
  return spawnSync(command, args, { encoding: 'utf8' });
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exit(1);
}
