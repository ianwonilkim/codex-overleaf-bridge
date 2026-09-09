'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Policy = require('../../extension/src/shared/approvedBridgePolicy');

const SCHEMA_VERSION = 1;
const APPROVED_BRIDGE_REVISION = 'v5';
const DEFAULT_PORT = 17381;
const DEFAULT_PROPOSAL_TTL_MS = 30 * 60 * 1000;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_PATCH_BYTES = 512 * 1024;
const MAX_RESULT_BYTES = 3 * 1024 * 1024;
const CLAIM_STALE_MS = 10 * 60 * 1000;
const SAFE_PROJECT_ID = /^[a-f0-9]{24}$/;
const PRODUCTION_WRITE_PHRASE = '반영해';
const PRODUCTION_UNDO_PHRASE = '되돌려줘';
const TEST_APPROVAL_PHRASE = '해봐';
const POLICY_REGISTRATION_PHRASE = '연결해';
const EXTERNAL_MODULE_POLICY_APPROVAL_PHRASE = '확인, Overleaf 외부 모듈 정책을 등록해줘';
const LEGACY_PRODUCTION_WRITE_PHRASE = '확정, Overleaf에 반영해줘';
const LEGACY_PRODUCTION_UNDO_PHRASE = '확정, Overleaf 변경을 되돌려줘';
const LEGACY_POLICY_REGISTRATION_PHRASE = '확정, Overleaf 프로젝트 보호 정책을 등록해줘';

function getDefaultStateDir(env = process.env) {
  const configured = String(env.CODEX_OVERLEAF_APPROVED_STATE_DIR || '').trim();
  if (configured) return path.resolve(configured);
  return path.join(env.HOME || os.homedir(), '.codex-overleaf', 'approved-bridge-v1');
}

function initializeState(options = {}) {
  const stateDir = path.resolve(options.stateDir || getDefaultStateDir(options.env));
  ensurePrivateDirectory(stateDir);
  for (const name of ['jobs', 'proposals', 'receipts', 'results', 'heartbeats', 'policies', 'policy-history', 'policy-verifications']) {
    ensurePrivateDirectory(path.join(stateDir, name));
  }
  const configPath = path.join(stateDir, 'config.json');
  const current = readJson(configPath, null);
  const next = normalizeConfig({
    ...(current || {}),
    ...(options.config || {})
  });
  atomicWriteJson(configPath, next);
  return { stateDir, config: next };
}

function normalizeConfig(value = {}) {
  const testProjectId = normalizeProjectId(value.testProjectId, { allowEmpty: true });
  return {
    schemaVersion: SCHEMA_VERSION,
    approvedBridgeRevision: APPROVED_BRIDGE_REVISION,
    bindHost: '127.0.0.1',
    port: normalizePort(value.port || DEFAULT_PORT),
    testProjectId,
    testApprovalPhrase: TEST_APPROVAL_PHRASE,
    productionWritePhrase: PRODUCTION_WRITE_PHRASE,
    productionUndoPhrase: PRODUCTION_UNDO_PHRASE,
    proposalTtlMs: normalizeInteger(value.proposalTtlMs, DEFAULT_PROPOSAL_TTL_MS, 60_000, 24 * 60 * 60 * 1000),
    maxTextBytes: normalizeInteger(value.maxTextBytes, MAX_TEXT_BYTES, 1024, 8 * 1024 * 1024),
    maxPatchBytes: normalizeInteger(value.maxPatchBytes, MAX_PATCH_BYTES, 1024, 2 * 1024 * 1024),
    updatedAt: new Date().toISOString()
  };
}

function readConfig(stateDir) {
  const config = readJson(path.join(stateDir, 'config.json'), null);
  if (!config) {
    return initializeState({ stateDir }).config;
  }
  return normalizeConfig(config);
}

function updateConfig(stateDir, patchValue = {}) {
  return withStateLock(stateDir, () => {
    const current = readConfig(stateDir);
    const next = normalizeConfig({ ...current, ...patchValue });
    atomicWriteJson(path.join(stateDir, 'config.json'), next);
    return next;
  });
}

function enqueueRead(stateDir, input = {}) {
  const scope = normalizeScope(input.scope);
  const projectId = normalizeProjectId(input.projectId);
  const filePath = normalizeProjectPath(input.path);
  const config = readConfig(stateDir);
  assertProjectAllowed(stateDir, config, scope, projectId, { mutation: false });
  return withStateLock(stateDir, () => createQueuedJob(stateDir, {
    action: 'read',
    scope,
    projectId,
    payload: { path: filePath }
  }));
}

