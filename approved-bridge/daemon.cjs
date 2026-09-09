#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const Store = require('../native-host/src/approvedBridgeStore');

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const DEFAULT_WAIT_MS = 75_000;
const MAX_WAIT_MS = 130_000;

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  const stateDir = path.resolve(options.stateDir || Store.getDefaultStateDir());
  const configPatch = {};
  if (options.testProject !== undefined) configPatch.testProjectId = options.testProject;
  if (options.port !== undefined) configPatch.port = options.port;
  Store.initializeState({ stateDir });
  const configured = Object.keys(configPatch).length
    ? Store.updateConfig(stateDir, configPatch)
    : Store.readConfig(stateDir);
  const tokenPath = ensureToken(stateDir);

  if (command === 'init' || command === 'configure') {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      command,
      stateDir,
      tokenPath,
      config: publicConfig(configured),
      policy: Store.getBridgeStatus(stateDir).policy
    }, null, 2)}\n`);
    return;
  }
  if (command !== 'serve') throw new Error(`Unknown command: ${command}`);

  const config = Store.readConfig(stateDir);
  const token = fs.readFileSync(tokenPath, 'utf8').trim();
  const server = createServer({ stateDir, token });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  process.stdout.write(`approved-overleaf-bridge listening on 127.0.0.1:${config.port}\n`);
  const stop = signal => {
    process.stderr.write(`approved-overleaf-bridge received ${signal}; stopping\n`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000).unref();
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

function createServer({ stateDir, token }) {
  return http.createServer(async (request, response) => {
    try {
      if (!isLoopback(request.socket.remoteAddress)) {
        return sendJson(response, 403, { ok: false, error: { code: 'loopback_only', message: 'Loopback connections only.' } });
      }
      if (!isAuthorized(request, token)) {
        return sendJson(response, 401, { ok: false, error: { code: 'unauthorized', message: 'Bearer token required.' } });
      }
      if (request.method === 'GET' && request.url === '/health') {
        return sendJson(response, 200, { ok: true, result: Store.getBridgeStatus(stateDir) });
      }
      if (request.method !== 'POST' || request.url !== '/rpc') {
        return sendJson(response, 404, { ok: false, error: { code: 'not_found', message: 'Use POST /rpc.' } });
      }
      const body = await readJsonBody(request);
      const result = await dispatchRpc(stateDir, body);
      return sendJson(response, 200, { ok: true, result });
    } catch (error) {
      const status = error?.code === 'request_too_large' ? 413 : 400;
      return sendJson(response, status, {
        ok: false,
        error: {
          code: error?.code || 'bridge_error',
          message: error?.message || String(error),
          details: error?.details
        }
      });
    }
  });
}

async function dispatchRpc(stateDir, body = {}) {
  const action = String(body.action || '');
  const input = body.input && typeof body.input === 'object' ? body.input : {};
  if (action === 'status') {
    return Store.getBridgeStatus(stateDir, { projectId: input.projectId });
  }
  if (action === 'preview') {
    return previewCurrentDiff(stateDir, input);
  }
  if (action === 'register-policy') {
    const queued = Store.enqueuePolicyRegistration(stateDir, input);
    return maybeWait(stateDir, queued, input.waitMs === undefined ? DEFAULT_WAIT_MS : input.waitMs);
  }
  if (action === 'set-paper-rules') {
    return Store.setProjectPaperRules(stateDir, input);
  }
  if (action === 'verify-policy') {
    return verifyCurrentPolicy(stateDir, input);
  }
  if (action === 'apply') {
    const queued = Store.enqueueApply(stateDir, input);
    return maybeWait(stateDir, queued, input.waitMs);
  }
  if (action === 'compile') {
    const queued = Store.enqueueCompile(stateDir, input);
    return maybeWait(stateDir, queued, input.waitMs);
  }
  if (action === 'undo') {
    const queued = Store.enqueueUndo(stateDir, input);
    return maybeWait(stateDir, queued, input.waitMs);
  }
  if (action === 'job') {
    return Store.getJobResult(stateDir, input.jobId);
  }
  if (action === 'receipt') {
    return Store.getReceipt(stateDir, input.receiptId);
  }
  throw Store.bridgeError('method_not_found', `Unknown bridge RPC action: ${action || '(empty)'}`);
}

async function previewCurrentDiff(stateDir, input) {
  const registeredPolicy = Store.getPolicyForProject(stateDir, input.scope, input.projectId, {
    required: input.scope === 'production'
  });
  const policyVerification = registeredPolicy
    ? await verifyCurrentPolicy(stateDir, input)
    : null;
  let beforeContent;
  if (typeof input.beforeContent === 'string') {
    beforeContent = input.beforeContent;
  } else {
    const readJob = Store.enqueueRead(stateDir, {
      scope: input.scope,
      projectId: input.projectId,
      path: input.path
    });
    const readResult = await waitForTerminal(stateDir, readJob.id, normalizeWaitMs(input.waitMs, DEFAULT_WAIT_MS));
    try {
      if (readResult.job.status !== 'succeeded' || readResult.result?.ok !== true || typeof readResult.result.content !== 'string') {
        throw Store.bridgeError(
          readResult.result?.error?.code || 'overleaf_read_failed',
          readResult.result?.error?.message || 'Could not read the current Overleaf file for diff preview.'
        );
      }
      beforeContent = readResult.result.content;
    } finally {
      Store.removeTransientJob(stateDir, readJob.id);
    }
  }
  if (typeof input.afterContent !== 'string') {
    throw Store.bridgeError('missing_after_content', 'after_content is required for diff preview.');
  }
  return Store.createProposalFromContents(stateDir, {
    scope: input.scope,
    projectId: input.projectId,
    path: input.path,
    beforeContent,
    afterContent: input.afterContent,
    ttlMs: input.ttlMs,
    policyVerification: policyVerification
      ? {
          verified: policyVerification.verified === true,
          policyHash: policyVerification.policyHash,
          observedAt: policyVerification.observedAt
        }
      : null
  });
}

async function verifyCurrentPolicy(stateDir, input) {
  const verifyJob = Store.enqueuePolicyVerification(stateDir, {
    scope: input.scope,
    projectId: input.projectId
  });
  const result = await waitForTerminal(stateDir, verifyJob.id, normalizeWaitMs(input.waitMs, DEFAULT_WAIT_MS));
  try {
    if (result.job.status !== 'succeeded' || result.result?.ok !== true || result.result?.verified !== true) {
      throw Store.bridgeError(
        result.result?.error?.code || 'project_policy_verification_failed',
        result.result?.error?.message || 'Fresh Overleaf project-policy verification failed.',
        result.result?.error?.details
      );
    }
    return result.result;
  } finally {
    Store.removeTransientJob(stateDir, verifyJob.id);
  }
}

async function maybeWait(stateDir, queued, waitMs) {
  const normalized = normalizeWaitMs(waitMs, 0);
  if (normalized <= 0) return { queued, terminal: false };
  return waitForTerminal(stateDir, queued.id, normalized);
}

async function waitForTerminal(stateDir, jobId, waitMs) {
  const deadline = Date.now() + normalizeWaitMs(waitMs, DEFAULT_WAIT_MS);
  while (Date.now() < deadline) {
    const result = Store.getJobResult(stateDir, jobId);
    if (result.terminal) return result;
    await delay(150);
  }
  return {
    ...Store.getJobResult(stateDir, jobId),
    timedOut: true,
    message: 'The request remains queued or in progress; query the job ID instead of retrying the mutation.'
  };
}

function ensureToken(stateDir) {
  const tokenPath = path.join(stateDir, 'token');
  try {
    const existing = fs.readFileSync(tokenPath, 'utf8').trim();
    if (existing.length >= 43) return tokenPath;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  fs.writeFileSync(tokenPath, `${crypto.randomBytes(32).toString('base64url')}\n`, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(tokenPath, 0o600); } catch {}
  return tokenPath;
}

function isAuthorized(request, expectedToken) {
  const header = String(request.headers.authorization || '');
  const actual = header.startsWith('Bearer ') ? header.slice(7) : '';
  const left = Buffer.from(actual);
  const right = Buffer.from(expectedToken);
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_REQUEST_BYTES) {
        reject(Store.bridgeError('request_too_large', 'Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.once('error', reject);
    request.once('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Store.bridgeError('invalid_json', 'Request body must be valid JSON.'));
      }
    });
  });
}

function sendJson(response, status, value) {
  if (response.writableEnded) return;
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'serve';
  const start = command === 'serve' && argv[0]?.startsWith('--') ? 0 : argv[0] && !argv[0].startsWith('--') ? 1 : 0;
  const options = {};
  for (let index = start; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--state-dir') options.stateDir = readValue(argv, ++index, arg);
    else if (arg === '--test-project') options.testProject = readValue(argv, ++index, arg);
    else if (arg === '--clear-test-project') options.testProject = '';
    else if (arg === '--port') options.port = Number(readValue(argv, ++index, arg));
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.help) {
    process.stdout.write([
      'Usage:',
      '  node approved-bridge/daemon.cjs serve [--state-dir PATH]',
      '  node approved-bridge/daemon.cjs init [--test-project ID]',
      '  node approved-bridge/daemon.cjs configure [--test-project ID|--clear-test-project]',
      'Production papers are connected through overleaf_connect_project; verified policy registration is the write gate.',
      ''
    ].join('\n'));
    process.exit(0);
  }
  return { command, options };
}

function publicConfig(config) {
  return {
    approvedBridgeRevision: config.approvedBridgeRevision || Store.APPROVED_BRIDGE_REVISION,
    bindHost: config.bindHost,
    port: config.port,
    testProjectId: config.testProjectId,
    writeAccessMode: 'automatic_after_verified_project_policy',
    requireReviewing: true,
    textEditOnly: true
  };
}

function readValue(argv, index, option) {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
  return value;
}

function normalizeWaitMs(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(MAX_WAIT_MS, Math.round(number)));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exit(1);
  });
}

module.exports = { createServer, dispatchRpc, ensureToken, main, parseArgs, waitForTerminal };
