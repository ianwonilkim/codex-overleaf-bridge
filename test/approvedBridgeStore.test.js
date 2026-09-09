const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const Store = require('../native-host/src/approvedBridgeStore');
const Policy = require('../extension/src/shared/approvedBridgePolicy');
const { handleRequest } = require('../native-host/src/taskRunnerRuntime');

function fixture() {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-overleaf-store-'));
  const testProjectId = '1234567890abcdef12345678';
  Store.initializeState({ stateDir, config: { testProjectId } });
  return { stateDir, testProjectId };
}

function policyDefinition(projectId, scope = 'production') {
  return {
    projectId,
    scope,
    policyName: 'Protected paper template',
    policyRevision: '1',
    policySourceSha256: 'a'.repeat(64),
    mainDocument: 'Template.tex',
    editablePathPatterns: ['Template.tex', 'sections/**/*.tex', 'refs.bib'],
    protectedPaths: ['spconf.sty'],
    protectedPathPatterns: ['**/*.cls', '**/*.sty', '**/*.bst'],
    mutablePreambleCommands: ['title', 'author'],
    integrityErrorCode: 'paper_template_integrity_violation'
  };
}

function paperMain(title = 'Old', body = 'Body.') {
  return `\\documentclass{article}\n\\title{${title}}\n\\begin{document}\n\\maketitle\n${body}\n\\end{document}\n`;
}

async function registerPolicy(stateDir, projectId, scope = 'production', options = {}) {
  const definition = Policy.normalizeDefinition({
    ...policyDefinition(projectId, scope),
    allowedPreambleDirectives: options.allowedPreambleDirectives || []
  });
  const baseline = await Policy.observeProject(definition, [
    { path: 'Template.tex', content: options.mainContent || paperMain() },
    { path: 'spconf.sty', content: options.styleContent || 'style-v1\n' },
    { path: 'refs.bib', content: '@article{x}\n' }
  ], Store.hashExactText, { evidence: 'overleaf_source_zip_utf8_text_sha256' });
  const queued = Store.enqueuePolicyRegistration(stateDir, {
    scope,
    projectId,
    definition,
    approvalText: Store.POLICY_REGISTRATION_PHRASE,
    externalModuleApprovalText: definition.allowedPreambleDirectives.length
      ? Store.EXTERNAL_MODULE_POLICY_APPROVAL_PHRASE
      : undefined
  });
  const claimed = Store.claimNextJob(stateDir, { projectId });
  const completed = Store.completeJob(stateDir, {
    jobId: queued.id,
    claimToken: claimed.claimToken,
    projectId,
    result: {
      ok: true,
      changedDocument: false,
      definitionHash: Store.hashText(Policy.definitionMaterial(definition)),
      baseline
    }
  });
  assert.equal(completed.result.ok, true);
  return Store.getPolicyForProject(stateDir, scope, projectId, { required: true });
}

test('external-module policy registration requires a second exact user approval', async () => {
  const { stateDir, testProjectId } = fixture();
  const definition = {
    ...policyDefinition(testProjectId, 'test'),
    allowedPreambleDirectives: ['\\usepackage{CJKutf8}']
  };

  assert.throws(() => Store.enqueuePolicyRegistration(stateDir, {
    scope: 'test',
    projectId: testProjectId,
    definition,
    approvalText: Store.POLICY_REGISTRATION_PHRASE
  }), error => error.code === 'external_module_policy_approval_mismatch');

  const queued = Store.enqueuePolicyRegistration(stateDir, {
    scope: 'test',
    projectId: testProjectId,
    definition,
    approvalText: Store.POLICY_REGISTRATION_PHRASE,
    externalModuleApprovalText: Store.EXTERNAL_MODULE_POLICY_APPROVAL_PHRASE
  });
  const claimed = Store.claimNextJob(stateDir, { projectId: testProjectId });
  assert.equal(claimed.id, queued.id);
  assert.equal(
    claimed.approvalEvidence.externalModuleExactPhrase,
    Store.EXTERNAL_MODULE_POLICY_APPROVAL_PHRASE
  );
});