function enqueuePolicyRegistration(stateDir, input = {}) {
  const scope = normalizeScope(input.scope);
  const projectId = normalizeProjectId(input.projectId);
  const config = readConfig(stateDir);
  if (scope === 'test') assertProjectConfigured(config, scope, projectId);
  if (![POLICY_REGISTRATION_PHRASE, LEGACY_POLICY_REGISTRATION_PHRASE].includes(String(input.approvalText || ''))) {
    throw bridgeError('policy_registration_approval_mismatch', 'The project connection was not explicitly confirmed.');
  }
  const definition = Policy.normalizeDefinition({
    ...(input.definition || {}),
    scope,
    projectId
  }, { normalizePath: normalizeProjectPath });
  if (definition.allowedPreambleDirectives.length &&
      String(input.externalModuleApprovalText || '') !== EXTERNAL_MODULE_POLICY_APPROVAL_PHRASE) {
    throw bridgeError(
      'external_module_policy_approval_mismatch',
      'The exact additional approval phrase for an external-module policy was not supplied.'
    );
  }
  return withStateLock(stateDir, () => publicJob(createQueuedJob(stateDir, {
    action: 'policy-register',
    scope,
    projectId,
    approvalEvidence: {
      exactPhrase: String(input.approvalText),
      externalModuleExactPhrase: definition.allowedPreambleDirectives.length
        ? String(input.externalModuleApprovalText)
        : '',
      recordedAt: new Date().toISOString()
    },
    payload: { definition }
  })));
}

function enqueuePolicyVerification(stateDir, input = {}) {
  const scope = normalizeScope(input.scope);
  const projectId = normalizeProjectId(input.projectId);
  const config = readConfig(stateDir);
  if (scope === 'test') assertProjectConfigured(config, scope, projectId);
  const policy = getPolicyForProject(stateDir, scope, projectId, { required: true });
  return withStateLock(stateDir, () => publicJob(createQueuedJob(stateDir, {
    action: 'policy-verify',
    scope,
    projectId,
    payload: { policy, policyHash: policy.policyHash }
  })));
}

function createProposalFromContents(stateDir, input = {}) {
  const scope = normalizeScope(input.scope);
  const projectId = normalizeProjectId(input.projectId);
  const filePath = normalizeProjectPath(input.path);
  const before = normalizeText(input.beforeContent);
  const after = normalizeText(input.afterContent);
  const config = readConfig(stateDir);
  assertProjectAllowed(stateDir, config, scope, projectId, { mutation: false });
  assertTextLimit(before, config.maxTextBytes, 'before_content');
  assertTextLimit(after, config.maxTextBytes, 'after_content');
  if (before === after) {
    throw bridgeError('no_change', 'The proposed content is identical to the current Overleaf content.');
  }
  const policy = getPolicyForProject(stateDir, scope, projectId, { required: scope === 'production' });
  const policyEvidence = policy
    ? validateProposalPolicy(policy, filePath, before, after, input.policyVerification)
    : null;
  const patches = computeSingleTextPatch(before, after);
  assertPatchLimit(patches, config.maxPatchBytes);
  const now = Date.now();
  const approvalId = crypto.randomUUID();
  const proposal = {
    schemaVersion: SCHEMA_VERSION,
    approvalId,
    state: 'proposed',
    scope,
    projectId,
    path: filePath,
    beforeSha256: hashText(before),
    afterSha256: hashText(after),
    policyHash: policy?.policyHash || '',
    policyEvidence,
    patches,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + normalizeInteger(input.ttlMs, config.proposalTtlMs, 60_000, 24 * 60 * 60 * 1000)).toISOString()
  };
  withStateLock(stateDir, () => atomicWriteJson(proposalPath(stateDir, approvalId), proposal));
  return publicProposal(proposal, before, after);
}

function enqueueApply(stateDir, input = {}) {
  const approvalId = normalizeUuid(input.approvalId, 'approval_id');
  return withStateLock(stateDir, () => {
    const proposalFile = proposalPath(stateDir, approvalId);
    const proposal = readJson(proposalFile, null);
    if (!proposal) throw bridgeError('approval_not_found', 'Approval proposal was not found.');
    if (proposal.state !== 'proposed') {
      throw bridgeError('approval_already_consumed', 'This approval ID has already been consumed or cancelled.');
    }
    if (Date.parse(proposal.expiresAt) <= Date.now()) {
      proposal.state = 'expired';
      proposal.expiredAt = new Date().toISOString();
      atomicWriteJson(proposalFile, proposal);
      throw bridgeError('approval_expired', 'This approval proposal has expired; preview the current diff again.');
    }
    const config = readConfig(stateDir);
    assertProjectAllowed(stateDir, config, proposal.scope, proposal.projectId, { mutation: true });
    const policy = getPolicyForProject(stateDir, proposal.scope, proposal.projectId, { required: proposal.scope === 'production' });
    assertProposalPolicyCurrent(proposal, policy);
    assertApprovalPhrase(config, proposal.scope, 'apply', input.approvalText);
    const job = createQueuedJob(stateDir, {
      action: 'apply',
      scope: proposal.scope,
      projectId: proposal.projectId,
      approvalId,
      approvalEvidence: {
        exactPhrase: String(input.approvalText),
        recordedAt: new Date().toISOString()
      },
      payload: {
        path: proposal.path,
        beforeSha256: proposal.beforeSha256,
        afterSha256: proposal.afterSha256,
        patches: proposal.patches,
        policy,
        policyHash: policy?.policyHash || '',
        requireReviewing: true,
        autoCompile: input.autoCompile !== false
      }
    });
    proposal.state = 'consumed';
    proposal.consumedAt = new Date().toISOString();
    proposal.jobId = job.id;
    atomicWriteJson(proposalFile, proposal);
    return publicJob(job);
  });
}

