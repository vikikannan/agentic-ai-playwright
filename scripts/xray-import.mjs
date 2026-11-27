#!/usr/bin/env node
/**
 * Import Playwright JUnit results into Xray Cloud.
 *
 * Two modes:
 *   - Update an existing Test Execution (--test-exec / XRAY_TEST_EXECUTION_KEY set, e.g. when
 *     Jira Automation triggers the pipeline): results are imported with
 *     POST /import/execution/junit?projectKey=…&testExecKey=<key>. Only results for Tests that
 *     already belong to that Test Execution are sent, so no Tests are added and no issue is created.
 *   - Create a new Test Execution (no key, e.g. a push or a manual run in GitHub):
 *     POST /import/execution/junit/multipart with a generated summary and the test environment.
 *
 * Dynamic test selection (--run together with a Test Execution key): the Tests of that Test
 * Execution are read from Xray (paged) and matched to Playwright tests through their existing
 * `test_key` annotation + @xray tag (listed with `playwright test --list`, nothing duplicated).
 * Only the matched tests are executed (`--test-list`). Selected Tests that are manual, have no
 * Playwright test or are wrongly annotated are reported (log, job summary, warning) and left
 * untouched in Xray. If no selected Test is mapped, nothing is executed or imported (exit 2).
 * With --dry-run the selection is shown but Playwright is NOT run and nothing is sent.
 * Without a key, all @xray tests are run as before.
 *
 * Only <testcase> elements that carry a `test_key` property (from the Playwright
 * annotation `{ type: 'test_key', description: 'QTM-8' }`) are sent. Unmapped test
 * cases are dropped, because Xray would otherwise auto-create new Generic Tests.
 *
 * Usage:
 *   node scripts/xray-import.mjs                         import the existing report (new Test Execution)
 *   node scripts/xray-import.mjs --run                   run the @xray tests first, then import
 *   node scripts/xray-import.mjs --run --test-exec QTM-20   run only the tests selected in QTM-20, then update it
 *   node scripts/xray-import.mjs --run --test-exec QTM-20 --dry-run   show which tests would run; run/send nothing
 *   node scripts/xray-import.mjs --dry-run               check everything and print the request, send nothing
 *
 * Options (or the equivalent environment variables):
 *   --file <path>         JUnit report               (default: test-results/junit/results.xml)
 *   --project <key>       XRAY_PROJECT_KEY           (default: QTM)
 *   --test-exec <key>     XRAY_TEST_EXECUTION_KEY    (optional; existing Test Execution to update)
 *   --environment <name>  XRAY_TEST_ENVIRONMENT      (default: chromium; new Test Executions only)
 *   --test-plan <key>     XRAY_TEST_PLAN_KEY         (optional)
 *   --summary <text>      Test Execution summary     (new Test Executions only; default: generated)
 *
 * The exact filtered payload is saved next to the report as xray-import.xml for auditing.
 * In GitHub Actions the key of the Test Execution that received the results is written to the
 * step output `test_execution_key`.
 *
 * Credentials: XRAY_CLIENT_ID / XRAY_CLIENT_SECRET environment variables. On Windows,
 * if those are not set, a generic Credential Manager entry named "XrayAPI" is used
 * (cmdkey /generic:XrayAPI /user:<client id> /pass:<client secret>).
 * Credentials and the access token are never printed.
 *
 * Exit code: the Playwright exit code when --run is used (failed tests are still
 * imported); 2 if the import itself fails or is refused; otherwise 0.
 */
import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

const XRAY_BASE_URL = 'https://xray.cloud.getxray.app/api/v2';
const PLAYWRIGHT_PROJECT = 'chromium';
// All linked tests: used when no Test Execution key is given (a new Test Execution is created).
const PLAYWRIGHT_COMMAND = `npx playwright test --project=${PLAYWRIGHT_PROJECT} --grep @xray`;
const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

const { values: args } = parseArgs({
  options: {
    run: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    file: { type: 'string', default: 'test-results/junit/results.xml' },
    project: { type: 'string', default: process.env.XRAY_PROJECT_KEY || 'QTM' },
    'test-exec': { type: 'string', default: process.env.XRAY_TEST_EXECUTION_KEY || '' },
    environment: { type: 'string', default: process.env.XRAY_TEST_ENVIRONMENT || 'chromium' },
    'test-plan': { type: 'string', default: process.env.XRAY_TEST_PLAN_KEY || '' },
    summary: { type: 'string', default: '' },
  },
});
const testExecKey = args['test-exec'].trim();