test('test proposal is one-time, hash-bound, and claimable only by its project', () => {
  const { stateDir, testProjectId } = fixture();
  const proposal = Store.createProposalFromContents(stateDir, {
    scope: 'test',
    projectId: testProjectId,
    path: 'Template.tex',
    beforeContent: 'alpha beta\n',
    afterContent: 'alpha gamma\n'
  });

  assert.equal(proposal.beforeSha256, Store.hashText('alpha beta\n'));
  assert.equal(proposal.afterSha256, Store.hashText('alpha gamma\n'));
  assert.match(proposal.diff, /^--- a\/Template\.tex/m);
  assert.equal(proposal.exactRanges.length, 1);

  const queued = Store.enqueueApply(stateDir, {
    approvalId: proposal.approvalId,
    approvalText: Store.TEST_APPROVAL_PHRASE
  });
  assert.equal(queued.status, 'queued');
  assert.throws(() => Store.enqueueApply(stateDir, {
    approvalId: proposal.approvalId,
    approvalText: Store.TEST_APPROVAL_PHRASE
  }), error => error.code === 'approval_already_consumed');

  assert.equal(Store.claimNextJob(stateDir, {
    projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    extensionVersion: '2.3.5'
  }), null);
  const claimed = Store.claimNextJob(stateDir, {
    projectId: testProjectId,
    extensionVersion: '2.3.5'
  });
  assert.equal(claimed.id, queued.id);
  assert.equal(claimed.payload.requireReviewing, true);
  assert.equal(claimed.payload.patches[0].expected, 'bet');
});

test('production becomes write-ready immediately after its verified policy is connected', async () => {
  const { stateDir } = fixture();
  const productionProjectId = 'fedcba0987654321fedcba09';
  assert.throws(() => Store.enqueuePolicyRegistration(stateDir, {
    scope: 'production',
    projectId: productionProjectId,
    definition: policyDefinition(productionProjectId),
    approvalText: '확정'
  }), error => error.code === 'policy_registration_approval_mismatch');
  assert.throws(() => Store.createProposalFromContents(stateDir, {
    scope: 'production',
    projectId: productionProjectId,
    path: 'Template.tex',
    beforeContent: paperMain(),
    afterContent: paperMain('New')
  }), error => error.code === 'project_policy_not_registered');

  const policy = await registerPolicy(stateDir, productionProjectId);
  const proposal = Store.createProposalFromContents(stateDir, {
    scope: 'production',
    projectId: productionProjectId,
    path: 'Template.tex',
    beforeContent: paperMain(),
    afterContent: paperMain('New'),
    policyVerification: {
      verified: true,
      policyHash: policy.policyHash,
      observedAt: new Date().toISOString()
    }
  });
  const queued = Store.enqueueApply(stateDir, {
    approvalId: proposal.approvalId,
    approvalText: Store.PRODUCTION_WRITE_PHRASE
  });
  const claimed = Store.claimNextJob(stateDir, { projectId: productionProjectId });
  assert.equal(claimed.id, queued.id);
  assert.equal(claimed.payload.policy.policyHash, policy.policyHash);
  assert.equal(Store.getBridgeStatus(stateDir).policy.productionReady, true);
  assert.equal('productionEnabled' in Store.readConfig(stateDir), false);
});

test('verified policy registry supports production papers without a test slot or global active-project toggle', async t => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-overleaf-production-only-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const productionProjectId = 'fedcba0987654321fedcba09';
  const secondProductionProjectId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const initialized = Store.initializeState({ stateDir });

  assert.equal(initialized.config.testProjectId, '');
  assert.equal(Store.getBridgeStatus(stateDir).policy.testProjectConfigured, false);

  await registerPolicy(stateDir, productionProjectId);
  await registerPolicy(stateDir, secondProductionProjectId);
  const status = Store.getBridgeStatus(stateDir).policy;
  assert.equal(status.productionReady, true);
  assert.equal(status.writeAccessMode, 'automatic_after_verified_project_policy');
  assert.deepEqual(
    status.registry.production.map(item => item.projectId),
    [secondProductionProjectId, productionProjectId].sort()
  );
});