function enqueueCompile(stateDir, input = {}) {
  const scope = normalizeScope(input.scope);
  const projectId = normalizeProjectId(input.projectId);
  const config = readConfig(stateDir);
  assertProjectAllowed(stateDir, config, scope, projectId, { mutation: true });
  const policy = getPolicyForProject(stateDir, scope, projectId, { required: scope === 'production' });
  assertApprovalPhrase(config, scope, 'compile', input.approvalText);
  return withStateLock(stateDir, () => publicJob(createQueuedJob(stateDir, {
    action: 'compile',
    scope,
    projectId,
    approvalEvidence: {
      exactPhrase: String(input.approvalText),
      recordedAt: new Date().toISOString()
    },
    payload: { policy, policyHash: policy?.policyHash || '' }
  })));
}

function enqueueUndo(stateDir, input = {}) {
  const receiptId = normalizeUuid(input.receiptId, 'receipt_id');
  return withStateLock(stateDir, () => {
    const receiptFile = receiptPath(stateDir, receiptId);
    const receipt = readJson(receiptFile, null);
    if (!receipt) throw bridgeError('receipt_not_found', 'Write receipt was not found.');
    if (receipt.action !== 'apply' || !receipt.recovery || receipt.changedDocument !== true) {
      throw bridgeError('receipt_not_undoable', 'This receipt does not contain a verified recovery plan.');
    }
    if (receipt.undoJobId) {
      throw bridgeError('undo_already_queued', 'Undo has already been queued for this receipt.');
    }
    const config = readConfig(stateDir);
    assertProjectAllowed(stateDir, config, receipt.scope, receipt.projectId, { mutation: true });
    const policy = getPolicyForProject(stateDir, receipt.scope, receipt.projectId, { required: receipt.scope === 'production' });
    assertApprovalPhrase(config, receipt.scope, 'undo', input.approvalText);
    const job = createQueuedJob(stateDir, {
      action: 'undo',
      scope: receipt.scope,
      projectId: receipt.projectId,
      approvalId: receipt.approvalId || '',
      approvalEvidence: {
        exactPhrase: String(input.approvalText),
        recordedAt: new Date().toISOString(),
        sourceReceiptId: receiptId
      },
      payload: {
        sourceReceiptId: receiptId,
        path: receipt.path,
        expectedCurrentSha256: receipt.afterSha256,
        expectedRestoredSha256: receipt.beforeSha256,
        recovery: receipt.recovery,
        policy,
        policyHash: policy?.policyHash || '',
        autoCompile: input.autoCompile !== false
      }
    });
    receipt.undoJobId = job.id;
    receipt.undoQueuedAt = new Date().toISOString();
    atomicWriteJson(receiptFile, receipt);
    return publicJob(job);
  });
}

function createQueuedJob(stateDir, input = {}) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const job = {
    schemaVersion: SCHEMA_VERSION,
    id,
    action: String(input.action || ''),
    status: 'queued',
    scope: normalizeScope(input.scope),
    projectId: normalizeProjectId(input.projectId),
    approvalId: input.approvalId || '',
    approvalEvidence: input.approvalEvidence || null,
    payload: input.payload || {},
    createdAt: now,
    updatedAt: now
  };
  assertJobSize(job);
  atomicWriteJson(jobPath(stateDir, id), job);
  return job;
}

function recordHeartbeat(stateDir, input = {}) {
  const projectId = normalizeProjectId(input.projectId);
  const heartbeat = {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    extensionVersion: String(input.extensionVersion || '').slice(0, 64),
    extensionId: String(input.extensionId || '').slice(0, 128),
    pageUrlOrigin: String(input.pageUrlOrigin || '').slice(0, 200),
    seenAt: new Date().toISOString()
  };
  atomicWriteJson(path.join(stateDir, 'heartbeats', `${projectId}.json`), heartbeat);
  return heartbeat;
}

function claimNextJob(stateDir, input = {}) {
  const projectId = normalizeProjectId(input.projectId);
  recordHeartbeat(stateDir, input);
  try {
    return withStateLock(stateDir, () => {
      quarantineStaleClaims(stateDir);
      const jobs = listJsonFiles(path.join(stateDir, 'jobs'))
        .map(file => readJson(file, null))
        .filter(job => job && job.status === 'queued' && job.projectId === projectId)
        .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
      const job = jobs[0];
      if (!job) return null;
      job.status = 'claimed';
      job.claimToken = crypto.randomUUID();
      job.claimedAt = new Date().toISOString();
      job.updatedAt = job.claimedAt;
      atomicWriteJson(jobPath(stateDir, job.id), job);
      return {
        schemaVersion: job.schemaVersion,
        id: job.id,
        action: job.action,
        scope: job.scope,
        projectId: job.projectId,
        approvalId: job.approvalId,
        approvalEvidence: job.approvalEvidence,
        payload: job.payload,
        claimToken: job.claimToken,
        createdAt: job.createdAt
      };
    });
  } catch (error) {
    if (error?.code === 'bridge_busy') return null;
    throw error;
  }
}

