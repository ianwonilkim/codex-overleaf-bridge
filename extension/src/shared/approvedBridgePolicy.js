(function initCodexOverleafApprovedBridgePolicy(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CodexOverleafApprovedBridgePolicy = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function approvedBridgePolicyFactory() {
  'use strict';

  const POLICY_SCHEMA_VERSION = 2;
  const FINGERPRINT_VERSION = 'overleaf-template-structure-v2';
  const DEFAULT_INTEGRITY_ERROR_CODE = 'project_template_integrity_violation';
  const DEFAULT_PROTECTED_PATTERNS = Object.freeze([]);
  const DEFAULT_MUTABLE_PREAMBLE_COMMANDS = Object.freeze(['title', 'author', 'name', 'address', 'date', 'thanks']);
  const DEFAULT_ALLOWED_PREAMBLE_DIRECTIVES = Object.freeze([]);
  const SAFE_PROJECT_ID = /^[a-f0-9]{24}$/;
  const SAFE_HASH = /^[a-f0-9]{64}$/;
  const SAFE_ERROR_CODE = /^[a-z][a-z0-9_]{2,100}$/;
  const SAFE_COMMAND = /^[A-Za-z@]+$/;
  const SAFE_RULE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
  const SAFE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const PAPER_RULE_CHECKS = Object.freeze([
    'advisory',
    'compile_pdf',
    'human_final',
    'live_official',
    'source_diff'
  ]);

  const BODY_CONTROL_COMMANDS = Object.freeze([
    'documentclass', 'usepackage', 'RequirePackage',
    'geometry', 'newgeometry', 'restoregeometry',
    'setlength', 'addtolength',
    'newcommand', 'renewcommand', 'providecommand',
    'newenvironment', 'renewenvironment', 'def', 'gdef', 'edef', 'xdef', 'let',
    'AtBeginDocument', 'makeatletter', 'makeatother',
    'titleformat', 'titlespacing', 'captionsetup',
    'topmargin', 'bottommargin', 'oddsidemargin', 'evensidemargin',
    'textwidth', 'textheight', 'columnwidth', 'columnsep',
    'hoffset', 'voffset', 'headheight', 'headsep', 'footskip',
    'parskip', 'parindent', 'baselineskip', 'linespread', 'setstretch',
    'looseness', 'emergencystretch',
    'singlespacing', 'onehalfspacing', 'doublespacing',
    'fontsize', 'tiny', 'scriptsize', 'footnotesize', 'small',
    'large', 'Large', 'LARGE', 'huge', 'Huge',
    'fontfamily', 'fontseries', 'fontshape', 'selectfont',
    'rmfamily', 'sffamily', 'ttfamily', 'bfseries', 'mdseries', 'itshape', 'slshape',
    'vspace', 'hspace', 'vskip', 'hskip', 'kern',
    'resizebox', 'scalebox', 'raisebox', 'enlargethispage',
    'onecolumn', 'twocolumn', 'columnbreak', 'newpage', 'clearpage', 'balance',
    'raggedbottom', 'flushbottom',
    'pagestyle', 'thispagestyle', 'pagenumbering',
    'setcounter', 'addtocounter',
    'paperwidth', 'paperheight', 'pdfpagewidth', 'pdfpageheight',
    'bibliographystyle'
  ]);
  const ARGUMENT_CONTROL_COMMANDS = new Set([
    'documentclass', 'usepackage', 'RequirePackage',
    'geometry', 'newgeometry', 'setlength', 'addtolength',
    'newcommand', 'renewcommand', 'providecommand',
    'newenvironment', 'renewenvironment', 'AtBeginDocument',
    'titleformat', 'titlespacing', 'captionsetup',
    'linespread', 'setstretch', 'fontsize', 'vspace', 'hspace',
    'fontfamily', 'fontseries', 'fontshape',
    'resizebox', 'scalebox', 'raisebox', 'enlargethispage',
    'pagestyle', 'thispagestyle', 'pagenumbering', 'setcounter', 'addtocounter',
    'bibliographystyle'
  ]);
  const ASSIGNMENT_CONTROL_COMMANDS = new Set([
    'topmargin', 'bottommargin', 'oddsidemargin', 'evensidemargin',
    'textwidth', 'textheight', 'columnwidth', 'columnsep',
    'hoffset', 'voffset', 'headheight', 'headsep', 'footskip',
    'parskip', 'parindent', 'baselineskip', 'looseness', 'emergencystretch',
    'paperwidth', 'paperheight', 'pdfpagewidth', 'pdfpageheight',
    'def', 'gdef', 'edef', 'xdef', 'let', 'vskip', 'hskip', 'kern'
  ]);

  function normalizeDefinition(value = {}, helpers = {}) {
    const normalizePath = helpers.normalizePath || normalizeProjectPath;
    const projectId = String(value.projectId || '').trim();
    if (!SAFE_PROJECT_ID.test(projectId)) {
      throw policyError('invalid_project_id', 'Policy projectId must be a 24-character lowercase hexadecimal Overleaf project ID.');
    }
    const scope = String(value.scope || '').trim();
    if (!['test', 'production'].includes(scope)) {
      throw policyError('invalid_scope', 'Policy scope must be test or production.');
    }
    const policyName = normalizeBoundedText(value.policyName, 'policy_name', 200);
    const policyRevision = normalizeBoundedText(value.policyRevision || '1', 'policy_revision', 100);
    const rawPolicySourceSha256 = String(value.policySourceSha256 || '').trim();
    const policySourceSha256 = rawPolicySourceSha256
      ? normalizeHash(rawPolicySourceSha256, 'policy_source_sha256')
      : '';
    const mainDocument = normalizePath(value.mainDocument);
    const editablePathPatterns = normalizeStringArray(value.editablePathPatterns, 'editable_path_patterns', {
      min: 1,
      max: 128,
      normalize: normalizePathPattern
    });
    const protectedPaths = normalizeStringArray(value.protectedPaths || [], 'protected_paths', {
      min: 0,
      max: 256,
      normalize: normalizePath
    });
    const protectedPathPatterns = normalizeStringArray(
      value.protectedPathPatterns === undefined ? DEFAULT_PROTECTED_PATTERNS : value.protectedPathPatterns,
      'protected_path_patterns',
      { min: 0, max: 128, normalize: normalizePathPattern }
    );
    const mutablePreambleCommands = normalizeStringArray(
      value.mutablePreambleCommands === undefined ? DEFAULT_MUTABLE_PREAMBLE_COMMANDS : value.mutablePreambleCommands,
      'mutable_preamble_commands',
      { min: 0, max: 64, normalize: normalizeCommand }
    );
    const allowedPreambleDirectives = normalizeStringArray(
      value.allowedPreambleDirectives === undefined ? DEFAULT_ALLOWED_PREAMBLE_DIRECTIVES : value.allowedPreambleDirectives,
      'allowed_preamble_directives',
      { min: 0, max: 64, normalize: normalizePreambleDirective }
    );
    const integrityErrorCode = String(value.integrityErrorCode || DEFAULT_INTEGRITY_ERROR_CODE).trim();
    if (!SAFE_ERROR_CODE.test(integrityErrorCode)) {
      throw policyError('invalid_integrity_error_code', 'Policy integrityErrorCode must be a lowercase snake_case error code.');
    }
    if (!protectedPaths.length && !protectedPathPatterns.length) {
      throw policyError('protected_surface_empty', 'Policy must define at least one protected path or protected path pattern.');
    }
    if (!editablePathPatterns.some(pattern => matchPathPattern(mainDocument, pattern))) {
      throw policyError('main_document_not_editable', 'The main document must match at least one editable path pattern.');
    }
    if (isProtectedPath({ protectedPaths, protectedPathPatterns }, mainDocument)) {
      throw policyError('main_document_exactly_protected', 'The main document is content-editable and cannot also be an exact protected file. Its structure is protected separately.');
    }
    const fingerprintVersion = String(value.fingerprintVersion || FINGERPRINT_VERSION);
    if (fingerprintVersion !== FINGERPRINT_VERSION) {
      throw policyError('invalid_fingerprint_version', `Policy fingerprintVersion must be ${FINGERPRINT_VERSION}.`);
    }
    const paperRules = normalizePaperRuleProfile(value.paperRules);
    const rawPaperRulesUpdateId = String(value.paperRulesUpdateId || '').trim();
    if (rawPaperRulesUpdateId && !SAFE_UUID.test(rawPaperRulesUpdateId)) {
      throw policyError('invalid_paper_rules_update_id', 'paperRulesUpdateId must be a UUID when supplied.');
    }
    return {
      schemaVersion: POLICY_SCHEMA_VERSION,
      projectId,
      scope,
      policyName,
      policyRevision,
      ...(policySourceSha256 ? { policySourceSha256 } : {}),
      mainDocument,
      editablePathPatterns,
      protectedPaths,
      protectedPathPatterns,
      mutablePreambleCommands,
      allowedPreambleDirectives,
      integrityErrorCode,
      fingerprintVersion: FINGERPRINT_VERSION,
      ...(paperRules ? { paperRules } : {}),
      ...(rawPaperRulesUpdateId ? { paperRulesUpdateId: rawPaperRulesUpdateId.toLowerCase() } : {})
    };
  }

  function normalizePaperRuleProfile(value) {
    if (value === undefined || value === null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw policyError('invalid_paper_rule_profile', 'paper_rule_profile must be an object when supplied.');
    }
    const name = normalizeBoundedText(value.name, 'paper_rule_profile_name', 200);
    const revision = normalizeBoundedText(value.revision || '1', 'paper_rule_profile_revision', 100);
    const reviewedAt = normalizeTimestamp(
      value.reviewedAt === undefined ? value.reviewed_at : value.reviewedAt,
      'paper_rule_profile_reviewed_at'
    );
    const sourceValues = value.officialSources === undefined
      ? value.official_sources || []
      : value.officialSources;
    if (!Array.isArray(sourceValues) || sourceValues.length > 16) {
      throw policyError('invalid_paper_rule_profile_sources', 'paper_rule_profile official_sources must contain at most 16 entries.');
    }
    const officialSources = sourceValues.map((source, index) => normalizePaperRuleSource(source, index))
      .sort((left, right) => left.url.localeCompare(right.url) || left.label.localeCompare(right.label));
    if (new Set(officialSources.map(source => source.url)).size !== officialSources.length) {
      throw policyError('duplicate_paper_rule_profile_source', 'paper_rule_profile official_sources contains a duplicate URL.');
    }
    if (!Array.isArray(value.rules) || value.rules.length < 1 || value.rules.length > 64) {
      throw policyError('invalid_paper_rule_profile_rules', 'paper_rule_profile rules must contain between 1 and 64 entries.');
    }
    const rules = value.rules.map((rule, index) => normalizePaperRule(rule, index))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (new Set(rules.map(rule => rule.id)).size !== rules.length) {
      throw policyError('duplicate_paper_rule_id', 'paper_rule_profile rules contains a duplicate rule ID.');
    }
    if (rules.some(rule => rule.checks.includes('live_official')) && !officialSources.length) {
      throw policyError(
        'paper_rule_source_required',
        'A live_official rule requires at least one official source URL.'
      );
    }
    const noteValues = value.notes || [];
    if (!Array.isArray(noteValues) || noteValues.length > 32) {
      throw policyError('invalid_paper_rule_profile_notes', 'paper_rule_profile notes must contain at most 32 entries.');
    }
    const notes = noteValues.map((note, index) => normalizeBoundedText(
      note,
      `paper_rule_profile_note_${index + 1}`,
      500
    ));
    return { name, revision, reviewedAt, officialSources, rules, notes };
  }

  function normalizePaperRuleSource(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw policyError('invalid_paper_rule_profile_source', `paper_rule_profile official source ${index + 1} must be an object.`);
    }
    const label = normalizeBoundedText(value.label, `paper_rule_profile_source_label_${index + 1}`, 200);
    const rawUrl = normalizeBoundedText(value.url, `paper_rule_profile_source_url_${index + 1}`, 2048);
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw policyError('invalid_paper_rule_profile_source_url', 'Paper-rule source URLs must be valid HTTPS URLs.');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw policyError('invalid_paper_rule_profile_source_url', 'Paper-rule source URLs must be HTTPS and must not contain credentials.');
    }
    return { label, url: parsed.toString() };
  }

  function normalizePaperRule(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw policyError('invalid_paper_rule', `paper_rule_profile rule ${index + 1} must be an object.`);
    }
    const id = String(value.id || '').trim().toLowerCase();
    if (!SAFE_RULE_ID.test(id)) {
      throw policyError('invalid_paper_rule_id', 'Paper-rule IDs must be lowercase slugs of at most 64 characters.');
    }
    const requirement = normalizeBoundedText(value.requirement, `paper_rule_${id}_requirement`, 1000);
    const checksValue = value.checks;
    if (!Array.isArray(checksValue) || checksValue.length < 1 || checksValue.length > PAPER_RULE_CHECKS.length) {
      throw policyError('invalid_paper_rule_checks', `Paper rule ${id} must have between 1 and ${PAPER_RULE_CHECKS.length} checks.`);
    }
    const checks = [...new Set(checksValue.map(check => String(check || '').trim()))].sort();
    if (checks.some(check => !PAPER_RULE_CHECKS.includes(check))) {
      throw policyError(
        'invalid_paper_rule_check',
        `Paper-rule checks must be one of: ${PAPER_RULE_CHECKS.join(', ')}.`
      );
    }
    return {
      id,
      requirement,
      checks,
      required: value.required !== false
    };
  }

  function normalizePolicyRecord(value = {}, helpers = {}) {
    const definition = normalizeDefinition(value.definition || value, helpers);
    const baseline = normalizeObservation(value.baseline || {});
    const definitionHash = normalizeHash(value.definitionHash, 'definition_hash');
    const policyHash = normalizeHash(value.policyHash, 'policy_hash');
    if (String(value.status || '') !== 'verified') {
      throw policyError('policy_not_verified', 'Project policy record is not verified.');
    }
    return {
      schemaVersion: POLICY_SCHEMA_VERSION,
      status: 'verified',
      definition,
      definitionHash,
      policyHash,
      baseline,
      registeredAt: normalizeTimestamp(value.registeredAt, 'registered_at'),
      lastVerifiedAt: normalizeTimestamp(value.lastVerifiedAt || value.registeredAt, 'last_verified_at')
    };
  }

  function normalizeObservation(value = {}) {
    const protectedFiles = Array.isArray(value.protectedFiles) ? value.protectedFiles : null;
    if (!protectedFiles || protectedFiles.length > 512) {
      throw policyError('invalid_policy_observation', 'Policy observation must contain at most 512 protected files.');
    }
    const normalizedFiles = protectedFiles.map(item => ({
      path: normalizeProjectPath(item?.path),
      sha256: normalizeHash(item?.sha256, 'protected_file_sha256')
    })).sort((left, right) => left.path.localeCompare(right.path));
    if (new Set(normalizedFiles.map(item => item.path)).size !== normalizedFiles.length) {
      throw policyError('duplicate_protected_path', 'Policy observation contains duplicate protected paths.');
    }
    const evidence = String(value.evidence || '');
    if (evidence !== 'overleaf_source_zip_utf8_text_sha256') {
      throw policyError('invalid_policy_evidence', 'Policy observation must come from a fresh Overleaf source ZIP text hash.');
    }
    const fingerprintVersion = String(value.fingerprintVersion || '');
    if (fingerprintVersion !== FINGERPRINT_VERSION) {
      throw policyError('invalid_fingerprint_version', `Policy observation fingerprintVersion must be ${FINGERPRINT_VERSION}.`);
    }
    return {
      evidence,
      capturedAt: normalizeTimestamp(value.capturedAt, 'captured_at'),
      textFileCount: normalizeCount(value.textFileCount, 'text_file_count'),
      sourceTreeSha256: normalizeHash(value.sourceTreeSha256, 'source_tree_sha256'),
      mainDocumentSha256: normalizeHash(value.mainDocumentSha256, 'main_document_sha256'),
      mainStructureFingerprint: normalizeHash(value.mainStructureFingerprint, 'main_structure_fingerprint'),
      protectedPathSetSha256: normalizeHash(value.protectedPathSetSha256, 'protected_path_set_sha256'),
      protectedFiles: normalizedFiles,
      fingerprintVersion
    };
  }

  async function observeProject(definitionValue, filesValue, hashText, options = {}) {
    if (typeof hashText !== 'function') throw policyError('hash_function_missing', 'A SHA-256 text hash function is required.');
    const definition = normalizeDefinition(definitionValue);
    const files = normalizeTextFiles(filesValue);
    const fileMap = new Map(files.map(file => [file.path, file]));
    const main = fileMap.get(definition.mainDocument);
    if (!main) {
      throw integrityError(definition, 'main_document_missing', `Fresh Overleaf source ZIP does not contain ${definition.mainDocument}.`);
    }
    const protectedFiles = files
      .filter(file => isProtectedPath(definition, file.path))
      .sort((left, right) => left.path.localeCompare(right.path));
    for (const requiredPath of definition.protectedPaths) {
      if (!fileMap.has(requiredPath)) {
        throw integrityError(definition, 'protected_file_missing', `Fresh Overleaf source ZIP does not contain protected file ${requiredPath}.`, { path: requiredPath });
      }
    }
    const overlap = protectedFiles.find(file => definition.editablePathPatterns.some(pattern => matchPathPattern(file.path, pattern)));
    if (overlap) {
      throw policyError('editable_protected_overlap', `Protected file ${overlap.path} also matches an editable path pattern.`);
    }
    const protectedHashes = [];
    for (const file of protectedFiles) {
      protectedHashes.push({ path: file.path, sha256: await hashText(file.content) });
    }
    const allFileHashes = [];
    for (const file of files) {
      allFileHashes.push({ path: file.path, sha256: await hashText(file.content) });
    }
    const protectedPathSetSha256 = await hashText(canonicalStringify(protectedHashes.map(item => item.path)));
    const sourceTreeSha256 = await hashText(canonicalStringify(allFileHashes));
    const mainDocumentSha256 = await hashText(main.content);
    const mainStructureFingerprint = await hashText(mainStructureMaterial(
      main.content,
      definition.mutablePreambleCommands,
      definition.allowedPreambleDirectives
    ));
    return {
      evidence: String(options.evidence || 'overleaf_source_zip_utf8_text_sha256'),
      capturedAt: String(options.capturedAt || new Date().toISOString()),
      textFileCount: files.length,
      sourceTreeSha256,
      mainDocumentSha256,
      mainStructureFingerprint,
      protectedPathSetSha256,
      protectedFiles: protectedHashes,
      fingerprintVersion: FINGERPRINT_VERSION
    };
  }

  function compareObservations(definitionValue, baselineValue, observedValue) {
    const definition = normalizeDefinition(definitionValue);
    const baseline = normalizeObservation(baselineValue);
    const observed = normalizeObservation(observedValue);
    const violations = [];
    if (baseline.fingerprintVersion !== FINGERPRINT_VERSION || observed.fingerprintVersion !== FINGERPRINT_VERSION) {
      violations.push({ kind: 'fingerprint_version_mismatch', expected: FINGERPRINT_VERSION, observed: observed.fingerprintVersion });
    }
    if (baseline.protectedPathSetSha256 !== observed.protectedPathSetSha256) {
      violations.push({
        kind: 'protected_path_set_changed',
        expectedSha256: baseline.protectedPathSetSha256,
        observedSha256: observed.protectedPathSetSha256
      });
    }
    const expected = new Map(baseline.protectedFiles.map(item => [item.path, item.sha256]));
    const actual = new Map(observed.protectedFiles.map(item => [item.path, item.sha256]));
    for (const [filePath, expectedSha256] of expected) {
      if (!actual.has(filePath)) {
        violations.push({ kind: 'protected_file_missing', path: filePath });
      } else if (actual.get(filePath) !== expectedSha256) {
        violations.push({ kind: 'protected_file_changed', path: filePath, expectedSha256, observedSha256: actual.get(filePath) });
      }
    }
    for (const filePath of actual.keys()) {
      if (!expected.has(filePath)) violations.push({ kind: 'protected_file_added', path: filePath });
    }
    if (baseline.mainStructureFingerprint !== observed.mainStructureFingerprint) {
      violations.push({
        kind: 'main_structure_changed',
        path: definition.mainDocument,
        expectedSha256: baseline.mainStructureFingerprint,
        observedSha256: observed.mainStructureFingerprint
      });
    }
    return violations;
  }

  function assertObservationMatches(definition, baseline, observed) {
    const violations = compareObservations(definition, baseline, observed);
    if (violations.length) {
      throw integrityError(
        normalizeDefinition(definition),
        'template_fingerprint_mismatch',
        'Protected Overleaf template files or main-document structure differ from the registered baseline.',
        { violations }
      );
    }
    return true;
  }

  async function assertProposedContentAllowed(definitionValue, baselineValue, filePathValue, content, hashText) {
    const definition = normalizeDefinition(definitionValue);
    const filePath = normalizeProjectPath(filePathValue);
    assertEditablePath(definition, filePath);
    if (filePath !== definition.mainDocument) {
      return { path: filePath, mainStructureFingerprint: '' };
    }
    const baseline = normalizeObservation(baselineValue);
    const mainStructureFingerprint = await hashText(mainStructureMaterial(
      content,
      definition.mutablePreambleCommands,
      definition.allowedPreambleDirectives
    ));
    if (mainStructureFingerprint !== baseline.mainStructureFingerprint) {
      throw integrityError(definition, 'proposed_main_structure_changed', 'The proposed main document changes protected template structure.', {
        path: filePath,
        expectedSha256: baseline.mainStructureFingerprint,
        observedSha256: mainStructureFingerprint
      });
    }
    return { path: filePath, mainStructureFingerprint };
  }

  function assertEditablePath(definitionValue, filePathValue) {
    const definition = normalizeDefinition(definitionValue);
    const filePath = normalizeProjectPath(filePathValue);
    if (isProtectedPath(definition, filePath)) {
      throw integrityError(definition, 'protected_path_write', `Policy forbids writing protected template file ${filePath}.`, { path: filePath });
    }
    if (!definition.editablePathPatterns.some(pattern => matchPathPattern(filePath, pattern))) {
      throw integrityError(definition, 'path_not_editable', `Policy does not allow writing ${filePath}.`, { path: filePath });
    }
    return filePath;
  }

  function isProtectedPath(definition, filePathValue) {
    const filePath = normalizeProjectPath(filePathValue);
    return (definition.protectedPaths || []).includes(filePath) ||
      (definition.protectedPathPatterns || []).some(pattern => matchPathPattern(filePath, pattern));
  }

  function matchPathPattern(filePathValue, patternValue) {
    const filePath = normalizeProjectPath(filePathValue);
    const pattern = normalizePathPattern(patternValue);
    return globRegex(pattern).test(filePath);
  }

  function mainStructureMaterial(
    contentValue,
    mutableCommandsValue = DEFAULT_MUTABLE_PREAMBLE_COMMANDS,
    allowedPreambleDirectivesValue = DEFAULT_ALLOWED_PREAMBLE_DIRECTIVES
  ) {
    const content = normalizeText(contentValue);
    const mutableCommands = normalizeStringArray(mutableCommandsValue, 'mutable_preamble_commands', {
      min: 0,
      max: 64,
      normalize: normalizeCommand
    });
    const allowedPreambleDirectives = normalizeStringArray(
      allowedPreambleDirectivesValue,
      'allowed_preamble_directives',
      { min: 0, max: 64, normalize: normalizePreambleDirective }
    );
    const visible = maskComments(content);
    const beginToken = findOutsideComments(content, /\\begin\s*\{\s*document\s*\}/g);
    const endToken = findOutsideComments(content, /\\end\s*\{\s*document\s*\}/g, { last: true });
    if (!beginToken || !endToken || endToken.index <= beginToken.index) {
      throw policyError('invalid_main_document_structure', 'Main document must contain ordered \\begin{document} and \\end{document} wrappers.');
    }
    const preamble = maskComments(content.slice(0, beginToken.index));
    const withoutApprovedDependencies = removeAllowedPreambleDirectiveLines(
      preamble,
      allowedPreambleDirectives
    );
    const canonicalPreamble = redactMutableCommandArguments(
      withoutApprovedDependencies,
      mutableCommands
    ).replace(/\s+/g, ' ').trim();
    const body = visible.slice(beginToken.index);
    const bodyControls = extractControlMaterial(body);
    const wrappers = [];
    const wrapperRe = /\\(?:begin|end)\s*\{\s*(?:document|abstract|keywords|IEEEkeywords)\s*\}|\\maketitle\b/gi;
    for (const match of body.matchAll(wrapperRe)) {
      wrappers.push(match[0].replace(/\s+/g, '').toLowerCase());
    }
    return canonicalStringify({
      fingerprintVersion: FINGERPRINT_VERSION,
      canonicalPreamble,
      wrappers,
      bodyControls
    });
  }

  function redactMutableCommandArguments(input, mutableCommands) {
    const commands = new Set(mutableCommands);
    let output = '';
    let index = 0;
    let inComment = false;
    while (index < input.length) {
      const char = input[index];
      if (inComment) {
        output += char;
        if (char === '\n') inComment = false;
        index += 1;
        continue;
      }
      if (char === '%' && !isEscaped(input, index)) {
        inComment = true;
        output += char;
        index += 1;
        continue;
      }
      if (char !== '\\' || isEscaped(input, index)) {
        output += char;
        index += 1;
        continue;
      }
      const nameMatch = /^[A-Za-z@]+/.exec(input.slice(index + 1));
      if (!nameMatch || !commands.has(nameMatch[0])) {
        output += char;
        index += 1;
        continue;
      }
      const commandEnd = index + 1 + nameMatch[0].length;
      output += input.slice(index, commandEnd);
      index = commandEnd;
      while (index < input.length && /\s/.test(input[index])) output += input[index++];
      while (input[index] === '[') {
        const end = findBalancedEnd(input, index, '[', ']');
        output += authorContentPlaceholder('[', ']', input.slice(index + 1, end - 1));
        index = end;
        while (index < input.length && /\s/.test(input[index])) output += input[index++];
      }
      if (input[index] === '{') {
        const end = findBalancedEnd(input, index, '{', '}');
        output += authorContentPlaceholder('{', '}', input.slice(index + 1, end - 1));
        index = end;
      }
    }
    return output;
  }

  function authorContentPlaceholder(open, close, content) {
    const controls = extractControlMaterial(content);
    return `${open}<AUTHOR_CONTENT>${controls.length ? `<PROTECTED_CONTROLS:${canonicalStringify(controls)}>` : ''}${close}`;
  }

  function removeAllowedPreambleDirectiveLines(input, directivesValue) {
    const directives = new Set(directivesValue);
    if (!directives.size) return input;
    return input.split('\n').map(line => {
      const trimmed = line.trim();
      if (!/^\\(?:usepackage|RequirePackage)\b/.test(trimmed)) return line;
      try {
        return directives.has(normalizePreambleDirective(trimmed)) ? '' : line;
      } catch {
        return line;
      }
    }).join('\n');
  }

  function extractControlMaterial(contentValue) {
    const content = normalizeText(contentValue);
    const visible = maskComments(content);
    const scan = new RegExp(`\\\\(${BODY_CONTROL_COMMANDS.map(escapeRegex).join('|')})\\b`, 'g');
    const controls = [];
    for (const match of visible.matchAll(scan)) {
      const name = match[1];
      let cursor = match.index + match[0].length;
      let material = `\\${name}`;
      if (ARGUMENT_CONTROL_COMMANDS.has(name)) {
        if (content[cursor] === '*') {
          material += '*';
          cursor += 1;
        }
        let groupCount = 0;
        while (groupCount < 3) {
          while (cursor < content.length && /[ \t]/.test(content[cursor])) cursor += 1;
          const open = content[cursor];
          if (open !== '[' && open !== '{') break;
          const close = open === '[' ? ']' : '}';
          const end = findBalancedEnd(content, cursor, open, close);
          material += content.slice(cursor, end).replace(/\s+/g, ' ');
          cursor = end;
          groupCount += 1;
        }
      } else if (ASSIGNMENT_CONTROL_COMMANDS.has(name)) {
        const lineEnd = content.indexOf('\n', cursor);
        material += content.slice(cursor, lineEnd === -1 ? content.length : lineEnd).trim().replace(/\s+/g, ' ');
      }
      controls.push(material);
    }
    return controls;
  }

  function findBalancedEnd(input, start, open, close) {
    let depth = 0;
    for (let index = start; index < input.length; index += 1) {
      if (input[index] === open && !isEscaped(input, index)) depth += 1;
      else if (input[index] === close && !isEscaped(input, index)) {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
    }
    throw policyError('invalid_main_document_structure', `Unbalanced ${open}${close} group in mutable preamble command.`);
  }

  function findOutsideComments(content, regex, options = {}) {
    const masked = maskComments(content);
    const matches = [...masked.matchAll(regex)];
    const match = options.last ? matches[matches.length - 1] : matches[0];
    return match ? { index: match.index, text: match[0] } : null;
  }

  function maskComments(content) {
    const chars = content.split('');
    let inComment = false;
    for (let index = 0; index < chars.length; index += 1) {
      const char = chars[index];
      if (inComment) {
        if (char === '\n') inComment = false;
        else chars[index] = ' ';
      } else if (char === '%' && !isEscaped(content, index)) {
        inComment = true;
        chars[index] = ' ';
      }
    }
    return chars.join('');
  }

  function isEscaped(value, index) {
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashes += 1;
    return slashes % 2 === 1;
  }

  function normalizeTextFiles(filesValue) {
    if (!Array.isArray(filesValue) || filesValue.length < 1 || filesValue.length > 10_000) {
      throw policyError('invalid_project_inventory', 'Fresh project inventory must contain between 1 and 10,000 text files.');
    }
    const files = filesValue
      .filter(file => file && typeof file.content === 'string')
      .map(file => ({ path: normalizeProjectPath(file.path), content: String(file.content) }))
      .sort((left, right) => left.path.localeCompare(right.path));
    if (!files.length || new Set(files.map(file => file.path)).size !== files.length) {
      throw policyError('invalid_project_inventory', 'Project inventory has no readable text or contains duplicate paths.');
    }
    return files;
  }

  function definitionMaterial(definitionValue) {
    return canonicalStringify(normalizeDefinition(definitionValue));
  }

  function policyMaterial(definitionValue, baselineValue) {
    return canonicalStringify({
      definition: normalizeDefinition(definitionValue),
      baseline: normalizeObservation(baselineValue)
    });
  }

  function canonicalStringify(value) {
    return JSON.stringify(sortObject(value));
  }

  function sortObject(value) {
    if (Array.isArray(value)) return value.map(sortObject);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = sortObject(value[key]);
      return result;
    }, {});
  }

  function normalizeStringArray(value, field, options) {
    if (!Array.isArray(value) || value.length < options.min || value.length > options.max) {
      throw policyError(`invalid_${field}`, `${field} must contain ${options.min} to ${options.max} entries.`);
    }
    const normalized = [...new Set(value.map(item => options.normalize(item)))].sort();
    if (normalized.length < options.min) throw policyError(`invalid_${field}`, `${field} has too few valid entries.`);
    return normalized;
  }

  function normalizePathPattern(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.startsWith('/') || raw.includes('\\') || /[\0-\x1f\x7f]/.test(raw)) {
      throw policyError('invalid_path_pattern', 'Policy path pattern must be a safe relative POSIX glob.');
    }
    const normalized = raw.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
      throw policyError('invalid_path_pattern', 'Policy path pattern must not contain empty, dot, or parent segments.');
    }
    return normalized;
  }

  function normalizeProjectPath(value) {
    const raw = String(value || '');
    if (!raw || raw.startsWith('/') || raw.includes('\\') || /[\0-\x1f\x7f]/.test(raw)) {
      throw policyError('invalid_project_path', 'Project path must be a safe relative POSIX path.');
    }
    const normalized = raw.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
      throw policyError('invalid_project_path', 'Project path must not contain empty, dot, or parent segments.');
    }
    return normalized;
  }

  function normalizeText(value) {
    return String(value ?? '').replace(/\r\n/g, '\n');
  }

  function normalizeCommand(value) {
    const command = String(value || '').replace(/^\\/, '').trim();
    if (!SAFE_COMMAND.test(command)) throw policyError('invalid_mutable_command', 'Mutable preamble command names may contain only letters and @.');
    return command;
  }

  function normalizePreambleDirective(value) {
    const directive = String(value || '').trim();
    if (!directive || /[\r\n%\0-\x1f\x7f]/.test(directive)) {
      throw policyError(
        'invalid_allowed_preamble_directive',
        'Allowed preamble directives must be one uncommented usepackage or RequirePackage command per line.'
      );
    }
    const match = /^\\(usepackage|RequirePackage)\s*(?:\[([^\[\]{}]*)\]\s*)?\{\s*([A-Za-z0-9][A-Za-z0-9._-]*(?:\s*,\s*[A-Za-z0-9][A-Za-z0-9._-]*)*)\s*\}$/.exec(directive);
    if (!match) {
      throw policyError(
        'invalid_allowed_preamble_directive',
        'Allowed preamble directives must be exact usepackage or RequirePackage commands with literal package names and options.'
      );
    }
    const options = match[2] === undefined
      ? ''
      : `[${match[2].split(',').map(item => item.trim()).join(',')}]`;
    const packages = match[3].split(',').map(item => item.trim()).join(',');
    return `\\${match[1]}${options}{${packages}}`;
  }

  function normalizeHash(value, field) {
    const hash = String(value || '').trim().toLowerCase();
    if (!SAFE_HASH.test(hash)) throw policyError(`invalid_${field}`, `${field} must be a lowercase SHA-256 hex digest.`);
    return hash;
  }

  function normalizeCount(value, field) {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0 || count > 10_000) throw policyError(`invalid_${field}`, `${field} must be a safe integer count.`);
    return count;
  }

  function normalizeBoundedText(value, field, max) {
    const text = String(value || '').trim();
    if (!text || text.length > max || /[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) {
      throw policyError(`invalid_${field}`, `${field} must be non-empty and at most ${max} characters.`);
    }
    return text;
  }

  function normalizeTimestamp(value, field) {
    const text = String(value || '');
    const time = Date.parse(text);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== text) {
      throw policyError(`invalid_${field}`, `${field} must be an ISO-8601 UTC timestamp.`);
    }
    return text;
  }

  function globRegex(pattern) {
    let source = '^';
    for (let index = 0; index < pattern.length; index += 1) {
      const char = pattern[index];
      if (char === '*' && pattern[index + 1] === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else if (char === '*') source += '[^/]*';
      else if (char === '?') source += '[^/]';
      else source += escapeRegex(char);
    }
    return new RegExp(`${source}$`);
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function integrityError(definition, reason, message, details = {}) {
    return policyError(definition.integrityErrorCode || DEFAULT_INTEGRITY_ERROR_CODE, message, { reason, ...details });
  }

  function policyError(code, message, details) {
    const error = new Error(message);
    error.code = code;
    if (details) error.details = details;
    return error;
  }

  return Object.freeze({
    DEFAULT_INTEGRITY_ERROR_CODE,
    DEFAULT_ALLOWED_PREAMBLE_DIRECTIVES,
    DEFAULT_MUTABLE_PREAMBLE_COMMANDS,
    DEFAULT_PROTECTED_PATTERNS,
    FINGERPRINT_VERSION,
    POLICY_SCHEMA_VERSION,
    assertEditablePath,
    assertObservationMatches,
    assertProposedContentAllowed,
    canonicalStringify,
    compareObservations,
    definitionMaterial,
    isProtectedPath,
    mainStructureMaterial,
    matchPathPattern,
    normalizeDefinition,
    normalizeObservation,
    normalizePaperRuleProfile,
    normalizePreambleDirective,
    normalizePolicyRecord,
    observeProject,
    policyMaterial
  });
});
