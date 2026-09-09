#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const SERVER_NAME = 'overleaf-approved-bridge';
const SERVER_VERSION = '1.3.0';
const DEFAULT_URL = 'http://127.0.0.1:17381';

const TOOLS = Object.freeze([
  {
    name: 'overleaf_status',
    description: 'Read the approval bridge, queue, and active Overleaf extension heartbeat status. This never edits Overleaf.',
    inputSchema: objectSchema({
      project_id: { type: 'string', description: 'Optional Overleaf project ID whose heartbeat should be returned.' }
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'overleaf_connect_project',
    description: 'Connect an Overleaf paper for writing by capturing and verifying its project-specific protected-file and main-structure baseline. Call only after the user explicitly asks to connect this project. The connection changes private Mac bridge state but never edits Overleaf; once it succeeds there is no separate production-enable switch.',
    inputSchema: objectSchema({
      scope: { type: 'string', enum: ['test', 'production'], default: 'production' },
      project_id: { type: 'string' },
      policy_name: { type: 'string' },
      policy_revision: { type: 'string' },
      policy_source_sha256: { type: 'string', description: 'SHA-256 of the reviewed repository project-policy document.' },
      main_document: { type: 'string' },
      editable_path_patterns: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 128 },
      protected_paths: { type: 'array', items: { type: 'string' }, maxItems: 256, default: [] },
      protected_path_patterns: { type: 'array', items: { type: 'string' }, maxItems: 128, default: [] },
      mutable_preamble_commands: { type: 'array', items: { type: 'string' }, maxItems: 64, default: ['title', 'author', 'name', 'address', 'date', 'thanks'] },
      allowed_preamble_directives: { type: 'array', items: { type: 'string' }, maxItems: 64, default: [], description: 'Exact one-line usepackage or RequirePackage directives reviewed by the user. Options and package names are matched exactly after whitespace normalization.' },
      integrity_error_code: { type: 'string', default: 'project_template_integrity_violation' },
      confirm_connection: { type: 'boolean', const: true, description: 'True only when the user explicitly asked to connect this project.' },
      external_module_approval_text: { type: 'string', description: 'Required when allowed_preamble_directives is non-empty. Exact phrase: 확인, Overleaf 외부 모듈 정책을 등록해줘' },
      wait_seconds: { type: 'number', minimum: 1, maximum: 120, default: 75 }
    }, [
      'scope', 'project_id', 'policy_name', 'policy_revision', 'policy_source_sha256',
      'main_document', 'editable_path_patterns', 'confirm_connection'
    ]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: 'overleaf_verify_project_policy',
    description: 'Read a fresh full Overleaf source ZIP and verify the registered protected-file hashes and main-document structure fingerprint. This never edits Overleaf or updates the baseline.',
    inputSchema: objectSchema({
      scope: { type: 'string', enum: ['test', 'production'] },
      project_id: { type: 'string' },
      wait_seconds: { type: 'number', minimum: 1, maximum: 120, default: 75 }
    }, ['scope', 'project_id']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'overleaf_preview_diff',
    description: 'Read the current allowlisted Overleaf text file, compute an exact one-file diff, and create a short-lived one-time approval ID. This does not write.',
    inputSchema: objectSchema({
      scope: { type: 'string', enum: ['test', 'production'] },
      project_id: { type: 'string' },
      path: { type: 'string', description: 'Safe project-relative text path, for example Template.tex.' },
      after_content: { type: 'string', description: 'Complete proposed UTF-8 text content for this one existing file.' },
      before_content: { type: 'string', description: 'Optional known current content. Omit to read it from the open Overleaf tab.' },
      wait_seconds: { type: 'number', minimum: 1, maximum: 120, default: 75 }
    }, ['scope', 'project_id', 'path', 'after_content']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: 'overleaf_apply_approved',
    description: 'Consume exactly one preview approval ID and apply its one-file patch through stale-hash checks, verified Overleaf Track Changes, save verification, and optional compile. Call only after the user explicitly approves the displayed change; concise confirmations such as 반영해 or 해봐 are accepted.',
    inputSchema: objectSchema({
      approval_id: { type: 'string' },
      approval_text: { type: 'string', description: 'User-authored approval for the displayed change. Accepted production forms: 반영해, 해봐, or the legacy long confirmation.' },
      auto_compile: { type: 'boolean', default: true },
      wait_seconds: { type: 'number', minimum: 0, maximum: 120, default: 90 }
    }, ['approval_id', 'approval_text']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
  },
  {
    name: 'overleaf_compile',
    description: 'Trigger Overleaf compilation for the exact allowlisted project and return a compact compile/log result. This requires the exact scope approval phrase.',
    inputSchema: objectSchema({
      scope: { type: 'string', enum: ['test', 'production'] },
      project_id: { type: 'string' },
      approval_text: { type: 'string' },
      wait_seconds: { type: 'number', minimum: 0, maximum: 120, default: 90 }
    }, ['scope', 'project_id', 'approval_text']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: 'overleaf_undo',
    description: 'Use a verified write receipt to reject/recover that one tracked write. Never call unless the user explicitly approved undo. Production exact phrase: 확정, Overleaf 변경을 되돌려줘.',
    inputSchema: objectSchema({
      receipt_id: { type: 'string' },
      approval_text: { type: 'string' },
      auto_compile: { type: 'boolean', default: true },
      wait_seconds: { type: 'number', minimum: 0, maximum: 120, default: 90 }
    }, ['receipt_id', 'approval_text']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
  }
]);

async function main() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', line => {
    void handleLine(line);
  });
  input.once('close', () => process.exit(0));
}

async function handleLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return writeMessage(errorResponse(null, -32700, 'Parse error'));
  }
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return writeMessage(errorResponse(message?.id ?? null, -32600, 'Invalid Request'));
  }
  if (message.id === undefined) return;
  try {
    const result = await dispatch(message.method, message.params || {});
    writeMessage({ jsonrpc: '2.0', id: message.id, result });
  } catch (error) {
    writeMessage(errorResponse(message.id, -32603, error?.message || String(error), {
      code: error?.code || 'mcp_bridge_error'
    }));
  }
}

async function dispatch(method, params) {
  if (method === 'initialize') {
    return {
      protocolVersion: normalizeProtocolVersion(params.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: 'Connecting a project captures a fresh source-ZIP baseline and immediately makes that verified project write-ready. There is no separate production-enable switch. Preview verifies the baseline; apply/compile/undo remain one-diff approval-gated and policy-checked.'
    };
  }
  if (method === 'ping') return {};
  if (method === 'tools/list') return { tools: TOOLS };
  if (method === 'tools/call') return callTool(params.name, params.arguments || {});
  throw Object.assign(new Error(`Method not found: ${method}`), { code: 'method_not_found' });
}

async function callTool(name, args) {
  let action;
  let input;
  if (name === 'overleaf_status') {
    action = 'status';
    input = { projectId: optionalString(args.project_id) };
  } else if (name === 'overleaf_connect_project' || name === 'overleaf_register_project_policy') {
    action = 'register-policy';
    input = {
      scope: args.scope || 'production',
      projectId: args.project_id,
      approvalText: args.confirm_connection === true ? '연결해' : args.approval_text,
      externalModuleApprovalText: args.external_module_approval_text,
      waitMs: secondsToMs(args.wait_seconds, 75),
      definition: {
        policyName: args.policy_name,
        policyRevision: args.policy_revision,
        policySourceSha256: args.policy_source_sha256,
        mainDocument: args.main_document,
        editablePathPatterns: args.editable_path_patterns,
        protectedPaths: args.protected_paths,
        protectedPathPatterns: args.protected_path_patterns,
        mutablePreambleCommands: args.mutable_preamble_commands,
        allowedPreambleDirectives: args.allowed_preamble_directives,
        integrityErrorCode: args.integrity_error_code
      }
    };
  } else if (name === 'overleaf_verify_project_policy') {
    action = 'verify-policy';
    input = {
      scope: args.scope,
      projectId: args.project_id,
      waitMs: secondsToMs(args.wait_seconds, 75)
    };
  } else if (name === 'overleaf_preview_diff') {
    action = 'preview';
    input = {
      scope: args.scope,
      projectId: args.project_id,
      path: args.path,
      afterContent: args.after_content,
      beforeContent: typeof args.before_content === 'string' ? args.before_content : undefined,
      waitMs: secondsToMs(args.wait_seconds, 75)
    };
  } else if (name === 'overleaf_apply_approved') {
    action = 'apply';
    input = {
      approvalId: args.approval_id,
      approvalText: args.approval_text,
      autoCompile: args.auto_compile !== false,
      waitMs: secondsToMs(args.wait_seconds, 90)
    };
  } else if (name === 'overleaf_compile') {
    action = 'compile';
    input = {
      scope: args.scope,
      projectId: args.project_id,
      approvalText: args.approval_text,
      waitMs: secondsToMs(args.wait_seconds, 90)
    };
  } else if (name === 'overleaf_undo') {
    action = 'undo';
    input = {
      receiptId: args.receipt_id,
      approvalText: args.approval_text,
      autoCompile: args.auto_compile !== false,
      waitMs: secondsToMs(args.wait_seconds, 90)
    };
  } else {
    return toolError('tool_not_found', `Unknown tool: ${name}`);
  }

  try {
    const result = await bridgeRpc(action, input);
    return toolSuccess(result);
  } catch (error) {
    return toolError(error?.code || 'bridge_request_failed', error?.message || String(error), error?.details);
  }
}

async function bridgeRpc(action, input) {
  const baseUrl = resolveBridgeUrl();
  const token = readToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 140_000);
  try {
    const response = await fetch(new URL('/rpc', baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ action, input }),
      redirect: 'error',
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      const remote = payload?.error || {};
      throw Object.assign(new Error(remote.message || `Bridge HTTP ${response.status}`), {
        code: remote.code || `bridge_http_${response.status}`,
        details: remote.details
      });
    }
    return payload.result;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('Bridge request timed out. Query status/job before retrying any mutation.'), { code: 'bridge_timeout' });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveBridgeUrl() {
  const value = String(process.env.OVERLEAF_BRIDGE_URL || DEFAULT_URL);
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw Object.assign(new Error('OVERLEAF_BRIDGE_URL must be an HTTP loopback URL reached directly or through an SSH tunnel.'), { code: 'unsafe_bridge_url' });
  }
  return url;
}