function completeJob(stateDir, input = {}) {
  const jobId = normalizeUuid(input.jobId, 'job_id');
  const claimToken = normalizeUuid(input.claimToken, 'claim_token');
  const projectId = normalizeProjectId(input.projectId);
  const submittedResult = input.result && typeof input.result === 'object' ? input.result : {};
  assertJsonSize(submittedResult, MAX_RESULT_BYTES, 'result_too_large', 'Bridge result is too large.');
  return withStateLock(stateDir, () => {
    const file = jobPath(stateDir, jobId);
    const job = readJson(file, null);
    if (!job) throw bridgeError('job_not_found', 'Bridge job was not found.');
    if (job.projectId !== projectId) throw bridgeError('project_mismatch', 'Job project does not match the active Overleaf project.');
    if (job.status === 'succeeded' || job.status === 'failed') {
      const previous = readJson(resultPath(stateDir, jobId), null);
      return { idempotent: true, job: publicJob(job), result: previous?.result || null, receiptId: job.receiptId || '' };
    }
    if (job.status !== 'claimed' || job.claimToken !== claimToken) {
      throw bridgeError('claim_mismatch', 'Job claim is no longer valid; the operation was not accepted as complete.');
    }
    const now = new Date().toISOString();
    const result = finalizePolicyJobResult(stateDir, job, submittedResult, now);
    const succeeded = result.ok === true;
    const resultRecord = {
      schemaVersion: SCHEMA_VERSION,
      jobId,
      action: job.action,
      projectId,
      scope: job.scope,
      completedAt: now,
      result
    };
    atomicWriteJson(resultPath(stateDir, jobId), resultRecord);
    if (job.action === 'policy-verify') {
      atomicWriteJson(policyVerificationPath(stateDir, jobId), resultRecord);
    }
    job.status = succeeded ? 'succeeded' : 'failed';
    job.completedAt = now;
    job.updatedAt = now;
    delete job.claimToken;
    const receipt = buildReceipt(job, result, now);
    if (receipt) {
      atomicWriteJson(receiptPath(stateDir, receipt.receiptId), receipt);
      job.receiptId = receipt.receiptId;
    }
    atomicWriteJson(file, job);
    return { idempotent: false, job: publicJob(job), result, receiptId: receipt?.receiptId || '' };
  });
}

function finalizePolicyJobResult(stateDir, job, submittedResult, completedAt) {
  if (submittedResult.ok !== true || !['policy-register', 'policy-verify'].includes(job.action)) {
    return submittedResult;
  }
  try {
    if (job.action === 'policy-register') {
      const definition = Policy.normalizeDefinition(job.payload?.definition || {}, { normalizePath: normalizeProjectPath });
      const baseline = Policy.normalizeObservation(submittedResult.baseline || {});
      if (baseline.evidence !== 'overleaf_source_zip_utf8_text_sha256') {
        throw bridgeError('policy_evidence_not_server_zip', 'Policy baseline was not captured from a fresh Overleaf source ZIP.');
      }
      const definitionHash = hashText(Policy.definitionMaterial(definition));
      const policyHash = hashText(Policy.policyMaterial(definition, baseline));
      if (submittedResult.definitionHash && submittedResult.definitionHash !== definitionHash) {
        throw bridgeError('policy_definition_hash_mismatch', 'Extension policy definition hash does not match the daemon calculation.');
      }
      const record = {
        schemaVersion: Policy.POLICY_SCHEMA_VERSION,
        status: 'verified',
        definition,
        definitionHash,
        policyHash,
        baseline,
        registeredAt: completedAt,
        lastVerifiedAt: completedAt
      };
      persistPolicyRecord(stateDir, record);
      return {
        ...submittedResult,
        ok: true,
        changedDocument: false,
        policy: publicPolicy(record),
        definitionHash,
        policyHash,
        baseline
      };
    }

    const current = getPolicyForProject(stateDir, job.scope, job.projectId, { required: true });
    if (job.payload?.policyHash !== current.policyHash) {
      throw bridgeError('policy_changed_during_verification', 'Registered policy changed while verification was running.');
    }
    const observed = Policy.normalizeObservation(submittedResult.observed || {});
    Policy.assertObservationMatches(current.definition, current.baseline, observed);
    current.lastVerifiedAt = completedAt;
    atomicWriteJson(policyPath(stateDir, job.projectId), current);
    return {
      ...submittedResult,
      ok: true,
      changedDocument: false,
      verified: true,
      policyHash: current.policyHash,
      observedAt: observed.capturedAt,
      observed
    };
  } catch (error) {
    return {
      ok: false,
      changedDocument: false,
      error: {
        code: String(error?.code || 'policy_result_invalid'),
        message: String(error?.message || error || 'Policy result validation failed.').slice(0, 1000),
        details: error?.details
      }
    };
  }
}

function buildReceipt(job, result, completedAt) {
  if (!['apply', 'undo', 'compile'].includes(job.action)) return null;
  const receiptId = crypto.randomUUID();
  const base = {
    schemaVersion: SCHEMA_VERSION,
    receiptId,
    jobId: job.id,
    action: job.action,
    status: result.ok === true ? 'succeeded' : 'failed',
    scope: job.scope,
    projectId: job.projectId,
    approvalId: job.approvalId || '',
    approvalEvidence: job.approvalEvidence || null,
    completedAt,
    compile: result.compile || null,
    save: result.save || null,
    policyHash: String(job.payload?.policyHash || ''),
    policyEvidence: result.policyEvidence || null,
    error: result.error || null
  };
  if (job.action === 'apply') {
    return {
      ...base,
      path: job.payload.path,
      beforeSha256: job.payload.beforeSha256,
      afterSha256: result.afterSha256 || job.payload.afterSha256,
      changedDocument: result.changedDocument === true,
      recovery: result.changedDocument === true ? result.recovery || null : null
    };
  }
  if (job.action === 'undo') {
    return {
      ...base,
      path: job.payload.path,
      sourceReceiptId: job.payload.sourceReceiptId,
      restoredSha256: result.restoredSha256 || ''
    };
  }
  return base;
}

