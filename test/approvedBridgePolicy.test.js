const assert = require('node:assert/strict');
const test = require('node:test');

const Policy = require('../extension/src/shared/approvedBridgePolicy');
const Store = require('../native-host/src/approvedBridgeStore');

const projectId = '1234567890abcdef12345678';

function definition(overrides = {}) {
  return Policy.normalizeDefinition({
    projectId,
    scope: 'production',
    policyName: 'ICASSP 2027 template lock',
    policyRevision: '2026-09-09-v1',
    policySourceSha256: 'a'.repeat(64),
    mainDocument: 'Template.tex',
    editablePathPatterns: ['Template.tex', 'sections/**/*.tex', 'refs.bib'],
    protectedPaths: ['spconf.sty', 'IEEEbib.bst'],
    protectedPathPatterns: ['**/*.cls', '**/*.sty', '**/*.bst'],
    mutablePreambleCommands: ['title', 'name', 'address'],
    integrityErrorCode: 'icassp2027_template_integrity_violation',
    ...overrides
  });
}

function main({ title = 'Old title', body = 'Old body.', extraPreamble = '', bodyControl = '' } = {}) {
  return [
    '\\documentclass{article}',
    '\\usepackage{amsmath}',
    extraPreamble,
    `\\title{${title}}`,
    '\\name{Anonymous authors}',
    '\\address{Anonymous affiliation}',
    '\\begin{document}',
    '\\maketitle',
    '\\begin{abstract}',
    'Abstract text.',
    '\\end{abstract}',
    body,
    bodyControl,
    '\\bibliographystyle{IEEEbib}',
    '\\bibliography{refs}',
    '\\end{document}',
    ''
  ].join('\n');
}

function files(mainContent = main(), style = 'template-style-v1\n') {
  return [
    { path: 'Template.tex', content: mainContent },
    { path: 'spconf.sty', content: style },
    { path: 'IEEEbib.bst', content: 'template-bst-v1\n' },
    { path: 'refs.bib', content: '@article{x}\n' },
    { path: 'sections/intro.tex', content: 'Introduction.\n' }
  ];
}

test('policy glob matching is segment-aware and rejects unsafe patterns', () => {
  assert.equal(Policy.matchPathPattern('spconf.sty', '**/*.sty'), true);
  assert.equal(Policy.matchPathPattern('vendor/template/spconf.sty', '**/*.sty'), true);
  assert.equal(Policy.matchPathPattern('sections/intro.tex', 'sections/**/*.tex'), true);
  assert.equal(Policy.matchPathPattern('other/intro.tex', 'sections/**/*.tex'), false);
  assert.throws(() => Policy.matchPathPattern('main.tex', '../*.tex'), error => error.code === 'invalid_path_pattern');
});

test('default protection follows inventoried template paths instead of owning every future style file', () => {
  const policy = definition({ protectedPathPatterns: [] });
  assert.equal(Policy.isProtectedPath(policy, 'spconf.sty'), true);
  assert.equal(Policy.isProtectedPath(policy, 'author-modules/korean-draft.sty'), false);
});

test('main structure fingerprint permits author content but detects preamble and layout changes', async () => {
  const policy = definition();
  const baseline = await Policy.observeProject(policy, files(), Store.hashExactText);

  await Policy.assertProposedContentAllowed(
    policy,
    baseline,
    'Template.tex',
    main({ title: 'New title', body: 'Completely rewritten scientific content.' }),
    Store.hashText
  );

  await assert.rejects(
    Policy.assertProposedContentAllowed(
      policy,
      baseline,
      'Template.tex',
      main({ extraPreamble: '\\usepackage{geometry}' }),
      Store.hashText
    ),
    error => error.code === 'icassp2027_template_integrity_violation' && error.details.reason === 'proposed_main_structure_changed'
  );

  await assert.rejects(
    Policy.assertProposedContentAllowed(
      policy,
      baseline,
      'Template.tex',
      main({ bodyControl: '\\vspace{-1cm}' }),
      Store.hashText
    ),
    error => error.code === 'icassp2027_template_integrity_violation'
  );

  await assert.rejects(
    Policy.assertProposedContentAllowed(
      policy,
      baseline,
      'Template.tex',
      main({ title: 'New title \\vspace{-1cm}' }),
      Store.hashText
    ),
    error => error.code === 'icassp2027_template_integrity_violation'
  );
});

