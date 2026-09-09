const assert = require('node:assert/strict');
const test = require('node:test');
const { webcrypto } = require('node:crypto');

const Controller = require('../extension/src/content/approvedBridgeController');
const Policy = require('../extension/src/shared/approvedBridgePolicy');
const Store = require('../native-host/src/approvedBridgeStore');

const projectId = '1234567890abcdef12345678';

function policyDefinition(scope = 'test', overrides = {}) {
  return Policy.normalizeDefinition({
    projectId,
    scope,
    policyName: 'ICASSP protected template',
    policyRevision: '1',
    policySourceSha256: 'a'.repeat(64),
    mainDocument: 'Template.tex',
    editablePathPatterns: ['Template.tex', 'sections/**/*.tex', 'refs.bib'],
    protectedPaths: ['spconf.sty'],
    protectedPathPatterns: ['**/*.cls', '**/*.sty', '**/*.bst'],
    mutablePreambleCommands: ['title', 'author'],
    integrityErrorCode: 'icassp2027_template_integrity_violation',
    ...overrides
  });
}

function paperMain(title = 'Old', body = 'Body.', extraPreamble = '') {
  return `\\documentclass{article}\n${extraPreamble}\\title{${title}}\n\\begin{document}\n\\maketitle\n${body}\n\\end{document}\n`;
}

async function policyRecord(scope = 'test', overrides = {}) {
  const definition = policyDefinition(scope, overrides);
  const baseline = await Policy.observeProject(definition, [
    { path: 'Template.tex', content: paperMain() },
    { path: 'spconf.sty', content: 'style-v1\n' }
  ], Store.hashExactText, { evidence: 'overleaf_source_zip_utf8_text_sha256' });
  const definitionHash = Store.hashText(Policy.definitionMaterial(definition));
  const policyHash = Store.hashText(Policy.policyMaterial(definition, baseline));
  return {
    schemaVersion: Policy.POLICY_SCHEMA_VERSION,
    status: 'verified',
    definition,
    baseline,
    definitionHash,
    policyHash,
    registeredAt: '2026-09-09T00:00:00.000Z',
    lastVerifiedAt: '2026-09-09T00:00:00.000Z'
  };
}

function buildController(overrides = {}) {
  const calls = [];
  const before = overrides.before || 'alpha beta\n';
  const after = overrides.after || 'alpha gamma\n';
  const patches = Store.computeSingleTextPatch(before, after);
  const callPageBridge = async (method, params) => {
    calls.push({ method, params });
    if (method === 'getProjectSnapshot') {
      const content = typeof overrides.snapshotContent === 'function'
        ? overrides.snapshotContent({ calls, before, after, params })
        : calls.some(call => call.method === 'applyOperations') ? after : before;
      const files = [{ path: 'Template.tex', kind: 'text', content, source: 'overleaf-zip' }];
      for (const file of overrides.extraFiles || []) files.push({ ...file, kind: 'text', source: 'overleaf-zip' });
      return {
        ok: true,
        capabilities: { method: overrides.snapshotMethod || 'overleaf-zip' },
        files
      };
    }
    if (method === 'ensureReviewing') return { ok: true, activated: false, reviewing: { status: 'reviewing' } };
    if (method === 'applyOperations') {
      return overrides.applyResult || {
        ok: true,
        applied: [{ operation: params.operations[0], result: { verifiedContent: after } }],
        skipped: [],
        trackedChanges: [{ key: 'tracked-1', path: 'Template.tex' }]
      };
    }
    if (method === 'waitForSaveState') return overrides.saveState || { ok: true, state: 'verified_saved' };
    if (method === 'triggerCompile') return { ok: true, compile: { status: 'success' } };
    if (method === 'getCompileLog') return { ok: true, errors: [], warnings: [], fresh: true, compiledAt: '2026-09-08T00:00:00.000Z' };
    throw new Error(`Unexpected page method: ${method}`);
  };
  const controller = Controller.create({
    sendBackgroundNative: async () => ({ ok: true, result: {} }),
    callPageBridge,
    getCurrentProjectId: () => projectId,
    normalizeSafeProjectPath: overrides.normalizeSafeProjectPath || (value => {
      const text = String(value || '');
      return text && !text.startsWith('/') && !text.split('/').some(part => !part || part === '.' || part === '..') ? text : '';
    }),
    crypto: webcrypto,
    sleep: async () => {},
    setTimeout,
    clearTimeout
  });
  const job = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    claimToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    action: 'apply',
    scope: 'test',
    projectId,
    approvalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    approvalEvidence: { exactPhrase: Store.TEST_APPROVAL_PHRASE },
    payload: {
      path: 'Template.tex',
      beforeSha256: Store.hashText(before),
      afterSha256: Store.hashText(after),
      patches,
      requireReviewing: true,
      autoCompile: true
    }
  };
  return { controller, calls, job };
}