function quarantineStaleClaims(stateDir) {
  const cutoff = Date.now() - CLAIM_STALE_MS;
  for (const file of listJsonFiles(path.join(stateDir, 'jobs'))) {
    const job = readJson(file, null);
    if (!job || job.status !== 'claimed' || Date.parse(job.claimedAt || 0) > cutoff) continue;
    job.status = 'unknown';
    job.updatedAt = new Date().toISOString();
    job.error = {
      code: 'claimed_result_unknown',
      message: 'The extension claimed this mutation but did not return a receipt. It will not be retried automatically.'
    };
    delete job.claimToken;
    atomicWriteJson(file, job);
  }
}

function getJob(stateDir, jobId) {
  return readJson(jobPath(stateDir, normalizeUuid(jobId, 'job_id')), null);
}

function getJobResult(stateDir, jobId) {
  const normalized = normalizeUuid(jobId, 'job_id');
  const job = readJson(jobPath(stateDir, normalized), null);
  if (!job) throw bridgeError('job_not_found', 'Bridge job was not found.');
  const resultRecord = readJson(resultPath(stateDir, normalized), null);
  return {
    job: publicJob(job),
    result: resultRecord?.result || null,
    receiptId: job.receiptId || '',
    terminal: ['succeeded', 'failed', 'unknown'].includes(job.status)
  };
}

function getReceipt(stateDir, receiptId) {
  const receipt = readJson(receiptPath(stateDir, normalizeUuid(receiptId, 'receipt_id')), null);
  if (!receipt) throw bridgeError('receipt_not_found', 'Bridge receipt was not found.');
  return receipt;
}

function removeTransientJob(stateDir, jobId) {
  const id = normalizeUuid(jobId, 'job_id');
  const job = readJson(jobPath(stateDir, id), null);
  if (!job || !['read', 'policy-verify'].includes(job.action)) return false;
  fs.rmSync(jobPath(stateDir, id), { force: true });
  fs.rmSync(resultPath(stateDir, id), { force: true });
  return true;
}

function getBridgeStatus(stateDir, options = {}) {
  quarantineStaleClaimsSafely(stateDir);
  const config = readConfig(stateDir);
  const jobs = listJsonFiles(path.join(stateDir, 'jobs'))
    .map(file => readJson(file, null))
    .filter(Boolean);
  const counts = {};
  for (const job of jobs) counts[job.status] = (counts[job.status] || 0) + 1;
  const heartbeatFiles = listJsonFiles(path.join(stateDir, 'heartbeats'));
  const heartbeats = heartbeatFiles.map(file => readJson(file, null)).filter(Boolean);
  const projectId = options.projectId ? normalizeProjectId(options.projectId) : '';
  const testPolicy = config.testProjectId
    ? getPolicyForProject(stateDir, 'test', config.testProjectId, { required: false, tolerateInvalid: true })
    : null;
  const productionPolicies = listRegisteredPolicies(stateDir, 'production');
  return {
    schemaVersion: SCHEMA_VERSION,
    approvedBridgeRevision: APPROVED_BRIDGE_REVISION,
    daemon: { ok: true, pid: process.pid },
    policy: {
      testProjectConfigured: Boolean(config.testProjectId),
      productionProjectConfigured: productionPolicies.length > 0,
      productionReady: productionPolicies.length > 0,
      writeAccessMode: 'automatic_after_verified_project_policy',
      requireReviewing: true,
      textEditOnly: true,
      registry: {
        test: testPolicy ? publicPolicy(testPolicy) : null,
        production: productionPolicies.map(publicPolicy)
      }
    },
    queue: counts,
    heartbeat: projectId
      ? heartbeats.find(item => item.projectId === projectId) || null
      : heartbeats.sort((a, b) => String(b.seenAt).localeCompare(String(a.seenAt)))[0] || null
  };
}

function quarantineStaleClaimsSafely(stateDir) {
  try {
    withStateLock(stateDir, () => quarantineStaleClaims(stateDir));
  } catch (error) {
    if (error?.code !== 'bridge_busy') throw error;
  }
}

function assertProjectConfigured(config, scope, projectId) {
  if (scope !== 'test') return;
  const configured = config.testProjectId;
  if (!configured) {
    throw bridgeError(`${scope}_project_not_configured`, `No ${scope} Overleaf project is configured on the Mac bridge.`);
  }
  if (configured !== projectId) {
    throw bridgeError('project_not_allowlisted', `Project ${projectId} is not the configured ${scope} project.`);
  }
}

