# Playwright → Xray CI pipeline

The GitHub Actions workflow [`.github/workflows/xray-ci.yml`](../.github/workflows/xray-ci.yml) runs the Playwright tests that are linked to Xray Tests. It then imports their results into Xray Cloud, in Jira project **QTM**. Each result is recorded against the existing Xray Test, and no new tests are created.

Where the results go depends on how the workflow was started:

| Started by | `test_execution_key` | Result |
|---|---|---|
| Jira Automation (Test Execution moved to READY FOR AUTOMATION) | the original key, e.g. `QTM-20` | That **existing** Test Execution is updated. No new Test Execution is created |
| Manual run in GitHub with a key | e.g. `QTM-20` | Same: the existing Test Execution is updated |
| Push to `main`, or a manual run with the key left empty | empty | A **new** Test Execution is created |

### Updating an existing Test Execution

1. **The key is checked before any tests run.** It must look like `QTM-<n>`, belong to project QTM, and be a Test Execution in Xray (read-only GraphQL lookup). If not, the run stops with exit code 2.
2. **Only that execution's tests are imported.** Results for Xray Tests that are not already in the Test Execution are skipped and listed as "not in QTM-20". Xray would otherwise add those tests to it. If none of the results belong to it, nothing is imported.
3. **The request goes to the plain JUnit endpoint:** `POST /api/v2/import/execution/junit?projectKey=QTM&testExecKey=QTM-20` (`Content-Type: text/xml`). No environment, summary or other field is sent, so the Test Execution's own fields stay unchanged.
4. **The response is checked.** If Xray names any other issue than the original key, the run fails with exit code 2. Nothing is cleaned up automatically.
5. **Results are read back** from the original Test Execution, and its key is published as the job output `test_execution_key`.

| Playwright test | Xray Test |
|---|---|
| `tests/product-details.spec.ts` › View the details for Blue Top | QTM-8 |
| `tests/product-search.spec.ts` › Search for a matching product and verify the result | QTM-9 |

## How it works

```
GitHub Actions (ubuntu-latest, Node 20.12.2, Chromium)
  └─ npm run test:xray:report            (= node scripts/xray-import.mjs --run)
       1. npx playwright test --project=chromium --grep @xray
            → test-results/junit/results.xml   (JUnit reporter in playwright.config.ts)
       2. keep only <testcase>s with a test_key property → test-results/junit/xray-import.xml
       3. validate the keys (present, QTM-*, unique)
       4. POST /api/v2/authenticate                     (XRAY_CLIENT_ID / XRAY_CLIENT_SECRET)
       5a. key given: POST /api/v2/import/execution/junit?projectKey=QTM&testExecKey=<key>  (updates it)
       5b. no key:    POST /api/v2/import/execution/junit/multipart                      (creates one)
       6. GraphQL getTestExecution → compare each Xray status with the report
  └─ upload artifacts: HTML report, JUnit report, import payload, traces
```

**How results map to tests.** Each linked test has two markers:

```ts
test('…', {
  tag: ['@poc', '@xray'],                                   // selects the test for this pipeline
  annotation: { type: 'test_key', description: 'QTM-8' },   // maps the result to the Xray Test
}, async ({ page }) => { … });
```

- **The JUnit reporter writes the annotation as a property.** Playwright writes it as `<property name="test_key" value="QTM-8"/>`, and Xray uses that key to find the existing Test. The mapping does not depend on test names, so renaming a test does not break it.

**How the pipeline avoids duplicate Xray Tests:**
- **Unmapped results are dropped.** The script removes every result without a `test_key` before the import. Otherwise Xray would auto-create a new Generic Test for it.
- **Only Chromium runs.** Each key therefore appears once.
- **Retries don't add results.** CI retries failed tests up to 2 times (`retries: process.env.CI ? 2 : 0`), but the JUnit reporter still writes one result per test.
- **Bad keys stop the import.** A key that appears twice, belongs to another project, or is malformed stops the import (exit code 2), and nothing is sent.
- **A key that doesn't exist is rejected by Xray** instead of creating a new test.

## Triggers

| Trigger | What happens |
|---|---|
| Push to `main` | Tests run and a new Test Execution is created |
| Manual: **Actions → Playwright Xray CI → Run workflow** | Same, with three optional inputs (below) |
| Jira Automation (`workflow_dispatch` through the GitHub API, with input `test_execution_key`) | Tests run and the given Test Execution is updated |
| Pull requests | **Not triggered**, so each PR commit doesn't create a Test Execution. The existing `Playwright CI` workflow still tests PRs |

Manual run inputs:

| Input | Default | Effect |
|---|---|---|
| `test_execution_key` | empty | Existing Test Execution to update, e.g. `QTM-20`. Empty creates a new one |
| `dry_run` | off | Runs the tests, checks the mapping, the Xray credentials and the target Test Execution, and prints the exact request, but **sends no results** |
| `test_plan_key` | empty | Links the Test Execution to an existing Xray Test Plan |

A manual run is only possible once the workflow file is on the default branch (`main`).

Triggering the pipeline from Jira/Xray is a separate, later phase.

## Required setup

### 1. GitHub repository secrets

Add these under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `XRAY_CLIENT_ID` | Client ID of an Xray Cloud API key (Xray → Settings → API Keys) |
| `XRAY_CLIENT_SECRET` | Client secret of the same API key |

- **The first step checks for them.** It fails with a clear error if either secret is missing, before any tests run.
- **Fork pull requests can't use them.** GitHub does not pass secrets to workflows from forks, and this workflow doesn't run on pull requests anyway.
- **The secrets stay out of the logs.** The script never prints the credentials or the access token, and GitHub masks secret values in logs.
- **The test-site credentials aren't passed.** The linked tests don't log in, so `AE_POC_EMAIL` and `AE_POC_PASSWORD` aren't needed here.