test('optional paper rules can be added, read by project ID, replaced, and cleared without editing Overleaf', async t => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-overleaf-paper-rules-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  Store.initializeState({ stateDir });
  const productionProjectId = 'fedcba0987654321fedcba09';
  const initial = await registerPolicy(stateDir, productionProjectId);
  assert.equal(Store.getBridgeStatus(stateDir, { projectId: productionProjectId }).policy.selectedProject.paperRulesConfigured, false);
  const preRulesProposal = Store.createProposalFromContents(stateDir, {
    scope: 'production',
    projectId: productionProjectId,
    path: 'Template.tex',
    beforeContent: paperMain(),
    afterContent: paperMain('Before rules changed'),
    policyVerification: {
      verified: true,
      policyHash: initial.policyHash,
      observedAt: new Date().toISOString()
    }
  });

  const paperRules = {
    name: 'ExampleConf 2027 main track',
    revision: '2026-09-09-v1',
    reviewedAt: '2026-09-09T00:00:00.000Z',
    officialSources: [{ label: 'Official author guide', url: 'https://example.org/authors' }],
    rules: [{
      id: 'page-limit',
      requirement: 'The compiled paper must fit the stated page limit.',
      checks: ['compile_pdf', 'human_final'],
      required: true
    }],
    notes: []
  };
  const added = Store.setProjectPaperRules(stateDir, {
    scope: 'production',
    projectId: productionProjectId,
    operation: 'set',
    paperRules,
    confirmed: true
  });
  assert.equal(added.ok, true);
  assert.equal(added.changedDocument, false);
  assert.notEqual(added.policy.policyHash, initial.policyHash);
  assert.equal(added.policy.paperRuleProfile.name, paperRules.name);
  const repeated = Store.setProjectPaperRules(stateDir, {
    scope: 'production',
    projectId: productionProjectId,
    operation: 'set',
    paperRules,
    confirmed: true
  });
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.policy.policyHash, added.policy.policyHash);

  const selected = Store.getBridgeStatus(stateDir, { projectId: productionProjectId }).policy.selectedProject;
  assert.equal(selected.paperRulesConfigured, true);
  assert.equal(selected.paperRuleProfile.rules[0].id, 'page-limit');
  assert.equal(selected.paperRulesHash.length, 64);

  const cleared = Store.setProjectPaperRules(stateDir, {
    scope: 'production',
    projectId: productionProjectId,
    operation: 'clear',
    confirmed: true
  });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.policy.paperRulesConfigured, false);
  assert.equal(cleared.policy.paperRuleProfile, null);
  assert.notEqual(cleared.policy.policyHash, initial.policyHash);
  assert.ok(fs.readdirSync(path.join(stateDir, 'policy-history', productionProjectId)).length >= 3);
  assert.throws(
    () => Store.enqueueApply(stateDir, {
      approvalId: preRulesProposal.approvalId,
      approvalText: Store.PRODUCTION_WRITE_PHRASE
    }),
    error => error.code === 'project_policy_changed_after_preview'
  );
});

test('paper-rule updates require confirmation and invalidate already previewed diffs', async () => {
  const { stateDir, testProjectId } = fixture();
  const initial = await registerPolicy(stateDir, testProjectId, 'test');
  const proposal = Store.createProposalFromContents(stateDir, {
    scope: 'test',
    projectId: testProjectId,
    path: 'Template.tex',
    beforeContent: paperMain(),
    afterContent: paperMain('Proposed'),
    policyVerification: {
      verified: true,
      policyHash: initial.policyHash,
      observedAt: new Date().toISOString()
    }
  });
  const input = {
    scope: 'test',
    projectId: testProjectId,
    operation: 'set',
    paperRules: {
      name: 'House style',
      revision: '1',
      reviewedAt: '2026-09-09T00:00:00.000Z',
      officialSources: [],
      rules: [{ id: 'terminology', requirement: 'Use the shared terminology.', checks: ['advisory'] }],
      notes: []
    }
  };
  assert.throws(
    () => Store.setProjectPaperRules(stateDir, input),
    error => error.code === 'paper_rule_update_not_confirmed'
  );
  Store.setProjectPaperRules(stateDir, { ...input, confirmed: true });
  assert.throws(
    () => Store.enqueueApply(stateDir, {
      approvalId: proposal.approvalId,
      approvalText: Store.TEST_APPROVAL_PHRASE
    }),
    error => error.code === 'project_policy_changed_after_preview'
  );
});

test('policy re-registration invalidates a previously previewed approval ID', async () => {
  const { stateDir, testProjectId } = fixture();
  const first = await registerPolicy(stateDir, testProjectId, 'test');
  const proposal = Store.createProposalFromContents(stateDir, {
    scope: 'test',
    projectId: testProjectId,
    path: 'Template.tex',
    beforeContent: paperMain(),
    afterContent: paperMain('Proposed'),
    policyVerification: {
      verified: true,
      policyHash: first.policyHash,
      observedAt: new Date().toISOString()
    }
  });

  const second = await registerPolicy(stateDir, testProjectId, 'test', {
    mainContent: paperMain('Current', 'Revised current body.')
  });
  assert.notEqual(second.policyHash, first.policyHash);
  assert.throws(() => Store.enqueueApply(stateDir, {
    approvalId: proposal.approvalId,
    approvalText: Store.TEST_APPROVAL_PHRASE
  }), error => error.code === 'project_policy_changed_after_preview');
});