function assertProjectAllowed(stateDir, config, scope, projectId, options = {}) {
  if (scope === 'test') assertProjectConfigured(config, scope, projectId);
  else getPolicyForProject(stateDir, scope, projectId, { required: true });
}

function listRegisteredPolicies(stateDir, scopeValue) {
  const scope = normalizeScope(scopeValue);
  return listJsonFiles(path.join(stateDir, 'policies'))
    .map(file => {
      const projectId = path.basename(file, '.json');
      try {
        return getPolicyForProject(stateDir, scope, projectId, { required: false, tolerateInvalid: true });
      } catch {
        return null;
      }
    })
    .filter(policy => policy && policy.definition.scope === scope)
    .sort((left, right) => left.definition.projectId.localeCompare(right.definition.projectId));
}

function getPolicyForProject(stateDir, scopeValue, projectIdValue, options = {}) {
  const scope = normalizeScope(scopeValue);
  const projectId = normalizeProjectId(projectIdValue);
  const raw = readJson(policyPath(stateDir, projectId), null);
  if (!raw) {
    if (options.required) {
      throw bridgeError('project_policy_not_registered', `Project ${projectId} has no verified ${scope} policy registration.`);
    }
    return null;
  }
  try {
    const policy = Policy.normalizePolicyRecord(raw, { normalizePath: normalizeProjectPath });
    if (policy.definition.projectId !== projectId || policy.definition.scope !== scope) {
      throw bridgeError('project_policy_scope_mismatch', 'Registered policy does not match the requested project and scope.');
    }
    const expectedDefinitionHash = hashText(Policy.definitionMaterial(policy.definition));
    const expectedPolicyHash = hashText(Policy.policyMaterial(policy.definition, policy.baseline));
    if (policy.definitionHash !== expectedDefinitionHash || policy.policyHash !== expectedPolicyHash) {
      throw bridgeError('project_policy_record_corrupt', 'Registered policy hash does not match its stored definition and baseline.');
    }
    return policy;
  } catch (error) {
    if (options.tolerateInvalid) return null;
    if (error?.code) throw error;
    throw bridgeError('project_policy_record_invalid', 'Registered project policy record is invalid.');
  }
}

function validateProposalPolicy(policy, filePath, before, after, verification) {
  if (!verification || verification.verified !== true || verification.policyHash !== policy.policyHash) {
    throw bridgeError('fresh_policy_verification_required', 'Diff preview requires a fresh source-ZIP verification of the registered project policy.');
  }
  const observedAt = String(verification.observedAt || '');
  const age = Date.now() - Date.parse(observedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 2 * 60_000) {
    throw bridgeError('stale_policy_verification', 'Project-policy verification is missing or stale; read a fresh Overleaf source ZIP again.');
  }
  Policy.assertEditablePath(policy.definition, filePath);
  let beforeMainStructureFingerprint = '';
  let afterMainStructureFingerprint = '';
  if (filePath === policy.definition.mainDocument) {
    beforeMainStructureFingerprint = hashText(Policy.mainStructureMaterial(
      before,
      policy.definition.mutablePreambleCommands,
      policy.definition.allowedPreambleDirectives
    ));
    afterMainStructureFingerprint = hashText(Policy.mainStructureMaterial(
      after,
      policy.definition.mutablePreambleCommands,
      policy.definition.allowedPreambleDirectives
    ));
    if (beforeMainStructureFingerprint !== policy.baseline.mainStructureFingerprint ||
        afterMainStructureFingerprint !== policy.baseline.mainStructureFingerprint) {
      throw bridgeError(policy.definition.integrityErrorCode, 'The current or proposed main document changes protected template structure.', {
        reason: 'proposed_main_structure_changed',
        path: filePath,
        expectedSha256: policy.baseline.mainStructureFingerprint,
        beforeSha256: beforeMainStructureFingerprint,
        afterSha256: afterMainStructureFingerprint
      });
    }
  }
  return {
    verified: true,
    policyHash: policy.policyHash,
    definitionHash: policy.definitionHash,
    observedAt,
    beforeMainStructureFingerprint,
    afterMainStructureFingerprint
  };
}

function assertProposalPolicyCurrent(proposal, policy) {
  const expected = String(proposal.policyHash || '');
  const current = String(policy?.policyHash || '');
  if (expected !== current) {
    throw bridgeError('project_policy_changed_after_preview', 'Project policy changed after diff preview; create a new preview approval ID.');
  }
  if (policy) Policy.assertEditablePath(policy.definition, proposal.path);
}

function persistPolicyRecord(stateDir, recordValue) {
  const record = Policy.normalizePolicyRecord(recordValue, { normalizePath: normalizeProjectPath });
  const projectId = record.definition.projectId;
  const historyDir = path.join(stateDir, 'policy-history', projectId);
  ensurePrivateDirectory(historyDir);
  const historyFile = path.join(historyDir, `${record.policyHash}.json`);
  const existingHistory = readJson(historyFile, null);
  if (existingHistory && JSON.stringify(existingHistory) !== JSON.stringify(record)) {
    throw bridgeError('policy_history_collision', 'An immutable policy-history hash already exists with different content.');
  }
  if (!existingHistory) atomicWriteJson(historyFile, record);
  atomicWriteJson(policyPath(stateDir, projectId), record);
}