test('approved controller verifies hash and Reviewing before one-file write, save, and compile', async () => {
  const { controller, calls, job } = buildController();
  const result = await controller.processJob(job, projectId);
  assert.equal(result.ok, true);
  assert.equal(result.changedDocument, true);
  assert.equal(result.afterSha256, job.payload.afterSha256);
  assert.equal(result.save.verified, true);
  assert.equal(result.compile.status, 'success');
  assert.equal(result.recovery.expectedFiles[0].content, 'alpha beta\n');
  assert.deepEqual(calls.map(call => call.method), [
    'getProjectSnapshot',
    'ensureReviewing',
    'applyOperations',
    'waitForSaveState',
    'getProjectSnapshot',
    'triggerCompile',
    'getCompileLog'
  ]);
  const write = calls.find(call => call.method === 'applyOperations');
  assert.equal(write.params.requireReviewing, true);
  assert.equal(write.params.runProjectId, projectId);
  assert.equal(write.params.operations.length, 1);
  const compile = calls.find(call => call.method === 'triggerCompile');
  assert.equal(compile.params.requireVerifiedSave, false);
  assert.equal(result.save.state, 'verified_server_snapshot');
  assert.equal(result.compile.preverifiedSaveState, 'verified_server_snapshot');
});

test('approved controller verifies save from a fresh Overleaf source ZIP when the UI indicator is absent', async () => {
  const { controller, calls, job } = buildController({
    saveState: {
      ok: false,
      state: 'unknown_timeout',
      reason: 'Overleaf save indicator was not found.'
    }
  });

  const result = await controller.processJob(job, projectId);

  assert.equal(result.ok, true);
  assert.equal(result.save.verified, true);
  assert.equal(result.save.contentMatched, true);
  assert.equal(result.save.evidence, 'overleaf_source_zip_sha256');
  assert.equal(result.save.indicatorState, 'unknown_timeout');
  assert.equal(calls.filter(call => call.method === 'getProjectSnapshot').length, 2);
});

test('approved controller blocks compile when the fresh Overleaf source ZIP does not contain the approved hash', async () => {
  const { controller, calls, job } = buildController({
    snapshotContent: ({ before }) => before,
    saveState: {
      ok: false,
      state: 'unknown_timeout',
      reason: 'Overleaf save indicator was not found.'
    }
  });

  const result = await controller.processJob(job, projectId);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'save_not_verified');
  assert.equal(result.save.verified, false);
  assert.equal(result.save.state, 'server_snapshot_mismatch');
  assert.equal(result.save.attempts, 3);
  assert.equal(calls.some(call => call.method === 'triggerCompile'), false);
});

test('approved controller does not treat an editor fallback as server save evidence', async () => {
  const { controller, calls, job } = buildController({
    snapshotMethod: 'active-editor',
    saveState: {
      ok: false,
      state: 'unknown_timeout',
      reason: 'Overleaf save indicator was not found.'
    }
  });

  const result = await controller.processJob(job, projectId);

  assert.equal(result.ok, false);
  assert.equal(result.save.verified, false);
  assert.equal(result.save.state, 'server_snapshot_unavailable');
  assert.equal(calls.some(call => call.method === 'triggerCompile'), false);
});

test('stale before hash blocks before Reviewing or write dispatch', async () => {
  const { controller, calls, job } = buildController();
  job.payload.beforeSha256 = Store.hashText('different');
  await assert.rejects(() => controller.processJob(job, projectId), error => error.code === 'stale_source_hash');
  assert.deepEqual(calls.map(call => call.method), ['getProjectSnapshot']);
});

test('production job without an explicit concise or legacy approval fails before any page call', async () => {
  const { controller, calls, job } = buildController();
  job.scope = 'production';
  job.approvalEvidence.exactPhrase = '확정';
  await assert.rejects(() => controller.processJob(job, projectId), error => error.code === 'approval_evidence_mismatch');
  assert.equal(calls.length, 0);
});

test('a partially reported write failure preserves exact recovery evidence', async () => {
  const { controller, job } = buildController({
    applyResult: {
      ok: false,
      applied: [{ operation: { type: 'edit', path: 'Template.tex' }, result: { verifiedContent: 'alpha gamma\n' } }],
      skipped: [{ operation: { type: 'edit', path: 'Template.tex' }, result: { code: 'write_uncertain', reason: 'simulated uncertainty' } }],
      trackedChanges: [{ key: 'tracked-1', path: 'Template.tex' }]
    }
  });
  await assert.rejects(() => controller.processJob(job, projectId), error => {
    assert.equal(error.code, 'write_uncertain');
    assert.equal(error.changedDocument, true);
    assert.equal(error.recovery.expectedFiles[0].content, 'alpha beta\n');
    assert.equal(error.recovery.postFiles[0].content, 'alpha gamma\n');
    return true;
  });
});