class ImportError extends Error {}

function attribute(attributes, name) {
  return attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '';
}

/**
 * Parse the Playwright JUnit report and keep only test cases that have a test_key
 * (and, if `allowedKeys` is given, whose key is in that set).
 */
function filterReport(xml, allowedKeys = null) {
  const suites = [];
  const kept = [];
  const dropped = [];
  const excluded = [];

  for (const [, suiteAttributes, suiteBody] of xml.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g)) {
    const suite = { attributes: suiteAttributes, cases: [] };
    for (const [raw, caseAttributes, caseBody = ''] of suiteBody.matchAll(
      /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g,
    )) {
      const testCase = {
        raw,
        name: attribute(caseAttributes, 'name'),
        file: attribute(caseAttributes, 'classname'),
        time: Number(attribute(caseAttributes, 'time')) || 0,
        key: caseBody.match(/<property\s+name="test_key"\s+value="([^"]*)"/)?.[1] ?? '',
        status: /<(failure|error)\b/.test(caseBody) ? 'FAILED' : /<skipped\b/.test(caseBody) ? 'SKIPPED' : 'PASSED',
      };
      if (!testCase.key) dropped.push(testCase);
      else if (allowedKeys && !allowedKeys.has(testCase.key)) excluded.push(testCase);
      else {
        kept.push(testCase);
        suite.cases.push(testCase);
      }
    }
    if (suite.cases.length) suites.push(suite);
  }

  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<testsuites>'];
  for (const { attributes, cases } of suites) {
    const count = status => cases.filter(c => c.status === status).length;
    const time = cases.reduce((sum, c) => sum + c.time, 0).toFixed(3);
    lines.push(
      `<testsuite name="${attribute(attributes, 'name')}" timestamp="${attribute(attributes, 'timestamp')}"` +
        ` hostname="${attribute(attributes, 'hostname')}" tests="${cases.length}" failures="${count('FAILED')}"` +
        ` skipped="${count('SKIPPED')}" errors="0" time="${time}">`,
      ...cases.map(c => c.raw),
      '</testsuite>',
    );
  }
  lines.push('</testsuites>');
  return { xml: lines.join('\n'), kept, dropped, excluded };
}

function validateKeys(kept, projectKey) {
  if (!kept.length) throw new ImportError('No test cases with a test_key were found; nothing to import.');
  const seen = new Set();
  for (const { key, name } of kept) {
    if (!ISSUE_KEY.test(key)) throw new ImportError(`Invalid test_key "${key}" on "${name}".`);
    if (!key.startsWith(`${projectKey}-`)) {
      throw new ImportError(`test_key ${key} is not in project ${projectKey}; refusing to import.`);
    }
    if (seen.has(key)) {
      throw new ImportError(`test_key ${key} appears more than once (several browsers or projects?); refusing to import.`);
    }
    seen.add(key);
  }
}

function readWindowsCredential() {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -Namespace CredMan -Name Native -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct CREDENTIAL {
  public int Flags; public int Type; public string TargetName; public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
  public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
}
[DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
[DllImport("advapi32.dll")] public static extern void CredFree(IntPtr cred);
'@
$ptr = [IntPtr]::Zero
if (-not [CredMan.Native]::CredRead('XrayAPI', 1, 0, [ref]$ptr)) { exit 3 }
try {
  $c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][CredMan.Native+CREDENTIAL])
  $secret = [Runtime.InteropServices.Marshal]::PtrToStringUni($c.CredentialBlob, $c.CredentialBlobSize / 2)
  [Console]::Out.Write((@{ id = $c.UserName; secret = $secret } | ConvertTo-Json -Compress))
} finally { [CredMan.Native]::CredFree($ptr) }
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    const { id, secret } = JSON.parse(result.stdout);
    return id && secret ? { id, secret, source: 'Windows Credential Manager (XrayAPI)' } : null;
  } catch {
    return null;
  }
}

