#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const transferDir = path.join(packageRoot, 'dist', 'approved-bridge-transfer-20260909-r7');
const outputDir = path.join(packageRoot, 'dist', 'codex-overleaf-bridge-kit-20260909-r7');
const markerName = '.codex-overleaf-bridge-kit-output';
const kitName = 'codex-overleaf-bridge-kit-20260909-r7';
const zipName = `${kitName}.zip`;
const innerArchiveName = 'overleaf-approved-bridge-installer-20260909-r7.tar.gz';

function main() {
  run(process.execPath, [path.join(packageRoot, 'scripts', 'build-approved-transfer.mjs')]);
  verifyInnerArchive();
  prepareOutput();

  const stagingParent = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-overleaf-bridge-kit-'));
  const kitRoot = path.join(stagingParent, kitName);
  try {
    fs.mkdirSync(path.join(kitRoot, 'installer'), { recursive: true });
    copy('lab-release/README_FIRST_KO.md', 'README_FIRST_KO.md');
    copy('lab-release/SHARING_GUIDE_KO.md', 'SHARING_GUIDE_KO.md');
    copy('lab-release/install.command', 'install.command');
    fs.chmodSync(path.join(kitRoot, 'install.command'), 0o755);
    copy('APPROVED_BRIDGE_SETUP_KO.md', 'APPROVED_BRIDGE_SETUP_KO.md');
    copy('APPROVED_BRIDGE_CONTRACT_KO.md', 'APPROVED_BRIDGE_CONTRACT_KO.md');
    fs.mkdirSync(path.join(kitRoot, 'approved-bridge'), { recursive: true });
    copy('approved-bridge/PROJECT_POLICY_TEMPLATE_KO.md', 'approved-bridge/PROJECT_POLICY_TEMPLATE_KO.md');
    copy('approved-bridge/codex-config.example.toml', 'approved-bridge/codex-config.example.toml');
    copyFromTransfer(innerArchiveName, `installer/${innerArchiveName}`);
    copyFromTransfer('SHA256SUMS', 'installer/SHA256SUMS');
    copyFromTransfer('MANIFEST.json', 'installer/MANIFEST.json');

    const innerManifest = JSON.parse(fs.readFileSync(path.join(transferDir, 'MANIFEST.json'), 'utf8'));
    const kitManifest = {
      schemaVersion: 1,
      kit: kitName,
      approvedBridgeRevision: 'v5',
      upstreamVersion: '2.3.5',
      writeAccessMode: 'automatic_after_verified_project_policy',
      supportedTopologies: ['same-mac', 'ssh-remote'],
      innerArchive: {
        name: innerArchiveName,
        sha256: innerManifest.archiveSha256,
        bytes: innerManifest.archiveBytes
      },
      privacy: {
        includesFilledProjectPolicies: false,
        includesInternalVerificationRecords: false,
        includesTokensOrCookies: false
      },
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(kitRoot, 'KIT_MANIFEST.json'), `${JSON.stringify(kitManifest, null, 2)}\n`, 'utf8');

    const payloadFiles = listFiles(kitRoot).filter(relative => relative !== 'FILES_SHA256SUMS');
    const checksums = payloadFiles.map(relative => `${sha256File(path.join(kitRoot, relative))}  ${relative}`).join('\n');
    fs.writeFileSync(path.join(kitRoot, 'FILES_SHA256SUMS'), `${checksums}\n`, 'utf8');

    const zipPath = path.join(outputDir, zipName);
    createZip(stagingParent, kitName, zipPath);
    const zipSha256 = sha256File(zipPath);
    fs.writeFileSync(path.join(outputDir, `${zipName}.sha256`), `${zipSha256}  ${zipName}\n`, 'utf8');
    fs.writeFileSync(path.join(outputDir, 'RELEASE_MANIFEST.json'), `${JSON.stringify({
      schemaVersion: 1,
      artifact: zipName,
      sha256: zipSha256,
      bytes: fs.statSync(zipPath).size,
      kit: kitManifest,
      payloadFileCount: listFiles(kitRoot).length
    }, null, 2)}\n`, 'utf8');

    process.stdout.write(`${JSON.stringify({
      ok: true,
      outputDir,
      zipPath,
      zipSha256,
      zipBytes: fs.statSync(zipPath).size,
      payloadFileCount: listFiles(kitRoot).length
    }, null, 2)}\n`);
  } finally {
    fs.rmSync(stagingParent, { recursive: true, force: true });
  }

  function copy(sourceRelative, targetRelative) {
    fs.copyFileSync(path.join(packageRoot, sourceRelative), path.join(kitRoot, targetRelative));
  }

  function copyFromTransfer(sourceRelative, targetRelative) {
    fs.copyFileSync(path.join(transferDir, sourceRelative), path.join(kitRoot, targetRelative));
  }
}

function verifyInnerArchive() {
  const manifestPath = path.join(transferDir, 'MANIFEST.json');
  const archivePath = path.join(transferDir, innerArchiveName);
  if (!fs.existsSync(manifestPath) || !fs.existsSync(archivePath)) {
    throw new Error('Approved bridge transfer artifact is missing.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const actual = sha256File(archivePath);
  if (manifest.archiveSha256 !== actual) {
    throw new Error(`Inner archive checksum mismatch: expected ${manifest.archiveSha256}, got ${actual}`);
  }
}

function prepareOutput() {
  if (fs.existsSync(outputDir)) {
    if (!fs.existsSync(path.join(outputDir, markerName))) {
      throw new Error(`Refusing to replace unmarked output directory: ${outputDir}`);
    }
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, markerName), 'Codex Overleaf distribution kit output\n', 'utf8');
}

function createZip(stagingParent, directoryName, outputPath) {
  let result = spawnSync('bsdtar', ['-a', '-cf', outputPath, '-C', stagingParent, directoryName], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    result = spawnSync('zip', ['-q', '-r', outputPath, directoryName], { cwd: stagingParent, encoding: 'utf8' });
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || result.error?.message || 'ZIP creation failed. Install bsdtar or zip.');
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: packageRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
}

function listFiles(root) {
  const files = [];
  walk(root, '');
  return files.sort();

  function walk(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) files.push(relative);
    }
  }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exit(1);
}