function publicPolicy(policy) {
  return {
    status: policy.status,
    projectId: policy.definition.projectId,
    scope: policy.definition.scope,
    policyName: policy.definition.policyName,
    policyRevision: policy.definition.policyRevision,
    policySourceSha256: policy.definition.policySourceSha256,
    mainDocument: policy.definition.mainDocument,
    allowedPreambleDirectives: policy.definition.allowedPreambleDirectives,
    protectedFileCount: policy.baseline.protectedFiles.length,
    definitionHash: policy.definitionHash,
    policyHash: policy.policyHash,
    mainStructureFingerprint: policy.baseline.mainStructureFingerprint,
    protectedPathSetSha256: policy.baseline.protectedPathSetSha256,
    registeredAt: policy.registeredAt,
    lastVerifiedAt: policy.lastVerifiedAt
  };
}

function assertApprovalPhrase(config, scope, action, value) {
  const actual = String(value || '');
  const accepted = scope === 'test'
    ? [config.testApprovalPhrase]
    : action === 'undo'
      ? [config.productionUndoPhrase, LEGACY_PRODUCTION_UNDO_PHRASE]
      : [config.productionWritePhrase, TEST_APPROVAL_PHRASE, LEGACY_PRODUCTION_WRITE_PHRASE];
  if (!accepted.includes(actual)) {
    throw bridgeError('approval_phrase_mismatch', 'The displayed change was not explicitly approved.');
  }
}

function computeSingleTextPatch(before, after) {
  if (before === after) return [];
  let from = 0;
  const shared = Math.min(before.length, after.length);
  while (from < shared && before[from] === after[from]) from += 1;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > from && afterEnd > from && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return [{
    from,
    to: beforeEnd,
    expected: before.slice(from, beforeEnd),
    insert: after.slice(from, afterEnd)
  }];
}

function applyPatches(content, rawPatches) {
  const patches = normalizePatches(rawPatches);
  let output = normalizeText(content);
  for (let index = patches.length - 1; index >= 0; index -= 1) {
    const patch = patches[index];
    if (output.slice(patch.from, patch.to) !== patch.expected) {
      throw bridgeError('patch_expected_mismatch', 'Patch expected text does not match the supplied base content.');
    }
    output = output.slice(0, patch.from) + patch.insert + output.slice(patch.to);
  }
  return output;
}

function normalizePatches(rawPatches) {
  if (!Array.isArray(rawPatches) || rawPatches.length < 1 || rawPatches.length > 64) {
    throw bridgeError('invalid_patches', 'A proposal must contain between 1 and 64 text patches.');
  }
  const patches = rawPatches.map(raw => {
    const from = Number(raw?.from);
    const to = Number(raw?.to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) {
      throw bridgeError('invalid_patch_range', 'Patch offsets must be non-negative integer UTF-16 positions.');
    }
    return { from, to, expected: String(raw.expected ?? ''), insert: String(raw.insert ?? '') };
  }).sort((left, right) => left.from - right.from);
  for (let index = 1; index < patches.length; index += 1) {
    if (patches[index].from < patches[index - 1].to) {
      throw bridgeError('overlapping_patches', 'Patch ranges must not overlap.');
    }
  }
  return patches;
}

function publicProposal(proposal, before, after) {
  return {
    schemaVersion: proposal.schemaVersion,
    approvalId: proposal.approvalId,
    state: proposal.state,
    scope: proposal.scope,
    projectId: proposal.projectId,
    path: proposal.path,
    beforeSha256: proposal.beforeSha256,
    afterSha256: proposal.afterSha256,
    policyHash: proposal.policyHash || '',
    policyEvidence: proposal.policyEvidence || null,
    exactRanges: proposal.patches.map(patch => ({
      from: patch.from,
      to: patch.to,
      expectedSha256: hashText(patch.expected),
      insertSha256: hashText(patch.insert),
      expectedLength: patch.expected.length,
      insertLength: patch.insert.length
    })),
    diff: buildUnifiedDiff(before, after, proposal.path),
    createdAt: proposal.createdAt,
    expiresAt: proposal.expiresAt
  };
}

function publicJob(job) {
  return {
    id: job.id,
    action: job.action,
    status: job.status,
    scope: job.scope,
    projectId: job.projectId,
    approvalId: job.approvalId || '',
    receiptId: job.receiptId || '',
    createdAt: job.createdAt,
    claimedAt: job.claimedAt || '',
    completedAt: job.completedAt || '',
    error: job.error || null
  };
}