function getCredentials() {
  const { XRAY_CLIENT_ID: id, XRAY_CLIENT_SECRET: secret } = process.env;
  if (id && secret) return { id, secret, source: 'environment variables' };
  return process.platform === 'win32' ? readWindowsCredential() : null;
}

async function authenticate({ id, secret }) {
  const response = await fetch(`${XRAY_BASE_URL}/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: id, client_secret: secret }),
  });
  if (!response.ok) throw new ImportError(`Xray authentication failed: HTTP ${response.status} ${await response.text()}`);
  return JSON.parse(await response.text());
}

let cachedToken = null;
/** Authenticate once, on first use. */
async function getToken() {
  if (cachedToken) return cachedToken;
  const credentials = getCredentials();
  if (!credentials) {
    throw new ImportError(
      'Xray credentials not found. Set XRAY_CLIENT_ID and XRAY_CLIENT_SECRET' +
        (process.platform === 'win32' ? ', or store them with: cmdkey /generic:XrayAPI /user:<id> /pass:<secret>' : '.'),
    );
  }
  cachedToken = await authenticate(credentials);
  console.log(`Xray authentication OK (credentials from ${credentials.source}).`);
  return cachedToken;
}

async function graphql(query) {
  const response = await fetch(`${XRAY_BASE_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify({ query }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.errors) {
    throw new ImportError(`Xray GraphQL query failed: HTTP ${response.status} ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.data;
}

const PAGE_SIZE = 100; // maximum page size of the Xray GraphQL API

/**
 * Look up an existing Test Execution (read-only), including ALL its Tests (paged).
 * Returns null if the key is not a Test Execution.
 */
async function findTestExecution(key) {
  const testFields = 'total results { testType { name kind } jira(fields: ["key", "summary"]) }';
  const data = await graphql(
    `{ getTestExecutions(jql: "key = ${key}", limit: 1) { results { issueId testEnvironments` +
      ` jira(fields: ["key", "summary", "status"]) tests(limit: ${PAGE_SIZE}, start: 0) { ${testFields} } } } }`,
  );
  const execution = data?.getTestExecutions?.results?.[0];
  if (!execution) return null;
  const total = execution.tests?.total ?? 0;
  const results = [...(execution.tests?.results ?? [])];
  while (results.length < total) {
    const page = await graphql(
      `{ getTestExecution(issueId: "${execution.issueId}") { tests(limit: ${PAGE_SIZE}, start: ${results.length}) { ${testFields} } } }`,
    );
    const more = page?.getTestExecution?.tests?.results ?? [];
    if (!more.length) break;
    results.push(...more);
  }
  if (results.length !== total) throw new ImportError(`Read ${results.length} of ${total} Tests of ${key} from Xray; stopping.`);
  const tests = results.map(t => ({
    key: t.jira?.key ?? '',
    summary: t.jira?.summary ?? '',
    type: t.testType?.name ?? '?',
    kind: t.testType?.kind ?? '?',
  }));
  return {
    issueId: execution.issueId,
    key: execution.jira?.key ?? key,
    summary: execution.jira?.summary ?? '',
    status: execution.jira?.status?.name ?? '',
    environments: execution.testEnvironments ?? [],
    tests,
    testKeys: new Set(tests.map(t => t.key).filter(Boolean)),
    testTotal: total,
  };
}

/**
 * List the chromium Playwright tests WITHOUT running them and read their Xray mapping from the
 * existing annotations: a test is mapped when it has the @xray tag and exactly one valid
 * `test_key` of this project. Everything else that looks like a mapping attempt is returned as
 * an annotation problem. Returns { byKey: Map<key, test>, problems: Map<key|'', string[]> }.
 */
function listPlaywrightMappings(projectKey) {
  const listed = spawnSync(`npx playwright test --list --reporter=json --project=${PLAYWRIGHT_PROJECT}`, {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(listed.stdout);
  } catch {
    throw new ImportError(`Could not list the Playwright tests (exit ${listed.status}): ${(listed.stderr || listed.stdout).slice(0, 1000)}`);
  }
  if (report.errors?.length) {
    throw new ImportError(`Could not list the Playwright tests: ${report.errors.map(e => e.message).join('\n').slice(0, 1000)}`);
  }

  const tests = [];
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.projectName !== PLAYWRIGHT_PROJECT) continue;
        tests.push({
          titlePath: [...titles, spec.title],
          location: `${spec.file}:${spec.line}`,
          tagged: (spec.tags ?? []).includes('xray'),
          keys: (t.annotations ?? []).filter(a => a.type === 'test_key').map(a => (a.description ?? '').trim()),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
  };
  for (const fileSuite of report.suites ?? []) walk(fileSuite, [fileSuite.title]);

  const candidates = new Map();
  const problems = new Map();
  const problem = (key, text) => problems.set(key, [...(problems.get(key) ?? []), text]);
  for (const test of tests) {
    const where = `${test.location} › ${test.titlePath.at(-1)}`;
    if (!test.keys.length) {
      if (test.tagged) problem('', `${where}: tagged @xray but has no test_key annotation`);
      continue;
    }
    if (test.keys.length > 1) {
      for (const key of test.keys) problem(key, `${where}: has several test_key annotations (${test.keys.join(', ')})`);
      continue;
    }
    const [key] = test.keys;
    if (!ISSUE_KEY.test(key)) problem(key, `${where}: test_key "${key}" is not a valid issue key`);
    else if (!key.startsWith(`${projectKey}-`)) problem(key, `${where}: test_key ${key} is not in project ${projectKey}`);
    else if (!test.tagged) problem(key, `${where}: has test_key ${key} but no @xray tag`);
    else candidates.set(key, [...(candidates.get(key) ?? []), { ...test, key, where }]);
  }
  const byKey = new Map();
  for (const [key, list] of candidates) {
    if (list.length > 1) problem(key, `test_key ${key} is used by ${list.length} tests: ${list.map(t => t.where).join('; ')}`);
    else byKey.set(key, list[0]);
  }
  return { byKey, problems };
}

/** Decide, for every Test of the Test Execution, whether a Playwright test will run for it. */
function resolveSelection(target, { byKey, problems }) {
  const selected = [];
  const unresolved = [];
  for (const test of target.tests) {
    const mapped = byKey.get(test.key);
    if (mapped) selected.push({ ...test, playwright: mapped });
    else if (problems.has(test.key)) unresolved.push({ ...test, reason: `incorrect annotation – ${problems.get(test.key).join('; ')}` });
    else if (test.kind === 'Steps') unresolved.push({ ...test, reason: `${test.type} test – not automated` });
    else unresolved.push({ ...test, reason: `no Playwright test has test_key ${test.key} (${test.type} test)` });
  }
  return { selected, unresolved };
}

/** GitHub Actions workflow-command annotation (no-op elsewhere); newlines must be URL-encoded. */
function annotate(level, title, message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::${level} title=${title}::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
}

function defaultSummary(environment) {
  const when = new Date().toLocaleString('sv-SE').slice(0, 16);
  const { GITHUB_ACTIONS, GITHUB_RUN_NUMBER, GITHUB_SHA } = process.env;
  const source = GITHUB_ACTIONS ? `CI run #${GITHUB_RUN_NUMBER} (${(GITHUB_SHA ?? '').slice(0, 7)})` : 'local run';
  return `Playwright ${source} – ${environment} – ${when}`;
}

/** Build the HTTP request for either mode (no token in it; added when sent). */
function buildImportRequest(xml) {
  if (testExecKey) {
    // Existing Test Execution: plain JUnit endpoint with testExecKey. No environment and no
    // summary are sent, so the Test Execution's own fields stay as they are.
    const params = new URLSearchParams({ projectKey: args.project, testExecKey });
    if (args['test-plan']) params.set('testPlanKey', args['test-plan']);
    return {
      url: `${XRAY_BASE_URL}/import/execution/junit?${params}`,
      headers: { 'Content-Type': 'text/xml' },
      body: xml,
      describe: `POST ${XRAY_BASE_URL}/import/execution/junit?${params}  (Content-Type: text/xml, ${Buffer.byteLength(xml)} bytes)`,
      summary: null,
    };
  }
  const info = {
    fields: {
      project: { key: args.project },
      summary: args.summary || defaultSummary(args.environment),
      issuetype: { name: 'Test Execution' },
    },
    xrayFields: {
      environments: [args.environment],
      ...(args['test-plan'] ? { testPlanKey: args['test-plan'] } : {}),
    },
  };
  const form = new FormData();
  form.append('results', new Blob([xml], { type: 'text/xml' }), 'results.xml');
  form.append('info', new Blob([JSON.stringify(info)], { type: 'application/json' }), 'info.json');
  return {
    url: `${XRAY_BASE_URL}/import/execution/junit/multipart`,
    headers: {},
    body: form,
    describe: `POST ${XRAY_BASE_URL}/import/execution/junit/multipart  (multipart: results.xml + info.json ${JSON.stringify(info)})`,
    summary: info.fields.summary,
  };
}

async function sendImport(request) {
  const response = await fetch(request.url, {
    method: 'POST',
    headers: { ...request.headers, Authorization: `Bearer ${await getToken()}` },
    body: request.body,
  });
  const body = await response.text();
  if (!response.ok) throw new ImportError(`Xray import failed: HTTP ${response.status} ${body}`);
  return JSON.parse(body);
}

async function readBackRuns(issueId) {
  const runs = [];
  for (;;) {
    const data = await graphql(
      `{ getTestExecution(issueId: "${issueId}") { testRuns(limit: ${PAGE_SIZE}, start: ${runs.length}) {` +
        ` total results { status { name } test { jira(fields: ["key"]) } } } } }`,
    );
    const page = data?.getTestExecution?.testRuns;
    runs.push(...(page?.results ?? []));
    if (!page?.results?.length || runs.length >= (page.total ?? 0)) return runs;
  }
}

/** In GitHub Actions, append a Markdown section to the job summary (no-op elsewhere). */
function stepSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${markdown}\n`);
}

/** In GitHub Actions, set a step output (no-op elsewhere). */
function stepOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

const summaryRows = (rows) => ['| Xray Test | Report | Xray | Playwright test |', '|---|---|---|---|', ...rows].join('\n');

async function main() {
  let testExitCode = 0;
  let target = null;

  // Check the target Test Execution before spending time on the tests.
  if (testExecKey) {
    if (!ISSUE_KEY.test(testExecKey)) throw new ImportError(`Invalid Test Execution key "${testExecKey}".`);
    if (!testExecKey.startsWith(`${args.project}-`)) {
      throw new ImportError(`Test Execution ${testExecKey} is not in project ${args.project}; refusing to import.`);
    }
    target = await findTestExecution(testExecKey);
    if (!target) {
      throw new ImportError(`${testExecKey} was not found in Xray as a Test Execution; nothing imported.`);
    }
    console.log(
      `Target: existing Test Execution ${target.key} "${target.summary}" (status ${target.status || '?'}, ` +
        `${target.testTotal} test(s): ${[...target.testKeys].join(', ') || 'none'}). No new Test Execution will be created.`,
    );
  } else {
    console.log(`Target: a NEW Test Execution in ${args.project} (no Test Execution key given).`);
  }

  // Dynamic test selection: with a Test Execution key, run only the Playwright tests mapped to
  // the Tests selected in that Test Execution.
  let selection = null;
  let command = PLAYWRIGHT_COMMAND;
  let testListFile = null;
  if (args.run && target) {
    if (!target.testTotal) throw new ImportError(`${target.key} contains no Tests; nothing executed or imported.`);
    const mappings = listPlaywrightMappings(args.project);
    selection = resolveSelection(target, mappings);
    console.log(`\nTest selection from ${target.key} (${target.testTotal} Test(s)):`);
    for (const t of selection.selected) console.log(`  run      ${t.key.padEnd(8)} ${t.type.padEnd(8)} ${t.playwright.where}`);
    for (const t of selection.unresolved) console.log(`  NOT RUN  ${t.key.padEnd(8)} ${t.type.padEnd(8)} ${t.reason}`);
    // Annotation problems in tests that are not part of this Test Execution: worth fixing, not blocking.
    for (const [key, texts] of mappings.problems) {
      if (!target.testKeys.has(key)) for (const text of texts) console.log(`  note     ${text}`);
    }
    stepSummary(
      `## Test selection from ${target.key}\n\n| Xray Test | Type | Decision | Playwright test / reason |\n|---|---|---|---|\n` +
        [
          ...selection.selected.map(t => `| ${t.key} | ${t.type} | run | ${t.playwright.where} |`),
          ...selection.unresolved.map(t => `| ${t.key} | ${t.type} | **not run** | ${t.reason} |`),
        ].join('\n') + '\n',
    );
    if (selection.unresolved.length) {
      annotate(
        'warning',
        `${selection.unresolved.length} Xray Test(s) not executed`,
        selection.unresolved.map(t => `${t.key}: ${t.reason}`).join('\n') +
          '\nThey are not imported; their status in Xray is left unchanged.',
      );
    }
    if (!selection.selected.length) {
      throw new ImportError(
        `${target.key} contains no Tests mapped to a Playwright test (${selection.unresolved.map(t => t.key).join(', ')}); ` +
          'no tests executed and nothing imported.',
      );
    }
    const lines = selection.selected.map(t => `[${PLAYWRIGHT_PROJECT}] › ${t.playwright.titlePath.join(' › ')}`);
    // Outside test-results/, which Playwright empties when the run starts.
    testListFile = join(tmpdir(), `xray-selection-${target.key}-${process.pid}.txt`);
    writeFileSync(testListFile, `# Tests selected in ${target.key}\n${lines.join('\n')}\n`);
    command = `npx playwright test --project=${PLAYWRIGHT_PROJECT} --test-list "${testListFile}"`;
    console.log(`\n${selection.selected.length} of ${target.testTotal} Test(s) will be executed:\n${lines.map(l => `  ${l}`).join('\n')}`);

    if (args['dry-run']) {
      console.log(`\nDry run: would run > ${command}\nNo Playwright tests were executed and nothing was sent to Xray.`);
      stepSummary(`Dry run: ${selection.selected.length} test(s) would be executed; nothing executed or imported.\n`);
      rmSync(testListFile, { force: true });
      return 0;
    }
  }

  if (args.run) {
    const startedAt = Date.now();
    console.log(`> ${command}`);
    try {
      testExitCode = spawnSync(command, { stdio: 'inherit', shell: true }).status ?? 1;
    } finally {
      if (testListFile) rmSync(testListFile, { force: true });
    }
    if (!existsSync(args.file) || statSync(args.file).mtimeMs < startedAt) {
      throw new ImportError(`Playwright did not write a new report to ${args.file}; nothing imported.`);
    }
  }

  if (!existsSync(args.file)) throw new ImportError(`Report not found: ${args.file}. Run the tests first or use --run.`);
  const ageMinutes = Math.round((Date.now() - statSync(args.file).mtimeMs) / 60000);
  console.log(`\nReport: ${args.file} (written ${ageMinutes} min ago)`);

  const report = readFileSync(args.file, 'utf8');
  if (!/<testsuites\b/.test(report)) throw new ImportError(`${args.file} is not a JUnit report (no <testsuites>); nothing imported.`);
  validateKeys(filterReport(report).kept, args.project);
  // With dynamic selection only the selected Tests are imported; otherwise all Tests of the target.
  const allowedKeys = selection ? new Set(selection.selected.map(t => t.key)) : target?.testKeys ?? null;
  const { xml, kept, dropped, excluded } = filterReport(report, allowedKeys);
  for (const c of kept) console.log(`  import   ${c.key.padEnd(8)} ${c.status.padEnd(7)} ${c.file} › ${c.name}`);
  for (const c of excluded) console.log(`  skip     ${c.key.padEnd(8)} not selected in ${target.key}  ${c.file} › ${c.name}`);
  for (const c of dropped) console.log(`  skip     (no test_key)     ${c.file} › ${c.name}`);
  // Every selected Test must have a result; one without is reported and makes the run fail.
  const missing = (selection?.selected ?? []).filter(t => !kept.some(c => c.key === t.key));
  for (const t of missing) console.log(`  MISSING  ${t.key.padEnd(8)} selected and mapped, but no result in the report (${t.playwright.where})`);
  if (!kept.length) {
    throw new ImportError(
      `None of the report's Xray Tests belong to ${target.key}; nothing imported (Tests are never added to it).`,
    );
  }
  const payloadFile = join(dirname(args.file), 'xray-import.xml');
  writeFileSync(payloadFile, xml);
  console.log(`  payload written to ${payloadFile}`);

  await getToken();
  const request = buildImportRequest(xml);
  console.log(`\nRequest: ${request.describe}`);
  const excludedRows = [
    ...excluded.map(c => `| ${c.key} | ${c.status} | not selected in ${target.key} – not imported | ${c.file} › ${c.name} |`),
    ...missing.map(t => `| ${t.key} | **no result** | not imported | ${t.playwright.where} |`),
  ];

  if (args['dry-run']) {
    console.log(`Dry run: ${kept.length} result(s) would be imported into ${target ? target.key : `a new Test Execution in ${args.project}`}. Nothing was sent.`);
    stepSummary(
      `## Xray import (dry run – nothing sent)\n\nTarget: ${target ? `existing Test Execution ${target.key}` : 'new Test Execution'}` +
        ` · Playwright exit code: ${testExitCode}\n\n` +
        summaryRows([...kept.map(c => `| ${c.key} | ${c.status} | – | ${c.file} › ${c.name} |`), ...excludedRows]),
    );
    return testExitCode;
  }

  const response = await sendImport(request);
  if (target && response.key !== target.key) {
    throw new ImportError(
      `Xray imported into ${response.key} instead of ${target.key}. Check both in Xray; nothing will be cleaned up automatically.`,
    );
  }
  const executionKey = response.key;
  console.log(target ? `\nUpdated Test Execution ${executionKey}.` : `\nCreated Test Execution ${executionKey}: "${request.summary}"`);
  stepOutput('test_execution_key', executionKey);

  const runs = await readBackRuns(response.id);
  let mismatches = 0;
  const rows = [];
  for (const expected of kept) {
    const actual = runs.find(r => r.test?.jira?.key === expected.key)?.status?.name ?? 'MISSING';
    const ok = actual === expected.status || (expected.status === 'SKIPPED' && actual === 'TODO');
    if (!ok) mismatches += 1;
    console.log(`  ${ok ? 'ok      ' : 'MISMATCH'} ${expected.key.padEnd(8)} report ${expected.status.padEnd(7)} xray ${actual}`);
    rows.push(`| ${expected.key} | ${expected.status} | ${ok ? actual : `**${actual} (mismatch)**`} | ${expected.file} › ${expected.name} |`);
  }
  // A new Test Execution must contain exactly the imported runs; an existing one may have other runs.
  const expectedRuns = target ? target.testTotal : kept.length;
  if (runs.length !== expectedRuns) {
    console.log(`  WARNING: ${runs.length} run(s) in Xray, ${expectedRuns} expected.`);
    mismatches += 1;
  }
  stepSummary(
    `## Xray import: Test Execution ${executionKey} ${target ? '(existing – updated)' : '(new)'}\n\n` +
      `${target ? target.summary : request.summary}\n\n` +
      `Playwright exit code: ${testExitCode} · Read-back: ${mismatches ? '**mismatch**' : 'all statuses match'}\n\n` +
      summaryRows([...rows, ...excludedRows]),
  );
  if (mismatches) throw new ImportError(`Imported into ${executionKey}, but the read-back did not match. Check it in Xray.`);
  if (missing.length) {
    throw new ImportError(`No result for selected Test(s) ${missing.map(t => t.key).join(', ')}; they were not imported. Check the Playwright output.`);
  }
  if (selection?.unresolved.length) {
    console.log(`\nNot executed (status in ${executionKey} unchanged): ${selection.unresolved.map(t => `${t.key} (${t.reason})`).join('; ')}`);
  }
  return testExitCode;
}

main()
  .then(code => {
    process.exitCode = code;
  })
  .catch(error => {
    const message = error instanceof ImportError ? error.message : error.stack;
    console.error(`\n${message}`);
    if (process.env.GITHUB_ACTIONS) {
      // Workflow-command annotation; newlines must be URL-encoded.
      console.log(`::error title=Xray import failed::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
      stepSummary(`## Xray import failed\n\n\`\`\`\n${message}\n\`\`\``);
    }
    process.exitCode = 2;
  });