function readToken() {
  const direct = String(process.env.OVERLEAF_BRIDGE_TOKEN || '').trim();
  if (direct) return direct;
  const tokenFile = path.resolve(process.env.OVERLEAF_BRIDGE_TOKEN_FILE || path.join(os.homedir(), '.codex', 'overleaf-bridge-token'));
  try {
    const token = fs.readFileSync(tokenFile, 'utf8').trim();
    if (token.length < 43) throw new Error('token is too short');
    return token;
  } catch (error) {
    throw Object.assign(new Error(`Could not read the bridge token file: ${tokenFile}`), { code: 'bridge_token_unavailable' });
  }
}

function toolSuccess(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false
  };
}

function toolError(code, message, details) {
  const value = { ok: false, error: { code, message, details } };
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true
  };
}

function objectSchema(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}

function secondsToMs(value, fallbackSeconds) {
  const seconds = value === undefined ? fallbackSeconds : Number(value);
  if (!Number.isFinite(seconds)) return fallbackSeconds * 1000;
  return Math.max(0, Math.min(120, seconds)) * 1000;
}

function optionalString(value) {
  return typeof value === 'string' && value ? value : undefined;
}

function normalizeProtocolVersion(value) {
  const requested = String(value || '');
  return /^20\d{2}-\d{2}-\d{2}$/.test(requested) ? requested : '2025-06-18';
}

function errorResponse(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exit(1);
  });
}

module.exports = { TOOLS, bridgeRpc, callTool, dispatch, handleLine, resolveBridgeUrl };
