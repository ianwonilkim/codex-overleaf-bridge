#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(packageRoot, 'dist', 'approved-bridge-transfer-20260909-r8');
const markerName = '.approved-overleaf-transfer-output';
const archiveName = 'overleaf-approved-bridge-installer-20260909-r8.tar.gz';
const excludedTopLevel = new Set(['.git', 'node_modules', 'dist', 'release-assets']);
const excludedTopLevelPrefixes = ['OVERLEAF_PROJECT_POLICY_', 'VERIFICATION_'];

function main() {
  prepareOutput();
  const stagingParent = fs.mkdtempSync(path.join(os.tmpdir(), 'overleaf-approved-transfer-'));
  const stagingRoot = path.join(stagingParent, 'overleaf-approved-bridge-installer-20260909-r8');
  try {
    fs.cpSync(packageRoot, stagingRoot, {
      recursive: true,
      dereference: false,
      filter: source => shouldInclude(source)
    });
    const files = listFiles(stagingRoot);
    const sourceDigest = digestFiles(stagingRoot, files);
    const archivePath = path.join(outputDir, archiveName);
    const tar = spawnSync('tar', ['-czf', archivePath, '-C', stagingParent, path.basename(stagingRoot)], { encoding: 'utf8' });
    if (tar.status !== 0) throw new Error(tar.stderr || tar.stdout || 'tar failed');
    const archiveSha256 = sha256File(archivePath);
    const manifest = {
      schemaVersion: 1,
      artifact: archiveName,
      archiveSha256,
      archiveBytes: fs.statSync(archivePath).size,
      sourceDigest,
      sourceFileCount: files.length,
      approvedBridgeRevision: 'v6',
      upstream: {
        repository: 'https://github.com/Ghqqqq/codex-overleaf-link',
        tag: 'v2.3.5',
        commit: '4cbaff3b99a05625c4cca48ea4fabd4bcffc5a7d'
      },
      policyContract: 'APPROVED_BRIDGE_CONTRACT_KO.md',
      writeAccessMode: 'automatic_after_verified_project_policy',
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(outputDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(outputDir, 'SHA256SUMS'), `${archiveSha256}  ${archiveName}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ ok: true, outputDir, manifest }, null, 2)}\n`);
  } finally {
    fs.rmSync(stagingParent, { recursive: true, force: true });
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
  fs.writeFileSync(path.join(outputDir, markerName), 'approved bridge transfer output\n', 'utf8');
}

function shouldInclude(source) {
  const relative = path.relative(packageRoot, source);
  if (!relative) return true;
  const topLevel = relative.split(path.sep)[0];
  if (excludedTopLevel.has(topLevel)) return false;
  if (excludedTopLevelPrefixes.some(prefix => topLevel.startsWith(prefix))) return false;
  return true;
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

function digestFiles(root, files) {
  const digest = crypto.createHash('sha256');
  for (const relative of files) {
    digest.update(relative);
    digest.update('\0');
    digest.update(fs.readFileSync(path.join(root, relative)));
    digest.update('\0');
  }
  return digest.digest('hex');
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