test('completed write receipt carries recovery and permits exactly one approved undo', () => {
  const { stateDir, testProjectId } = fixture();
  const proposal = Store.createProposalFromContents(stateDir, {
    scope: 'test',
    projectId: testProjectId,
    path: 'Template.tex',
    beforeContent: 'before',
    afterContent: 'after'
  });
  const queued = Store.enqueueApply(stateDir, {
    approvalId: proposal.approvalId,
    approvalText: Store.TEST_APPROVAL_PHRASE
  });
  const claimed = Store.claimNextJob(stateDir, { projectId: testProjectId });
  const recovery = {
    strategy: 'tracked-reject-or-verified-restore',
    trackedChanges: [{ key: 'tracked-1', path: 'Template.tex' }],
    expectedFiles: [{ path: 'Template.tex', content: 'before' }],
    postFiles: [{ path: 'Template.tex', content: 'after' }]
  };
  const completed = Store.completeJob(stateDir, {
    jobId: queued.id,
    claimToken: claimed.claimToken,
    projectId: testProjectId,
    result: {
      ok: true,
      changedDocument: true,
      afterSha256: proposal.afterSha256,
      recovery
    }
  });
  assert.ok(completed.receiptId);
  const receipt = Store.getReceipt(stateDir, completed.receiptId);
  assert.deepEqual(receipt.recovery, recovery);

  const undo = Store.enqueueUndo(stateDir, {
    receiptId: completed.receiptId,
    approvalText: Store.TEST_APPROVAL_PHRASE
  });
  assert.equal(undo.action, 'undo');
  assert.throws(() => Store.enqueueUndo(stateDir, {
    receiptId: completed.receiptId,
    approvalText: Store.TEST_APPROVAL_PHRASE
  }), error => error.code === 'undo_already_queued');
});

test('approval phrase and project path checks fail closed', () => {
  const { stateDir, testProjectId } = fixture();
  assert.throws(
    () => Store.normalizeProjectId('example-share-link-token'),
    error => error.code === 'invalid_project_id' && /link-sharing token/.test(error.message)
  );
  assert.throws(() => Store.createProposalFromContents(stateDir, {
    scope: 'test',
    projectId: testProjectId,
    path: '../main.tex',
    beforeContent: 'a',
    afterContent: 'b'
  }), error => error.code === 'invalid_project_path');

  const proposal = Store.createProposalFromContents(stateDir, {
    scope: 'test',
    projectId: testProjectId,
    path: 'main.tex',
    beforeContent: 'a',
    afterContent: 'b'
  });
  assert.throws(() => Store.enqueueApply(stateDir, {
    approvalId: proposal.approvalId,
    approvalText: '확정'
  }), error => error.code === 'approval_phrase_mismatch');
});

test('native host routes poll and idempotent completion without invoking a model', async () => {
  const { stateDir, testProjectId } = fixture();
  const queued = Store.enqueueRead(stateDir, {
    scope: 'test',
    projectId: testProjectId,
    path: 'Template.tex'
  });
  const env = { ...process.env, CODEX_OVERLEAF_APPROVED_STATE_DIR: stateDir };
  const polled = await handleRequest({
    id: 'poll-1',
    method: 'approvedBridge.poll',
    params: { projectId: testProjectId, extensionVersion: '2.3.5' }
  }, env);
  assert.equal(polled.ok, true);
  assert.equal(polled.result.job.id, queued.id);

  const completionRequest = {
    id: 'complete-1',
    method: 'approvedBridge.complete',
    params: {
      jobId: queued.id,
      claimToken: polled.result.job.claimToken,
      projectId: testProjectId,
      result: { ok: true, changedDocument: false, path: 'Template.tex', content: 'test' }
    }
  };
  const completed = await handleRequest(completionRequest, env);
  assert.equal(completed.ok, true);
  assert.equal(completed.result.idempotent, false);
  const replayed = await handleRequest(completionRequest, env);
  assert.equal(replayed.ok, true);
  assert.equal(replayed.result.idempotent, true);
});
