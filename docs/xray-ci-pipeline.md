# Playwright → Xray CI pipeline

The GitHub Actions workflow [`.github/workflows/xray-ci.yml`](../.github/workflows/xray-ci.yml) runs the Playwright tests that are linked to Xray Tests. It then imports their results into Xray Cloud, in Jira project **QTM**. Each result is recorded against the existing Xray Test, and no new tests are created.

Where the results go depends on how the workflow was started:

| Started by | `test_execution_key` | Result |
|---|---|---|
| Jira Automation (Test Execution moved to READY FOR AUTOMATION) | the original key, e.g. `QTM-20` | **Only the tests selected in that Test Execution** are run ([dynamic test selection](#dynamic-test-selection)), and that **existing** Test Execution is updated. No new Test Execution is created |
| Manual run in GitHub with a key | e.g. `QTM-20` | Same: selected tests only, and the existing Test Execution is updated |
| Push to `main`, or a manual run with the key left empty | empty | **All** `@xray` tests run, and a **new** Test Execution is created |

### Updating an existing Test Execution

1. **The key is checked before any tests run.** It must look like `QTM-<n>`, belong to project QTM, and be a Test Execution in Xray (read-only GraphQL lookup). If not, the run stops with exit code 2.
2. **Only the selected tests run and are imported.** See [Dynamic test selection](#dynamic-test-selection). Results for Xray Tests that are not in the Test Execution are never sent, because Xray would otherwise add those tests to it.
3. **The request goes to the plain JUnit endpoint:** `POST /api/v2/import/execution/junit?projectKey=QTM&testExecKey=QTM-20` (`Content-Type: text/xml`). No environment, summary or other field is sent, so the Test Execution's own fields stay unchanged.
4. **The response is checked.** If Xray names any other issue than the original key, the run fails with exit code 2. Nothing is cleaned up automatically.
5. **Results are read back** from the original Test Execution, and its key is published as the job output `test_execution_key`.

| Playwright test | Xray Test |
|---|---|
| `tests/product-details.spec.ts` › View the details for Blue Top | QTM-8 |
| `tests/product-search.spec.ts` › Search for a matching product and verify the result | QTM-9 |

## Dynamic test selection

When the script runs with a Test Execution key (`--run --test-exec <key>`, or `test_execution_key` in the workflow), it runs **only** the Playwright tests for the Xray Tests that the tester added to that Test Execution.

1. **Read the selection from Xray.** A GraphQL `getTestExecutions(jql: "key = <key>")` returns the Test Execution's Tests with their key, summary and test type. Pages of 100 are read until `total` is reached, and the run stops if fewer Tests come back.
2. **Read the mapping from the code, without running it.** `npx playwright test --list --reporter=json --project=chromium` lists every Chromium test with its tags and annotations. A test is **mapped** when it has the `@xray` tag and exactly one `test_key` annotation with a valid key of project QTM. These are the same markers that the import uses, so there is no second mapping to maintain.
3. **Classify every selected Xray Test:**

   | Case | Decision | Shown in the log as |
   |---|---|---|
   | Exactly one mapped Playwright test | **run** | `run      QTM-8    Generic  product-details.spec.ts:4 › …` |
   | Xray test type is Manual (`kind: Steps`) | not run | `NOT RUN  QTM-6    Manual   Manual test – not automated` |
   | No Playwright test has that `test_key` (e.g. a Generic or Cucumber Test that isn't automated yet) | not run | `no Playwright test has test_key QTM-40 (Generic test)` |
   | Wrong annotation: `test_key` but no `@xray` tag, several `test_key`s on one test, or the same key on several tests | not run | `incorrect annotation – <file:line> › <title>: …` |

   Annotation problems in tests that aren't part of the Test Execution, such as `@xray` without a `test_key` or a malformed key, are printed as `note` lines but don't block the run.
4. **Report what isn't run, every time.** Not-run Tests appear in the log, in the *Test selection* table of the job summary, and in a GitHub **warning annotation** ("N Xray Test(s) not executed"). They are **not imported**, so their status in Xray stays as it was; they are never marked as passed.
5. **Stop if nothing is mapped.** If no selected Test is mapped, or the Test Execution has no Tests, the script stops with exit code 2 **before** running Playwright, and nothing is imported. In a Jira-triggered run the final Jira step then sets the issue to **Failed**, with a comment linking to the run.
6. **Run only the mapped tests.** The script writes their full title paths to a temporary [test list](https://playwright.dev/docs/test-cli) file (outside `test-results/`, which Playwright empties) and runs
   `npx playwright test --project=chromium --test-list <file>`. It uses the same `playwright.config.ts`, retries, HTML report and JUnit report (`test-results/junit/results.xml`) as before.
7. **Import only the selected results** into the original Test Execution (`testExecKey`), as described above. A selected test that produced **no result** in the report is listed as `MISSING` and makes the run fail with exit code 2. Results that were produced are still imported first.

Example: QTM-11 contains QTM-8 (automated) and QTM-7 (Manual). Only `product-details.spec.ts` runs. QTM-8's result is imported into QTM-11, and QTM-7 is reported as *not automated*, keeping its status.

### Dry run with a key: preview the selection

```powershell
npm run test:xray:report -- --test-exec QTM-11 --dry-run
```

This reads the Test Execution and the mapping and prints the decisions, the test list and the exact Playwright command. **No tests run and nothing is sent to Xray.** In GitHub, run the workflow with `test_execution_key` and *Dry run* ticked; the Jira step then only reports which transition it would use. A dry run without a key keeps its old behaviour: all `@xray` tests run, and only the import is skipped.

Sample output (real dry run against QTM-11, 2026-11-27):

```text
Target: existing Test Execution QTM-11 "Regression Test" (status No run, 2 test(s): QTM-8, QTM-7). No new Test Execution will be created.

Test selection from QTM-11 (2 Test(s)):
  run      QTM-8    Generic  product-details.spec.ts:4 › View the details for Blue Top
  NOT RUN  QTM-7    Manual   Manual test – not automated

1 of 2 Test(s) will be executed:
  [chromium] › product-details.spec.ts › View product details › View the details for Blue Top

Dry run: would run > npx playwright test --project=chromium --test-list "…\xray-selection-QTM-11-47888.txt"
No Playwright tests were executed and nothing was sent to Xray.
```

### Limitations and assumptions

- **Chromium only.** Selection uses the `chromium` project, as the import always has. The BDD project (`bdd-chromium`) isn't linked to Xray, so Cucumber Tests are reported as unmapped.
- **"Manual" comes from the Xray test type.** A Test counts as manual when its Xray type kind is `Steps`. Any other type without a Playwright test is reported as *no Playwright test*.
- **The Jira status ignores tests that weren't run.** The final Jira status reflects only the tests that ran. A Test Execution with an automated and a manual Test becomes **Completed** when the automated one passes, and the manual Test stays TODO in Xray. The warning annotation and job summary show this.
- **Not-run Tests are left untouched.** They aren't imported as TODO or ABORTED, so their earlier status in the Test Execution, if any, stays.
- **`--test-list` needs Playwright 1.56 or later** (the project uses 1.64).
- **Without `--run`** (re-importing an existing report into a Test Execution), no selection happens. As before, only results for the Test Execution's Tests are sent.

## How it works

```
GitHub Actions (ubuntu-latest, Node 20.12.2, Chromium)
  └─ npm run test:xray:report            (= node scripts/xray-import.mjs --run)
       0. key given: read its Tests from Xray (GraphQL, paged) + `playwright test --list` mapping
            → selected tests only (see "Dynamic test selection"); stop if none is mapped
       1. no key:  npx playwright test --project=chromium --grep @xray
          key:     npx playwright test --project=chromium --test-list <selected tests>
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
| `dry_run` | off | **Sends no results.** With a key it only shows the test selection, and no tests run. Without a key it runs the tests, checks the mapping, the Xray credentials and the target, and prints the exact request |
| `test_plan_key` | empty | Links the Test Execution to an existing Xray Test Plan |

A manual run is only possible once the workflow file is on the default branch (`main`).

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
| Key given: some selected Tests are manual, unmapped or wrongly annotated | ✅/❌ by the tests that ran, plus a ⚠️ warning | Only the tests that ran; the others are unchanged | Playwright's code |
| Key given: no selected Test is mapped, or the Test Execution has no Tests | ❌ failed, **no tests run** | No | 2 |
| Key given: a selected test produced no result in the report | ❌ failed | The other results, yes | 2 |
| Invalid key, not a Test Execution, or another project | ❌ failed before any test | No | 2 |
| Xray authentication or GraphQL error | ❌ failed | No | 2 |
| JUnit report missing, stale or not JUnit | ❌ failed | No | 2 |
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
npm run test:xray:report -- --test-exec QTM-20   # run only the tests selected in QTM-20 and update it
npm run test:xray:report -- --test-exec QTM-20 --dry-run   # preview that selection; nothing runs or is sent
npm run xray:import                      # import the last report again
```

Locally, the credentials come from `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET`. On Windows, if those aren't set, the script uses the Credential Manager entry `XrayAPI` (`cmdkey /generic:XrayAPI /user:<client id> /pass:<client secret>`).

## Verifying an import

1. **The job summary** shows `Test Execution QTM-NN` with QTM-8 and QTM-9 and *all statuses match*.
2. **In Jira:** open QTM-NN. Its runs are linked to the existing QTM-8 and QTM-9, and the environment is `chromium`.
3. **No new tests.** In Jira, search `project = QTM AND issuetype = "Xray Test"`; it should list only the existing tests (QTM-6 to QTM-9 as of 2026-11-19).

### Validating the update mode with an existing Test Execution

1. **Pick a Test Execution** that already contains QTM-8 and/or QTM-9, e.g. one created for this purpose. Note its key and its current number of Test Executions in QTM.
2. **Dry run first.** Locally, run `npm run test:xray:report -- --dry-run --test-exec QTM-20`. In GitHub, run the workflow with `test_execution_key` = `QTM-20` and *Dry run* ticked. The log must show `Target: existing Test Execution QTM-20 …` and the *Test selection* lines (`run` / `NOT RUN`). The import request (`…/import/execution/junit?projectKey=QTM&testExecKey=QTM-20`) is printed only in a real run, just before it is sent.
3. **Real run.** Transition the Test Execution to READY FOR AUTOMATION, or run the workflow with the key and without *Dry run*.
4. **Check the result:**
   - The job summary says `Test Execution QTM-20 (existing – updated)`, and the job output `test_execution_key` is `QTM-20`.
   - In Jira, QTM-20 shows the new results for its tests (run times = import time).
   - `project = QTM AND issuetype = "Test Execution"` returns the same number of issues as before, so no new Test Execution was created.
   - `project = QTM AND issuetype = "Xray Test"` is unchanged, so no new tests were created.
   - The original issue moved from AUTOMATION IN PROGRESS to Completed (or Failed) and has a comment linking to the run.

## Jira status update (Jira-triggered runs only)

The Test Execution workflow is: READY FOR AUTOMATION → (Jira Automation) AUTOMATION IN PROGRESS → **Completed** (transition "Tests passed") or **Failed** (transition "Tests Failed").

The last workflow step, **Update Jira status of the original Test Execution**, runs [`scripts/jira-transition.mjs`](../scripts/jira-transition.mjs) for the key in `test_execution_key`, and only for that key:

| Run outcome | Jira status of the original issue |
|---|---|
| Tests passed and the import succeeded | **Completed**, plus a comment with a link to the GitHub run |
| A test failed, the import failed, or an earlier step failed | **Failed**, plus a comment with a link to the run |
| Dry run | Unchanged. It only checks which transition it would use |
| The issue is not in a status from which Completed/Failed can be reached (e.g. a manual run with a key on an Open issue) | Unchanged. A warning is shown on the run page |

- **The transition is chosen by its target status name,** not its id. The defaults are `Completed` and `Failed`; they can be overridden with the environment variables `JIRA_STATUS_PASSED` and `JIRA_STATUS_FAILED`.
- **The step always runs, even after a failure,** so a Jira-triggered issue never stays in AUTOMATION IN PROGRESS.
- **The step itself fails (exit code 2)** on a Jira API error or missing secrets.

Required GitHub secrets for Jira-triggered runs (checked at the start, only when a key is given):

| Secret | Value |
|---|---|
| `JIRA_BASE_URL` | `https://<site>.atlassian.net` |
| `JIRA_USER_EMAIL` | Email of the Jira account that performs the transition |
| `JIRA_API_TOKEN` | An API token of that account (id.atlassian.com → Security → API tokens). The account needs permission to transition and comment on Test Executions in QTM |

The Jira Automation rule only has to do two things: set AUTOMATION IN PROGRESS, and send the `workflow_dispatch` request with `"inputs": {"test_execution_key": "{{issue.key}}"}`. It must not wait for or look up a newly created issue.

## Linking another test

1. **Make sure an Xray Test exists in QTM** (type Generic is recommended for automated tests).
2. **Add the tag and annotation** to the Playwright test: `tag: ['@xray']` and `annotation: { type: 'test_key', description: 'QTM-<n>' }`.
3. **Check it with a dry run:** `npm run test:xray:report -- --dry-run` should list the new key under `import`. With a Test Execution that contains the new Test, `npm run test:xray:report -- --test-exec QTM-<exec> --dry-run` should show it as `run`, not `NOT RUN`.

## Notes

- **The summary timestamp is in UTC.** The default Test Execution summary is `Playwright CI run #<run number> (<short SHA>) – chromium – <YYYY-MM-DD HH:mm>`, and the GitHub-hosted runners use UTC.
- **The `Playwright CI` workflow is unchanged** and still runs the full Chromium and BDD suites. It also writes a JUnit report but does not import it.