function buildUnifiedDiff(before, after, filePath) {
  const left = normalizeText(before).split('\n');
  const right = normalizeText(after).split('\n');
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > prefix && rightEnd > prefix && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd -= 1;
    rightEnd -= 1;
  }
  const contextStart = Math.max(0, prefix - 3);
  const leftContextEnd = Math.min(left.length, leftEnd + 3);
  const rightContextEnd = Math.min(right.length, rightEnd + 3);
  const lines = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${contextStart + 1},${leftContextEnd - contextStart} +${contextStart + 1},${rightContextEnd - contextStart} @@`
  ];
  for (let index = contextStart; index < prefix; index += 1) lines.push(` ${left[index]}`);
  for (let index = prefix; index < leftEnd; index += 1) lines.push(`-${left[index]}`);
  for (let index = prefix; index < rightEnd; index += 1) lines.push(`+${right[index]}`);
  const suffixCount = Math.min(leftContextEnd - leftEnd, rightContextEnd - rightEnd);
  for (let offset = 0; offset < suffixCount; offset += 1) lines.push(` ${left[leftEnd + offset]}`);
  const output = lines.join('\n');
  return Buffer.byteLength(output, 'utf8') <= 128 * 1024
    ? output
    : `${output.slice(0, 128 * 1024)}\n... diff truncated by bridge ...`;
}

function hashText(value) {
  return crypto.createHash('sha256').update(normalizeText(value), 'utf8').digest('hex');
}

function hashExactText(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n');
}

function normalizeProjectPath(value) {
  const raw = String(value || '');
  if (!raw || raw.includes('\\') || raw.startsWith('/') || /[\0-\x1f\x7f]/.test(raw)) {
    throw bridgeError('invalid_project_path', 'Overleaf path must be a safe relative POSIX path.');
  }
  const normalized = raw.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw bridgeError('invalid_project_path', 'Overleaf path must not contain empty, dot, or parent segments.');
  }
  return normalized;
}

function normalizeProjectId(value, options = {}) {
  const text = String(value || '').trim();
  if (!text && options.allowEmpty) return '';
  if (!SAFE_PROJECT_ID.test(text)) {
    throw bridgeError('invalid_project_id', 'Overleaf project ID must be the 24-character lowercase hex ID from /project/<id>, not a link-sharing token.');
  }
  return text;
}

function normalizeScope(value) {
  const scope = String(value || '').trim();
  if (!['test', 'production'].includes(scope)) throw bridgeError('invalid_scope', 'Scope must be test or production.');
  return scope;
}

function normalizeUuid(value, field) {
  const text = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw bridgeError(`invalid_${field}`, `${field} must be a UUID.`);
  }
  return text;
}

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw bridgeError('invalid_port', 'Port must be an integer from 1024 to 65535.');
  return port;
}

function normalizeInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function assertTextLimit(text, limit, field) {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > limit) throw bridgeError('text_too_large', `${field} exceeds the configured ${limit}-byte limit.`);
}

function assertPatchLimit(patches, limit) {
  const bytes = Buffer.byteLength(JSON.stringify(patches), 'utf8');
  if (bytes > limit) throw bridgeError('patch_too_large', `Patch exceeds the configured ${limit}-byte limit.`);
}

function assertJobSize(job) {
  assertJsonSize(job, MAX_RESULT_BYTES, 'job_too_large', 'Bridge job is too large.');
}

function assertJsonSize(value, limit, code, message) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > limit) throw bridgeError(code, message);
}

function proposalPath(stateDir, id) { return path.join(stateDir, 'proposals', `${id}.json`); }
function jobPath(stateDir, id) { return path.join(stateDir, 'jobs', `${id}.json`); }
function resultPath(stateDir, id) { return path.join(stateDir, 'results', `${id}.json`); }
function receiptPath(stateDir, id) { return path.join(stateDir, 'receipts', `${id}.json`); }
function policyPath(stateDir, projectId) { return path.join(stateDir, 'policies', `${projectId}.json`); }
function policyVerificationPath(stateDir, id) { return path.join(stateDir, 'policy-verifications', `${id}.json`); }

function withStateLock(stateDir, fn) {
  ensurePrivateDirectory(stateDir);
  const lockPath = path.join(stateDir, '.state-lock');
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') throw bridgeError('bridge_busy', 'Bridge state is busy; retry shortly.');
    throw error;
  }
  try {
    return fn();
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

function ensurePrivateDirectory(target) {
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(target, 0o700); } catch {}
}

function atomicWriteJson(target, value) {
  ensurePrivateDirectory(path.dirname(target));
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(temp, 0o600); } catch {}
  fs.renameSync(temp, target);
}

function readJson(target, fallback) {
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function listJsonFiles(directory) {
  try {
    return fs.readdirSync(directory)
      .filter(name => name.endsWith('.json'))
      .map(name => path.join(directory, name));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function bridgeError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

module.exports = {
  APPROVED_BRIDGE_REVISION,
  DEFAULT_PORT,
  EXTERNAL_MODULE_POLICY_APPROVAL_PHRASE,
  POLICY_REGISTRATION_PHRASE,
  PRODUCTION_UNDO_PHRASE,
  PRODUCTION_WRITE_PHRASE,
  SCHEMA_VERSION,
  TEST_APPROVAL_PHRASE,
  applyPatches,
  bridgeError,
  claimNextJob,
  completeJob,
  computeSingleTextPatch,
  createProposalFromContents,
  enqueueApply,
  enqueueCompile,
  enqueuePolicyRegistration,
  enqueuePolicyVerification,
  enqueueRead,
  enqueueUndo,
  getBridgeStatus,
  getDefaultStateDir,
  getJob,
  getJobResult,
  getPolicyForProject,
  getReceipt,
  hashExactText,
  hashText,
  initializeState,
  normalizeConfig,
  normalizePatches,
  normalizeProjectId,
  normalizeProjectPath,
  normalizeScope,
  normalizeText,
  readConfig,
  removeTransientJob,
  updateConfig
};