test('undo rejects recovery evidence that reaches beyond the approved file', async () => {
  const { controller, calls } = buildController({ normalizeSafeProjectPath: value => value });
  const undoJob = {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    claimToken: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    action: 'undo',
    scope: 'test',
    projectId,
    approvalEvidence: { exactPhrase: Store.TEST_APPROVAL_PHRASE },
    payload: {
      path: 'Template.tex',
      expectedCurrentSha256: Store.hashText('alpha beta\n'),
      expectedRestoredSha256: Store.hashText('original\n'),
      recovery: {
        trackedChanges: [{ key: 'tracked-other', path: 'Other.tex' }],
        expectedFiles: [{ path: 'Template.tex', content: 'original\n' }],
        postFiles: [{ path: 'Template.tex', content: 'alpha beta\n' }]
      }
    }
  };
  await assert.rejects(() => controller.processJob(undoJob, projectId), error => error.code === 'invalid_recovery_plan');
  assert.deepEqual(calls.map(call => call.method), ['getProjectSnapshot']);
});

test('undo waits for the original SHA-256 in a fresh Overleaf source ZIP', async () => {
  const before = 'alpha beta\n';
  const after = 'alpha gamma\n';
  const calls = [];
  let serverContent = after;
  const callPageBridge = async (method, params) => {
    calls.push({ method, params });
    if (method === 'getProjectSnapshot') {
      return {
        ok: true,
        capabilities: { method: 'overleaf-zip' },
        files: [{ path: 'Template.tex', kind: 'text', content: serverContent, source: 'overleaf-zip' }]
      };
    }
    if (method === 'rejectTrackedChanges') {
      serverContent = before;
      return {
        ok: true,
        applied: [{ trackedChange: { key: 'tracked-1', path: 'Template.tex' }, result: { ok: true } }],
        skipped: [],
        trackedChanges: []
      };
    }
    if (method === 'waitForSaveState') {
      return { ok: false, state: 'unknown_timeout', reason: 'Overleaf save indicator was not found.' };
    }
    throw new Error(`Unexpected page method: ${method}`);
  };
  const controller = Controller.create({
    sendBackgroundNative: async () => ({ ok: true, result: {} }),
    callPageBridge,
    getCurrentProjectId: () => projectId,
    normalizeSafeProjectPath: value => value === 'Template.tex' ? value : '',
    crypto: webcrypto,
    sleep: async () => {},
    setTimeout,
    clearTimeout
  });
  const job = {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    claimToken: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    action: 'undo',
    scope: 'test',
    projectId,
    approvalEvidence: { exactPhrase: Store.TEST_APPROVAL_PHRASE },
    payload: {
      path: 'Template.tex',
      expectedCurrentSha256: Store.hashText(after),
      expectedRestoredSha256: Store.hashText(before),
      autoCompile: false,
      recovery: {
        trackedChanges: [{ key: 'tracked-1', path: 'Template.tex' }],
        expectedFiles: [{ path: 'Template.tex', content: before }],
        postFiles: [{ path: 'Template.tex', content: after }]
      }
    }
  };

  const result = await controller.processJob(job, projectId);

  assert.equal(result.ok, true);
  assert.equal(result.restoredSha256, Store.hashText(before));
  assert.equal(result.save.state, 'verified_server_snapshot');
  assert.deepEqual(calls.map(call => call.method), [
    'getProjectSnapshot',
    'rejectTrackedChanges',
    'waitForSaveState',
    'getProjectSnapshot'
  ]);
});

test('policy registration captures hashes only from a fresh full Overleaf source ZIP', async () => {
  const before = paperMain();
  const { controller, calls, job } = buildController({
    before,
    after: paperMain('New'),
    extraFiles: [{ path: 'spconf.sty', content: 'style-v1\n' }]
  });
  job.action = 'policy-register';
  job.approvalId = '';
  job.approvalEvidence = { exactPhrase: Store.POLICY_REGISTRATION_PHRASE };
  job.payload = { definition: policyDefinition('test') };

  const result = await controller.processJob(job, projectId);

  assert.equal(result.ok, true);
  assert.equal(result.changedDocument, false);
  assert.equal(result.baseline.evidence, 'overleaf_source_zip_utf8_text_sha256');
  assert.equal(result.baseline.protectedFiles[0].path, 'spconf.sty');
  assert.equal(result.baseline.mainStructureFingerprint.length, 64);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'getProjectSnapshot');
  assert.equal(calls[0].params.maxAgeMs, 0);
  assert.equal(calls[0].params.requireFullProject, true);
  assert.equal(calls[0].params.allowEditorNavigation, false);
});