test('an exact user-approved package directive is mutable while unlisted packages and options stay blocked', async () => {
  const policy = definition({
    allowedPreambleDirectives: ['\\usepackage{CJKutf8}']
  });
  const baseline = await Policy.observeProject(policy, files(), Store.hashExactText);

  await Policy.assertProposedContentAllowed(
    policy,
    baseline,
    'Template.tex',
    main({ extraPreamble: '\\usepackage{CJKutf8}' }),
    Store.hashText
  );

  await assert.rejects(
    Policy.assertProposedContentAllowed(
      policy,
      baseline,
      'Template.tex',
      main({ extraPreamble: '\\usepackage[utf8]{CJKutf8}' }),
      Store.hashText
    ),
    error => error.code === 'icassp2027_template_integrity_violation'
  );

  await assert.rejects(
    Policy.assertProposedContentAllowed(
      policy,
      baseline,
      'Template.tex',
      main({ extraPreamble: '\\usepackage{geometry}' }),
      Store.hashText
    ),
    error => error.code === 'icassp2027_template_integrity_violation'
  );
});

test('allowed package directives are single-line exact declarations', () => {
  assert.equal(
    Policy.normalizePreambleDirective('\\usepackage [ dvipsnames, table ] { xcolor }'),
    '\\usepackage[dvipsnames,table]{xcolor}'
  );
  assert.throws(
    () => Policy.normalizePreambleDirective('\\usepackage{geometry}\n\\usepackage{xcolor}'),
    error => error.code === 'invalid_allowed_preamble_directive'
  );
  assert.throws(
    () => Policy.normalizePreambleDirective('\\setlength{\\textwidth}{9in}'),
    error => error.code === 'invalid_allowed_preamble_directive'
  );
});

test('fresh observation detects changed, removed, and newly protected template files', async () => {
  const policy = definition();
  const baseline = await Policy.observeProject(policy, files(), Store.hashExactText);
  const changed = await Policy.observeProject(policy, [
    ...files(main(), 'template-style-v2\n'),
    { path: 'new-template.cls', content: 'new class\n' }
  ], Store.hashExactText);
  const violations = Policy.compareObservations(policy, baseline, changed);
  assert.ok(violations.some(item => item.kind === 'protected_file_changed' && item.path === 'spconf.sty'));
  assert.ok(violations.some(item => item.kind === 'protected_file_added' && item.path === 'new-template.cls'));
  assert.throws(
    () => Policy.assertObservationMatches(policy, baseline, changed),
    error => error.code === 'icassp2027_template_integrity_violation'
  );

  const newlineOnlyChange = await Policy.observeProject(
    policy,
    files(main(), 'template-style-v1\r\n'),
    Store.hashExactText
  );
  assert.ok(Policy.compareObservations(policy, baseline, newlineOnlyChange)
    .some(item => item.kind === 'protected_file_changed' && item.path === 'spconf.sty'));
});

test('editable allowlist never permits a protected support file', async () => {
  const policy = definition();
  const baseline = await Policy.observeProject(policy, files(), Store.hashExactText);
  assert.equal(Policy.assertEditablePath(policy, 'refs.bib'), 'refs.bib');
  assert.throws(
    () => Policy.assertEditablePath(policy, 'spconf.sty'),
    error => error.code === 'icassp2027_template_integrity_violation' && error.details.reason === 'protected_path_write'
  );
  await assert.rejects(
    Policy.assertProposedContentAllowed(policy, baseline, 'unknown.tex', 'x', Store.hashText),
    error => error.code === 'icassp2027_template_integrity_violation' && error.details.reason === 'path_not_editable'
  );
});

module.exports = { definition, files, main };
