(function initCodexOverleafApprovedBridgeController(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/approvedBridgePolicy'));
  } else {
    root.CodexOverleafApprovedBridgeController = factory(root.CodexOverleafApprovedBridgePolicy);
  }
})(typeof window !== 'undefined' ? window : globalThis, function approvedBridgeControllerFactory(defaultPolicy) {
  'use strict';

  const TEST_APPROVAL_PHRASE = '해봐';
  const PRODUCTION_WRITE_PHRASE = '반영해';
  const PRODUCTION_UNDO_PHRASE = '되돌려줘';
  const POLICY_REGISTRATION_PHRASE = '연결해';
  const EXTERNAL_MODULE_POLICY_APPROVAL_PHRASE = '확인, Overleaf 외부 모듈 정책을 등록해줘';
  const LEGACY_PRODUCTION_WRITE_PHRASE = '확정, Overleaf에 반영해줘';
  const LEGACY_PRODUCTION_UNDO_PHRASE = '확정, Overleaf 변경을 되돌려줘';
  const LEGACY_POLICY_REGISTRATION_PHRASE = '확정, Overleaf 프로젝트 보호 정책을 등록해줘';

  function create(deps = {}) {
    const sendBackgroundNative = deps.sendBackgroundNative;
    const callPageBridge = deps.callPageBridge;
    const getCurrentProjectId = deps.getCurrentProjectId;
    const normalizeSafeProjectPath = deps.normalizeSafeProjectPath;
    const cryptoImpl = deps.crypto || globalThis.crypto;
    const policy = deps.policy || defaultPolicy;
    const setTimer = deps.setTimeout || ((callback, ms) => setTimeout(callback, ms));
    const clearTimer = deps.clearTimeout || (timer => clearTimeout(timer));
    const sleep = deps.sleep || (ms => new Promise(resolve => setTimer(resolve, ms)));
    const getExtensionMetadata = deps.getExtensionMetadata || (() => ({}));
    const getPageOrigin = deps.getPageOrigin || (() => 'https://www.overleaf.com');
    const pollIntervalMs = Math.max(500, Number(deps.pollIntervalMs || 1250));
    let timer = null;
    let stopped = true;
    let inFlight = false;

    function start() {
      if (!stopped) return;
      stopped = false;
      schedule(50);
    }

    function stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    }

    function schedule(delayMs = pollIntervalMs) {
      if (stopped) return;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        void pollOnce().finally(() => schedule());
      }, delayMs);
    }

    async function pollOnce() {
      if (stopped || inFlight) return { ok: true, skipped: true };
      const projectId = String(getCurrentProjectId?.() || '');
      if (!projectId) return { ok: true, skipped: true };
      inFlight = true;
      try {
        const metadata = getExtensionMetadata();
        const response = await sendBackgroundNative({
          method: 'approvedBridge.poll',
          params: {
            projectId,
            extensionVersion: String(metadata.version || ''),
            extensionId: String(metadata.extensionId || ''),
            pageUrlOrigin: String(getPageOrigin() || '')
          }
        });
        if (!response?.ok || !response.result?.job) return response || { ok: false };
        const job = response.result.job;
        let result;
        try {
          result = await processJob(job, projectId);
        } catch (error) {
          result = {
            ok: false,
            changedDocument: error?.changedDocument === true,
            error: {
              code: String(error?.code || 'approved_bridge_job_failed'),
              message: String(error?.message || error || 'Approved bridge job failed').slice(0, 1000),
              details: error?.details
            },
            recovery: error?.recovery || null
          };
        }
        return sendBackgroundNative({
          method: 'approvedBridge.complete',
          params: {
            jobId: job.id,
            claimToken: job.claimToken,
            projectId,
            result
          }
        });
      } finally {
        inFlight = false;
      }
    }

    async function processJob(job, activeProjectId) {
      validateJobEnvelope(job, activeProjectId);
      if (job.action === 'read') return processRead(job);
      if (job.action === 'policy-register') return processPolicyRegister(job);
      if (job.action === 'policy-verify') return processPolicyVerify(job);
      if (job.action === 'apply') return processApply(job);
      if (job.action === 'compile') return processCompile(job);
      if (job.action === 'undo') return processUndo(job);
      throw bridgeError('unsupported_job_action', `Unsupported approved bridge action: ${job.action}`);
    }

    async function processRead(job) {
      const snapshot = await readTextFile(job.payload?.path, job.projectId);
      return {
        ok: true,
        changedDocument: false,
        path: snapshot.path,
        content: snapshot.content,
        sha256: await hashText(snapshot.content)
      };
    }

    async function processPolicyRegister(job) {
      requirePolicyModule();
      if (![POLICY_REGISTRATION_PHRASE, LEGACY_POLICY_REGISTRATION_PHRASE]
        .includes(String(job.approvalEvidence?.exactPhrase || ''))) {
        throw bridgeError('policy_registration_approval_mismatch', 'Job does not contain an explicit project-connection confirmation.');
      }
      const definition = policy.normalizeDefinition(job.payload?.definition || {});
      if (definition.allowedPreambleDirectives.length &&
          String(job.approvalEvidence?.externalModuleExactPhrase || '') !== EXTERNAL_MODULE_POLICY_APPROVAL_PHRASE) {
        throw bridgeError(
          'external_module_policy_approval_mismatch',
          'Job does not contain the exact additional approval phrase for its external-module allowlist.'
        );
      }
      assertPolicyEnvelope(definition, job);
      const snapshot = await readFreshPolicySnapshot(job.projectId);
      const baseline = await policy.observeProject(definition, snapshot.files, hashExactText, {
        evidence: 'overleaf_source_zip_utf8_text_sha256'
      });
      return {
        ok: true,
        changedDocument: false,
        definitionHash: await hashText(policy.definitionMaterial(definition)),
        baseline
      };
    }

    async function processPolicyVerify(job) {
      const record = requireJobPolicy(job);
      const snapshot = await readFreshPolicySnapshot(job.projectId);
      const observed = await policy.observeProject(record.definition, snapshot.files, hashExactText, {
        evidence: 'overleaf_source_zip_utf8_text_sha256'
      });
      policy.assertObservationMatches(record.definition, record.baseline, observed);
      return {
        ok: true,
        changedDocument: false,
        verified: true,
        policyHash: record.policyHash,
        observedAt: observed.capturedAt,
        observed
      };
    }

    async function processApply(job) {
      assertApprovalEvidence(job, 'apply');
      if (job.payload?.requireReviewing !== true) {
        throw bridgeError('reviewing_policy_missing', 'Approved writes must require Overleaf Reviewing/Track Changes.');
      }
      const policyBefore = await verifyJobPolicy(job);
      const filePath = requireSafePath(job.payload.path);
      const patches = normalizePatches(job.payload.patches);
      const current = await readTextFile(filePath, job.projectId);
      const beforeSha256 = await hashText(current.content);
      if (beforeSha256 !== String(job.payload.beforeSha256 || '')) {
        throw bridgeError('stale_source_hash', 'Current Overleaf content does not match the approved before SHA-256. Preview the diff again.');
      }
      validatePatchesAgainstContent(patches, current.content);
      const expectedAfter = applyPatches(current.content, patches);
      const expectedAfterSha256 = await hashText(expectedAfter);
      if (expectedAfterSha256 !== String(job.payload.afterSha256 || '')) {
        throw bridgeError('approved_patch_hash_mismatch', 'Approved patch does not produce its recorded after SHA-256.');
      }
      if (policyBefore) {
        await policy.assertProposedContentAllowed(
          policyBefore.record.definition,
          policyBefore.record.baseline,
          filePath,
          expectedAfter,
          hashExactText
        );
      }
      const reviewing = await callPageBridge('ensureReviewing', {
        waitMs: 2500,
        runProjectId: job.projectId
      });
      if (!reviewing?.ok) {
        throw bridgeError(reviewing?.code || 'reviewing_not_enabled', reviewing?.reason || 'Could not verify Overleaf Reviewing/Track Changes.');
      }
      const applyResult = await callPageBridge('applyOperations', {
        operations: [{ type: 'edit', path: filePath, patches }],
        baseFiles: [{ path: filePath, content: current.content, kind: 'text' }],
        requireReviewing: true,
        requireEditing: false,
        runProjectId: job.projectId
      });
      const appliedEntries = Array.isArray(applyResult?.applied) ? applyResult.applied : [];
      const skippedEntries = Array.isArray(applyResult?.skipped) ? applyResult.skipped : [];
      const verifiedContent = appliedEntries[0]?.result?.verifiedContent;
      const recovery = typeof verifiedContent === 'string'
        ? {
            strategy: 'tracked-reject-or-verified-restore',
            trackedChanges: normalizeTrackedChanges(applyResult.trackedChanges),
            expectedFiles: [{ path: filePath, content: current.content }],
            postFiles: [{ path: filePath, content: verifiedContent }]
          }
        : null;
      if (applyResult?.ok === false || appliedEntries.length !== 1 || skippedEntries.length || typeof verifiedContent !== 'string') {
        const error = bridgeError(
          skippedEntries[0]?.result?.code || 'write_not_verified',
          skippedEntries[0]?.result?.reason || 'Overleaf did not verify the approved write.'
        );
        error.changedDocument = appliedEntries.length > 0;
        error.recovery = recovery;
        throw error;
      }
      const actualAfterSha256 = await hashText(verifiedContent);
      if (actualAfterSha256 !== expectedAfterSha256) {
        const error = bridgeError('write_hash_mismatch', 'Overleaf readback hash differs from the approved after SHA-256.');
        error.changedDocument = true;
        error.recovery = recovery;
        throw error;
      }
      const save = await verifySave({
        filePath,
        projectId: job.projectId,
        expectedSha256: actualAfterSha256
      });
      let policyAfter = null;
      try {
        policyAfter = await verifyJobPolicy(job);
      } catch (error) {
        error.changedDocument = true;
        error.recovery = recovery;
        throw error;
      }
      if (!save.verified) {
        return {
          ok: false,
          changedDocument: true,
          path: filePath,
          beforeSha256,
          afterSha256: actualAfterSha256,
          save,
          policyEvidence: summarizePolicyEvidence(policyBefore, policyAfter),
          recovery,
          error: { code: 'save_not_verified', message: 'The approved text was written, but Overleaf save could not be verified.' }
        };
      }
      const compile = job.payload.autoCompile === false ? null : await compileProject(job.projectId, save);
      return {
        ok: true,
        changedDocument: true,
        path: filePath,
        beforeSha256,
        afterSha256: actualAfterSha256,
        reviewing: summarizeReviewing(reviewing),
        write: summarizeApplyResult(applyResult),
        save,
        policyEvidence: summarizePolicyEvidence(policyBefore, policyAfter),
        compile,
        recovery
      };
    }

    async function processCompile(job) {
      assertApprovalEvidence(job, 'compile');
      const policyBefore = await verifyJobPolicy(job);
      const compile = await compileProject(job.projectId);
      return {
        ok: compile.triggerOk === true,
        changedDocument: false,
        policyEvidence: summarizePolicyEvidence(policyBefore, null),
        compile,
        error: compile.triggerOk === true ? null : { code: compile.code || 'compile_failed', message: compile.reason || 'Overleaf compile failed.' }
      };
    }

    async function processUndo(job) {
      assertApprovalEvidence(job, 'undo');
      const policyBefore = await verifyJobPolicy(job);
      const filePath = requireSafePath(job.payload?.path);
      const current = await readTextFile(filePath, job.projectId);
      const currentSha256 = await hashText(current.content);
      if (currentSha256 !== String(job.payload?.expectedCurrentSha256 || '')) {
        throw bridgeError('undo_stale_source_hash', 'Current Overleaf content no longer matches the write receipt; undo was not attempted.');
      }
      const recovery = normalizeRecovery(job.payload?.recovery, filePath);
      const result = await callPageBridge('rejectTrackedChanges', {
        trackedChanges: recovery.trackedChanges,
        expectedFiles: recovery.expectedFiles,
        postFiles: recovery.postFiles,
        runProjectId: job.projectId
      });
      const expectedRestoredSha256 = String(job.payload?.expectedRestoredSha256 || '');
      const save = result?.ok === false ? null : await verifySave({
        filePath,
        projectId: job.projectId,
        expectedSha256: expectedRestoredSha256
      });
      const restoredSha256 = String(save?.observedSha256 || '');
      const restoredOk = result?.ok !== false && save?.contentMatched === true;
      let policyAfter = null;
      let policyErrorResult = null;
      const changedDocument = Array.isArray(result?.applied) && result.applied.length > 0;
      if (changedDocument) {
        try {
          policyAfter = await verifyJobPolicy(job);
        } catch (error) {
          policyErrorResult = {
            code: String(error?.code || 'project_policy_verification_failed'),
            message: String(error?.message || error).slice(0, 1000),
            details: error?.details
          };
        }
      }
      const compile = restoredOk && save?.verified === true && !policyErrorResult && job.payload.autoCompile !== false
        ? await compileProject(job.projectId, save)
        : null;
      return {
        ok: restoredOk && save?.verified === true && !policyErrorResult,
        changedDocument,
        path: filePath,
        restoredSha256,
        expectedRestoredSha256,
        undo: summarizeApplyResult(result),
        save,
        policyEvidence: summarizePolicyEvidence(policyBefore, policyAfter),
        compile,
        error: policyErrorResult || (restoredOk
          ? save?.verified === true ? null : { code: 'undo_save_not_verified', message: 'Undo content matched, but Overleaf save was not verified.' }
          : { code: 'undo_not_verified', message: firstFailureReason(result) || 'Undo did not restore the receipt before SHA-256.' })
      };
    }

    async function verifyJobPolicy(job) {
      const record = requireJobPolicy(job);
      if (!record) return null;
      const definitionHash = await hashText(policy.definitionMaterial(record.definition));
      const policyHash = await hashText(policy.policyMaterial(record.definition, record.baseline));
      if (definitionHash !== record.definitionHash || policyHash !== record.policyHash ||
          String(job.payload?.policyHash || '') !== record.policyHash) {
        throw bridgeError('project_policy_payload_hash_mismatch', 'Job policy payload does not match its recorded hashes.');
      }
      const snapshot = await readFreshPolicySnapshot(job.projectId);
      const observed = await policy.observeProject(record.definition, snapshot.files, hashExactText, {
        evidence: 'overleaf_source_zip_utf8_text_sha256'
      });
      policy.assertObservationMatches(record.definition, record.baseline, observed);
      return { record, observed };
    }

    function requireJobPolicy(job) {
      requirePolicyModule();
      const raw = job.payload?.policy;
      if (!raw) {
        if (job.scope === 'production') {
          throw bridgeError('project_policy_not_registered', 'Production job has no verified project-policy record.');
        }
        return null;
      }
      const record = policy.normalizePolicyRecord(raw);
      assertPolicyEnvelope(record.definition, job);
      return record;
    }

    function assertPolicyEnvelope(definition, job) {
      if (definition.projectId !== job.projectId || definition.scope !== job.scope) {
        throw bridgeError('project_policy_scope_mismatch', 'Project policy does not match the active job project and scope.');
      }
    }

    function requirePolicyModule() {
      if (!policy || typeof policy.observeProject !== 'function') {
        throw bridgeError('project_policy_module_missing', 'Approved bridge policy module is unavailable; mutation is blocked.');
      }
    }

    async function readFreshPolicySnapshot(projectId) {
      const project = await callPageBridge('getProjectSnapshot', {
        force: true,
        maxAgeMs: 0,
        preferLightweight: false,
        allowZipFallback: true,
        allowEditorNavigation: false,
        requireFullProject: true,
        restrictToRequestedPathsOnly: false,
        includeBinaryFiles: false,
        includeContent: true,
        zipTimeoutMs: 60_000,
        runProjectId: projectId
      });
      if (project?.ok === false || project?.capabilities?.method !== 'overleaf-zip') {
        throw bridgeError(
          'policy_source_zip_unavailable',
          project?.reason || project?.error || 'A fresh full Overleaf source ZIP is required for project-policy verification.'
        );
      }
      const files = (Array.isArray(project?.files) ? project.files : [])
        .filter(file => file && typeof file.content === 'string')
        .map(file => ({ path: requireSafePath(file.path), content: String(file.content) }));
      if (!files.length) {
        throw bridgeError('policy_source_zip_empty', 'Fresh Overleaf source ZIP contained no readable text files.');
      }
      return { files, evidence: 'overleaf_source_zip_utf8_text_sha256' };
    }

    function summarizePolicyEvidence(before, after) {
      if (!before && !after) return null;
      const source = after || before;
      return {
        policyHash: source.record.policyHash,
        definitionHash: source.record.definitionHash,
        beforeObservedAt: before?.observed?.capturedAt || '',
        afterObservedAt: after?.observed?.capturedAt || '',
        beforeSourceTreeSha256: before?.observed?.sourceTreeSha256 || '',
        afterSourceTreeSha256: after?.observed?.sourceTreeSha256 || '',
        mainStructureFingerprint: source.observed.mainStructureFingerprint,
        protectedPathSetSha256: source.observed.protectedPathSetSha256,
        allowedPreambleDirectives: source.record.definition.allowedPreambleDirectives
      };
    }

    async function readTextFile(filePathValue, projectId) {
      const filePath = requireSafePath(filePathValue);
      const project = await callPageBridge('getProjectSnapshot', {
        force: true,
        preferLightweight: false,
        allowZipFallback: true,
        allowEditorNavigation: true,
        requireFullProject: true,
        includeBinaryFiles: false,
        includeContent: true,
        zipTimeoutMs: 60_000,
        runProjectId: projectId
      });
      if (project?.ok === false) {
        throw bridgeError(project.code || 'project_snapshot_failed', project.reason || project.error || 'Could not read Overleaf project snapshot.');
      }
      const file = (Array.isArray(project?.files) ? project.files : []).find(item => item?.path === filePath);
      if (!file || typeof file.content !== 'string') {
        throw bridgeError('target_file_not_readable', `Could not read text content for ${filePath}.`);
      }
      return { path: filePath, content: normalizeText(file.content) };
    }

    async function verifySave({ filePath, projectId, expectedSha256 } = {}) {
      const indicator = await callPageBridge('waitForSaveState', {
        deadlineMs: 7000,
        pollIntervalMs: 100,
        requirePositiveSignal: true,
        allowQuietEditorFallback: false
      });
      const persisted = await waitForServerTextHash(filePath, projectId, expectedSha256);
      if (persisted.matched) {
        return {
          verified: true,
          contentMatched: true,
          state: 'verified_server_snapshot',
          evidence: 'overleaf_source_zip_sha256',
          indicatorState: String(indicator?.state || 'unavailable'),
          observedSha256: persisted.observedSha256,
          attempts: persisted.attempts,
          reason: ''
        };
      }
      return {
        verified: false,
        contentMatched: false,
        state: persisted.state || String(indicator?.state || 'unavailable'),
        evidence: persisted.evidence || '',
        indicatorState: String(indicator?.state || 'unavailable'),
        observedSha256: String(persisted.observedSha256 || ''),
        attempts: persisted.attempts,
        reason: [
          String(indicator?.reason || ''),
          String(persisted.reason || '')
        ].filter(Boolean).join(' ').slice(0, 1000)
      };
    }

    async function waitForServerTextHash(filePath, projectId, expectedSha256) {
      let lastObservedSha256 = '';
      let lastReason = '';
      const attempts = 3;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const snapshot = await readServerTextFile(filePath, projectId);
          lastObservedSha256 = await hashText(snapshot.content);
          if (lastObservedSha256 === String(expectedSha256 || '')) {
            return {
              matched: true,
              state: 'verified_server_snapshot',
              evidence: snapshot.source,
              observedSha256: lastObservedSha256,
              attempts: attempt
            };
          }
          lastReason = 'Overleaf source ZIP still contains a different file SHA-256.';
        } catch (error) {
          lastReason = String(error?.message || error || 'Overleaf source ZIP verification failed.');
        }
        if (attempt < attempts) await sleep(500 * attempt);
      }
      return {
        matched: false,
        state: lastObservedSha256 ? 'server_snapshot_mismatch' : 'server_snapshot_unavailable',
        evidence: 'overleaf_source_zip_sha256',
        observedSha256: lastObservedSha256,
        attempts,
        reason: lastReason
      };
    }

    async function readServerTextFile(filePathValue, projectId) {
      const filePath = requireSafePath(filePathValue);
      const project = await callPageBridge('getProjectSnapshot', {
        force: true,
        maxAgeMs: 0,
        preferLightweight: false,
        allowZipFallback: true,
        allowEditorNavigation: false,
        requireFullProject: false,
        restrictToRequestedPathsOnly: true,
        focusFiles: [filePath],
        includeBinaryFiles: false,
        includeContent: true,
        zipTimeoutMs: 10_000,
        runProjectId: projectId
      });
      if (project?.ok === false || project?.capabilities?.method !== 'overleaf-zip') {
        throw bridgeError(
          'server_snapshot_unavailable',
          project?.reason || project?.error || 'A fresh Overleaf source ZIP was unavailable for save verification.'
        );
      }
      const file = (Array.isArray(project?.files) ? project.files : []).find(item => item?.path === filePath);
      if (!file || typeof file.content !== 'string') {
        throw bridgeError('server_snapshot_file_missing', `The fresh Overleaf source ZIP did not contain readable text for ${filePath}.`);
      }
      return { path: filePath, content: normalizeText(file.content), source: 'overleaf_source_zip_sha256' };
    }

    async function compileProject(projectId, saveEvidence = null) {
      const preverifiedSave = saveEvidence?.verified === true;
      const trigger = await callPageBridge('triggerCompile', {
        preferUiClick: true,
        waitForSaveMs: preverifiedSave ? 0 : 5000,
        requireVerifiedSave: !preverifiedSave,
        runProjectId: projectId
      });
      let log = null;
      if (trigger?.ok) {
        log = await callPageBridge('getCompileLog', {
          triggerIfStale: false,
          maxAgeMs: 60_000,
          waitForSaveMs: 0,
          runProjectId: projectId
        });
      }
      return {
        triggerOk: trigger?.ok === true,
        status: String(trigger?.compile?.status || (trigger?.ok ? 'triggered' : 'failed')),
        code: String(trigger?.code || ''),
        reason: String(trigger?.reason || trigger?.error || '').slice(0, 1000),
        logAvailable: log?.ok === true,
        compiledAt: String(log?.compiledAt || ''),
        fresh: log?.fresh === true,
        errors: compactDiagnostics(log?.errors),
        warnings: compactDiagnostics(log?.warnings),
        preverifiedSaveState: preverifiedSave ? String(saveEvidence.state || '') : ''
      };
    }

    function validateJobEnvelope(job, activeProjectId) {
      if (!job || typeof job !== 'object' || !job.id || !job.claimToken) {
        throw bridgeError('invalid_job', 'Approved bridge job envelope is invalid.');
      }
      if (String(job.projectId || '') !== String(activeProjectId || '')) {
        throw bridgeError('active_project_mismatch', 'Job is not addressed to the active Overleaf project.');
      }
      if (!['test', 'production'].includes(job.scope)) {
        throw bridgeError('invalid_scope', 'Approved bridge job scope is invalid.');
      }
    }

    function assertApprovalEvidence(job, action) {
      const actual = String(job.approvalEvidence?.exactPhrase || '');
      const accepted = job.scope === 'test'
        ? [TEST_APPROVAL_PHRASE]
        : action === 'undo'
          ? [PRODUCTION_UNDO_PHRASE, LEGACY_PRODUCTION_UNDO_PHRASE]
          : [PRODUCTION_WRITE_PHRASE, TEST_APPROVAL_PHRASE, LEGACY_PRODUCTION_WRITE_PHRASE];
      if (!accepted.includes(actual)) {
        throw bridgeError('approval_evidence_mismatch', 'Job does not contain an explicit approval for the displayed change.');
      }
      if (action === 'apply' && !job.approvalId) {
        throw bridgeError('approval_id_missing', 'Approved write job has no one-time preview approval ID.');
      }
    }

    function requireSafePath(value) {
      const pathValue = typeof normalizeSafeProjectPath === 'function'
        ? normalizeSafeProjectPath(value)
        : fallbackSafePath(value);
      if (!pathValue || pathValue !== String(value || '').replace(/^\/+|\/+$/g, '')) {
        throw bridgeError('invalid_project_path', 'Approved bridge path is not a safe project-relative path.');
      }
      return pathValue;
    }

    function normalizePatches(value) {
      if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
        throw bridgeError('invalid_patches', 'Approved bridge requires 1 to 64 exact text patches.');
      }
      const patches = value.map(item => {
        const from = Number(item?.from);
        const to = Number(item?.to);
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) {
          throw bridgeError('invalid_patch_range', 'Patch range is invalid.');
        }
        return { from, to, expected: String(item.expected ?? ''), insert: String(item.insert ?? '') };
      }).sort((left, right) => left.from - right.from);
      for (let index = 1; index < patches.length; index += 1) {
        if (patches[index].from < patches[index - 1].to) throw bridgeError('overlapping_patches', 'Patch ranges overlap.');
      }
      return patches;
    }

    function validatePatchesAgainstContent(patches, content) {
      for (const patch of patches) {
        if (patch.to > content.length || content.slice(patch.from, patch.to) !== patch.expected) {
          throw bridgeError('stale_patch_range', 'An approved patch range no longer matches current Overleaf content.');
        }
      }
    }

    function applyPatches(content, patches) {
      let output = content;
      for (let index = patches.length - 1; index >= 0; index -= 1) {
        const patch = patches[index];
        output = output.slice(0, patch.from) + patch.insert + output.slice(patch.to);
      }
      return output;
    }

    async function hashText(value) {
      const bytes = new TextEncoder().encode(normalizeText(value));
      const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function hashExactText(value) {
      const bytes = new TextEncoder().encode(String(value ?? ''));
      const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function normalizeRecovery(value, filePath) {
      const expectedFiles = Array.isArray(value?.expectedFiles) ? value.expectedFiles : [];
      const postFiles = Array.isArray(value?.postFiles) ? value.postFiles : [];
      if (expectedFiles.length !== 1 || postFiles.length !== 1 ||
          expectedFiles[0]?.path !== filePath || typeof expectedFiles[0]?.content !== 'string' ||
          postFiles[0]?.path !== filePath || typeof postFiles[0]?.content !== 'string') {
        throw bridgeError('invalid_recovery_plan', 'Receipt recovery plan must contain only the verified before/post text for its one approved file.');
      }
      const trackedChanges = normalizeTrackedChanges(value?.trackedChanges);
      if (trackedChanges.some(item => item.path && item.path !== filePath)) {
        throw bridgeError('invalid_recovery_plan', 'Receipt recovery references a file outside the one-file approval.');
      }
      return {
        trackedChanges,
        expectedFiles: expectedFiles.map(file => ({ path: requireSafePath(file.path), content: normalizeText(file.content) })),
        postFiles: postFiles.map(file => ({ path: requireSafePath(file.path), content: normalizeText(file.content) }))
      };
    }

    function normalizeTrackedChanges(value) {
      if (!Array.isArray(value)) return [];
      return value.slice(0, 500).filter(item => item && typeof item === 'object').map(item => ({
        key: String(item.key || '').slice(0, 500),
        id: String(item.id || '').slice(0, 500),
        path: item.path ? requireSafePath(item.path) : '',
        label: String(item.label || '').slice(0, 500)
      })).filter(item => item.key);
    }

    function summarizeApplyResult(result) {
      const applied = Array.isArray(result?.applied) ? result.applied : [];
      const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
      return {
        ok: result?.ok !== false,
        appliedCount: applied.length,
        skippedCount: skipped.length,
        trackedChangeCount: Array.isArray(result?.trackedChanges) ? result.trackedChanges.length : 0,
        failures: skipped.slice(0, 10).map(item => ({
          code: String(item?.result?.code || ''),
          reason: String(item?.result?.reason || '').slice(0, 500),
          path: String(item?.operation?.path || item?.trackedChange?.path || '').slice(0, 500)
        }))
      };
    }

    function summarizeReviewing(value) {
      return {
        ok: value?.ok === true,
        activated: value?.activated === true,
        status: String(value?.reviewing?.status || value?.status || '')
      };
    }

    function firstFailureReason(result) {
      const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
      return String(skipped[0]?.result?.reason || result?.reason || '').slice(0, 1000);
    }

    function compactDiagnostics(values) {
      return (Array.isArray(values) ? values : []).slice(0, 20).map(value =>
        String(value?.message || value || '').replace(/\s+/g, ' ').trim().slice(0, 500)
      ).filter(Boolean);
    }

    function normalizeText(value) {
      return String(value ?? '').replace(/\r\n/g, '\n');
    }

    function fallbackSafePath(value) {
      const text = String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
      return text && !text.split('/').some(part => !part || part === '.' || part === '..') ? text : '';
    }

    return { pollOnce, processJob, start, stop };
  }

  function bridgeError(code, message, details) {
    const error = new Error(message);
    error.code = code;
    if (details) error.details = details;
    return error;
  }

  return { create };
});