### 2. Xray project configuration (already done for QTM)

- **QTM-8 and QTM-9 are Xray Tests of type Generic.**
- **The test environment `chromium` is enabled in the QTM project** (Xray project settings → Test Environments). Without it, Xray rejects the import with HTTP 400 "environments dont exist or are not in the context of test execution project". A *global* environment alone is not enough.

### 3. Fixed settings in the workflow

| Variable | Value | Purpose |
|---|---|---|
| `XRAY_PROJECT_KEY` | `QTM` | Project of the Test Execution; every `test_key` must belong to it |
| `XRAY_TEST_ENVIRONMENT` | `chromium` | Test environment set on the Test Execution |

## Status and failure handling

| Situation | Step result | Imported into Xray? | Exit code |
|---|---|---|---|
| All tests pass and the import succeeds | ✅ success | Yes, all PASSED | 0 |
| A test fails, even after 2 retries | ❌ failed | **Yes**, that test is FAILED in Xray | 1 (Playwright's code) |
| A test passes on a retry (flaky) | ✅ success | Yes, PASSED | 0 |
| Import refused before sending (no keys, duplicate key, wrong project) | ❌ failed | No | 2 |
| Xray rejects the request (bad credentials, environment, Test Plan, HTTP 4xx/5xx) | ❌ failed | No | 2 |
| Imported, but the read-back doesn't match the report | ❌ failed | Yes, check it in Xray | 2 |
| Secrets missing | ❌ failed at the first step | No (tests not run) | 1 |

Where to see each run's outcome:

- **Job summary** on the run page: a table of each Xray Test with its report status and Xray status, the Test Execution key and the Playwright exit code. A failed import gets its own summary section.
- **Error annotation** (`Xray import failed`) when the import fails.
- **Artifacts** (kept for 14 days):
  - `xray-playwright-html-report`: the Playwright HTML report.
  - `xray-test-results`: `junit/results.xml` (the full report), `junit/xray-import.xml` (the exact payload sent to Xray), and traces from retried tests.

Concurrent runs are queued (`concurrency: xray-import`), never run in parallel and never cancelled.

## Running it

**In GitHub:** **Actions → Playwright Xray CI → Run workflow**, choose the branch, and optionally tick *Dry run* or enter a Test Plan key. Pushing to `main` also starts it.

**Locally (same command):**

```powershell
npm run test:xray:report                 # run the @xray tests and import
npm run test:xray:report -- --dry-run    # run and check, but don't import
npm run test:xray:report -- --test-exec QTM-20   # run and update existing Test Execution QTM-20
npm run xray:import                      # import the last report again
```

Locally, the credentials come from `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET`. On Windows, if those aren't set, the script uses the Credential Manager entry `XrayAPI` (`cmdkey /generic:XrayAPI /user:<client id> /pass:<client secret>`).

## Verifying an import

1. **The job summary** shows `Test Execution QTM-NN` with QTM-8 and QTM-9 and *all statuses match*.
2. **In Jira:** open QTM-NN. Its runs are linked to the existing QTM-8 and QTM-9, and the environment is `chromium`.
3. **No new tests.** In Jira, search `project = QTM AND issuetype = "Xray Test"`; it should list only the existing tests (QTM-6 to QTM-9 as of 2026-11-19).

### Validating the update mode with an existing Test Execution

1. **Pick a Test Execution** that already contains QTM-8 and/or QTM-9, e.g. one created for this purpose. Note its key and its current number of Test Executions in QTM.
2. **Dry run first.** Locally, run `npm run test:xray:report -- --dry-run --test-exec QTM-20`. In GitHub, run the workflow with `test_execution_key` = `QTM-20` and *Dry run* ticked. The log must show `Target: existing Test Execution QTM-20 …` and `Request: POST …/import/execution/junit?projectKey=QTM&testExecKey=QTM-20`.
3. **Real run.** Transition the Test Execution to READY FOR AUTOMATION, or run the workflow with the key and without *Dry run*.
4. **Check the result:**
   - The job summary says `Test Execution QTM-20 (existing – updated)`, and the job output `test_execution_key` is `QTM-20`.
   - In Jira, QTM-20 shows the new results for its tests (run times = import time).
   - `project = QTM AND issuetype = "Test Execution"` returns the same number of issues as before, so no new Test Execution was created.
   - `project = QTM AND issuetype = "Xray Test"` is unchanged, so no new tests were created.

## Jira status update

The repository contains **no Jira status-update code**; the workflow and script never transition Jira issues. If a Jira Automation rule moves the Test Execution to a final status after the run, it must use the original issue (the rule's trigger issue, or the key it sent as `test_execution_key`), not an issue looked up by creation date. The key that received the results is available as:
- the job output `test_execution_key`,
- the heading of the job summary.

## Linking another test

1. **Make sure an Xray Test exists in QTM** (type Generic is recommended for automated tests).
2. **Add the tag and annotation** to the Playwright test: `tag: ['@xray']` and `annotation: { type: 'test_key', description: 'QTM-<n>' }`.
3. **Check it with a dry run:** `npm run test:xray:report -- --dry-run` should list the new key under `import`.

## Notes

- **The summary timestamp is in UTC.** The default Test Execution summary is `Playwright CI run #<run number> (<short SHA>) – chromium – <YYYY-MM-DD HH:mm>`, and the GitHub-hosted runners use UTC.
- **The `Playwright CI` workflow is unchanged** and still runs the full Chromium and BDD suites. It also writes a JUnit report but does not import it.