test('policy registration rejects an external-module allowlist without its second approval', async () => {
  const before = paperMain();
  const { controller, calls, job } = buildController({
    before,
    after: paperMain('New'),
    extraFiles: [{ path: 'spconf.sty', content: 'style-v1\n' }]
  });
  job.action = 'policy-register';
  job.approvalId = '';
  job.approvalEvidence = { exactPhrase: Store.POLICY_REGISTRATION_PHRASE };
  job.payload = {
    definition: policyDefinition('test', {
      allowedPreambleDirectives: ['\\usepackage{CJKutf8}']
    })
  };

  await assert.rejects(
    () => controller.processJob(job, projectId),
    error => error.code === 'external_module_policy_approval_mismatch'
  );
  assert.equal(calls.length, 0);
});

test('changed protected style file blocks an approved write before Reviewing', async () => {
  const record = await policyRecord('test');
  const before = paperMain();
  const after = paperMain('New');
  const { controller, calls, job } = buildController({
    before,
    after,
    extraFiles: [{ path: 'spconf.sty', content: 'tampered-style\n' }]
  });
  job.payload.policy = record;
  job.payload.policyHash = record.policyHash;

  await assert.rejects(
    () => controller.processJob(job, projectId),
    error => error.code === 'icassp2027_template_integrity_violation' &&
      error.details.violations.some(item => item.kind === 'protected_file_changed')
  );
  assert.deepEqual(calls.map(call => call.method), ['getProjectSnapshot']);
});

test('proposed preamble change blocks before Reviewing even when current baseline is intact', async () => {
  const record = await policyRecord('test');
  const before = paperMain();
  const after = paperMain('New', 'Body.', '\\usepackage{geometry}\n');
  const { controller, calls, job } = buildController({
    before,
    after,
    extraFiles: [{ path: 'spconf.sty', content: 'style-v1\n' }]
  });
  job.payload.policy = record;
  job.payload.policyHash = record.policyHash;

  await assert.rejects(
    () => controller.processJob(job, projectId),
    error => error.code === 'icassp2027_template_integrity_violation' &&
      error.details.reason === 'proposed_main_structure_changed'
  );
  assert.deepEqual(calls.map(call => call.method), ['getProjectSnapshot', 'getProjectSnapshot']);
});

test('an exactly allowlisted package addition passes policy checks before and after write', async () => {
  const record = await policyRecord('test', {
    allowedPreambleDirectives: ['\\usepackage{CJKutf8}']
  });
  const before = paperMain();
  const after = paperMain('New', 'Body.', '\\usepackage{CJKutf8}\n');
  const { controller, calls, job } = buildController({
    before,
    after,
    extraFiles: [{ path: 'spconf.sty', content: 'style-v1\n' }]
  });
  job.payload.policy = record;
  job.payload.policyHash = record.policyHash;

  const result = await controller.processJob(job, projectId);

  assert.equal(result.ok, true);
  assert.equal(result.policyEvidence.policyHash, record.policyHash);
  assert.deepEqual(result.policyEvidence.allowedPreambleDirectives, ['\\usepackage{CJKutf8}']);
  assert.equal(calls.some(call => call.method === 'ensureReviewing'), true);
  assert.equal(calls.some(call => call.method === 'triggerCompile'), true);
});

test('author-content edit passes policy checks before and after write', async () => {
  const record = await policyRecord('test');
  const before = paperMain();
  const after = paperMain('New title', 'Rewritten paper body.');
  const { controller, calls, job } = buildController({
    before,
    after,
    extraFiles: [{ path: 'spconf.sty', content: 'style-v1\n' }]
  });
  job.payload.policy = record;
  job.payload.policyHash = record.policyHash;

  const result = await controller.processJob(job, projectId);

  assert.equal(result.ok, true);
  assert.equal(result.policyEvidence.policyHash, record.policyHash);
  assert.ok(result.policyEvidence.beforeObservedAt);
  assert.ok(result.policyEvidence.afterObservedAt);
  assert.equal(calls.filter(call => call.method === 'getProjectSnapshot').length, 4);
  assert.ok(calls.findIndex(call => call.method === 'ensureReviewing') > calls.findIndex(call => call.method === 'getProjectSnapshot'));
});
