# Agentic AI POC: Comparative Assessment of AI Coding Agents

**Agents compared:** GitHub Copilot, OpenAI Codex, Claude Code
**Task:** generate five Playwright functional tests (AE-05, AE-07, AE-02, AE-09, AE-10) for the Automation Exercise application
**Assessment date:** 9 November 2026 · **Agent runs:** 4–5 November 2026

> **Evaluator disclosure.** This assessment was written by Claude Code (model Claude Opus 5.5), the same model family as one of the agents under evaluation. To limit bias, every score below is tied to evidence that can be checked independently: source files, Git state, the agents' own session logs, and their Confluence transcripts. Where Claude's own claims could not be checked independently, this report says so. Readers should weigh the Claude scores with this in mind.

---

## A. Executive summary

- **All three agents started from the same baseline** (`863b3eb`) and received the same two prompts: one for planning, one for implementation.
- **GitHub Copilot produced the most dependable result.** It explored the live site before writing assertions, and its five tests passed under the project's unchanged configuration. It needed no extra prompts. It did need 29 manual permission approvals, mostly because it ran in manual-approval mode.
- **Claude Code produced the most thorough analysis and the strongest assertions.** It was the only agent to catch a credential-leak risk in Playwright traces, and its reporting on risk and CI impact was the most detailed. However, its **original** tests waited for the full page `load` event. On this ad-heavy site that made all five time out under the default 30 s limit. They passed only with a longer timeout passed on the command line. Claude put the timeouts down to the environment and said a configuration change was needed. A fix inside the test files was possible, and Copilot's tests show it.
- **OpenAI Codex underperformed in this run.** It did not explore the live site, so it wrote assertions it had not verified. Two of them are wrong: the AE-02 route, and the AE-10 cart precondition, which is checked before login. It never got a passing run. Part of this was environmental (a missing dependency in its worktree and Windows sandbox path errors), and it needed 3 corrective prompts from the user.
- **Overall ranking: 1. Copilot, 2. Claude Code (close behind), 3. Codex.** Copilot and Claude are separated mainly by one factor: whether the delivered tests pass under the project's own settings. The trade-offs are in section F.

---

## 1. POC objective and scope

**Objective:** compare how well three AI coding agents plan, implement, run, debug and report a realistic Playwright task, under identical requirements and restrictions.

**In scope:**
- The five generated test files per agent, as first delivered.
- The agents' planning and implementation reports, from Confluence.
- Local session logs, for timing, tokens and approvals.
- Execution evidence left in each worktree.

**Out of scope, per the requester:**
- A follow-up "fix" prompt given to Claude on 6 Nov, which rewrote parts of its tests.
- Copilot's uncommitted `package.json` and `package-lock.json` changes. Copilot's log shows they were already there before it started.

### Test cases

| ID | Scenario | Type |
|---|---|---|
| AE-05 | Search with no matching product | Read-only |
| AE-07 | Set quantity 3 and verify the cart total (Rs. 1500) | Changes the anonymous cart; must clean up |
| AE-02 | Filter products by the Polo brand | Read-only |
| AE-09 | Login with invalid credentials | One synthetic login attempt |
| AE-10 | Valid login and checkout review, without placing an order | Uses the shared POC account; changes the account cart; Chromium only |

---

## 2. Environment and baseline

| Item | Value |
|---|---|
| Baseline commit | `863b3eb05825002a4971677d6b9b38ceab4c3beb` ("Added API-03 Test"), shared by `main` and all three branches |
| Branches and worktrees | `experiment/copilot-api03` (`agentic-ai-playwright-poc-copilot`), `experiment/codex-api03` (`…-codex`), `experiment/claude-api03` (`…-claude`) |
| Generated files | 5 untracked `tests/ae*.<agent>.spec.ts` files per worktree; no commits on any branch |
| Shared tracked change | `.gitignore` adds `.env`. It is identical in all three worktrees and was made before implementation (all three reports say so) |
| Framework | Playwright 1.64.0, TypeScript, playwright-bdd 9.2.1; Node 20.12.2 |
| Config | `baseURL` `https://www.automationexercise.com`, 30 s test timeout, `fullyParallel`, projects chromium, firefox, webkit and bdd-chromium; `trace: 'on-first-retry'` |
| Credentials | `AE_POC_EMAIL` and `AE_POC_PASSWORD` in a git-ignored `.env`, loaded with `node --env-file=.env` |
| Site conditions on 4–5 Nov | Heavy load: the "queue full" page appeared intermittently, the `load` event took 20–48 s because of ad scripts, and baseline UI tests also timed out |

**Agent configuration (from session logs):**

| | Copilot | Codex | Claude Code |
|---|---|---|---|
| Client | Copilot agent in VS Code (Copilot CLI host) | Codex VS Code extension, CLI 0.164.0-alpha | Claude Code VS Code extension |
| Model | GPT-6 Luna, chosen automatically ("Copilot Fusion") | gpt-6-luna, medium reasoning effort | Claude Opus 5.5 (`claude-opus-5-5`) |
| Permission mode | **Manual**: each non-policy action asks the user | **On request**, with a `workspace-write` sandbox; escalation needs approval | **Auto**: a classifier and config approve actions; no prompts |

> The three agents ran under **different permission modes**, so approval counts are not directly comparable.

---

## 3. Evaluation methodology

1. **Baseline check:** confirmed with `git` that all branches resolve to `863b3eb`, and listed every tracked and untracked change.
2. **Code review:** read each agent's five tests line by line, and compared equivalent tests across agents against the baseline conventions in `tests/product-search.spec.ts`, `cart-validation.spec.ts`, `category-filter.spec.ts` and `product-details.spec.ts`.
3. **Original Claude code:** Claude's 4 Nov files were overwritten on 6 Nov. They were rebuilt by replaying every successful `Write` and `Edit` in Claude's session log (`~/.claude/projects/…-poc-claude/4232d43d….jsonl`) up to the end of the 4 Nov session. The method was checked by replaying the 6 Nov edits on top: for `ae02`, the edited only through those tools, the result matched the file on disk byte for byte. The rebuilt code also matches Claude's documented report (`waitUntil: 'commit'`, the consent block repeated in each file). Copilot's and Codex's files have not changed since 4 Nov, so their current files are their original deliverables.
4. **Transcripts:** read the full Confluence pages ([Co-pilot](https://finacomp.atlassian.net/wiki/spaces/QTM/pages/3089825793/Co-pilot), [Codex](https://finacomp.atlassian.net/wiki/spaces/QTM/pages/3089956865/Codex), [Claude](https://finacomp.atlassian.net/wiki/spaces/QTM/pages/3090186241/Claude)). The Claude page has the same implementation report pasted three times; it counts as one run.
5. **Metrics:** taken from each tool's local session log: Copilot `~/.copilot/session-state/a5b98316…/events.jsonl`, Codex `~/.codex/sessions/2026/11/04/rollout-…01a1a616….jsonl`, and the Claude log above. No metric was estimated from conversation length.
6. **Execution evidence:** the agents' reported runs, cross-checked against leftover `test-results/` and `playwright-report/` data and against the session logs. **No independent re-run was done for this assessment** (see Limitations).
7. **Classifying failures:** each failure is classed as an *implementation defect* (the test code is wrong) or *environmental* (site load, sandbox, missing dependency). Where a timeout could have been avoided by code inside the five files, it is counted as an implementation weakness even if the site was slow.
8. **Same rules for every agent:** the same rubric applies to all three. More code and faster replies earn no credit, and a passing test is not treated as proof of quality.

### Scoring scale

1 = Poor · 2 = Below expectations · 3 = Meets expectations · 4 = Good · 5 = Excellent

---

## B. Comparative scorecard

| # | Criterion | Copilot | Codex | Claude | Key evidence |
|---|---|:-:|:-:|:-:|---|
| 1 | Response and requirement understanding | 4 | 2 | 5 | **Claude and Copilot** explored the live site and found the real route, error text and price format. Claude also flagged the false pass on the queue-full page, the missing CI secrets and the trace credential risk. **Codex** planned from older notes and then invented the AE-02 route and selector. |
| 2 | Speed and efficiency | 3 | 2 | 3 | **Copilot:** 48 min planning (including 6 approval waits) and 25 min implementation, ending with passing tests. **Claude:** 7.5 min planning and 39 min implementation, but the tests do not pass under the default config. **Codex:** about 7 min in total, with nothing runnable, plus 3 corrective follow-ups. |
| 3 | Code quality | 4 | 2 | 4 | **Copilot:** clean, scoped locators and exact assertions, plus a `domcontentloaded` navigation strategy. **Claude:** the strongest assertions and safety measures (trace off, serial mode, false-pass guard), but the default `load` waits make it fragile. **Codex:** wrong AE-02 route, a wrong AE-10 precondition, and `test.use({ browserName })` misused. |
| 4 | Quality of results | 4 | 1 | 2 | **Copilot:** 5/5 passed under the default config (agent-reported, 1 worker). **Claude:** 0/5 under the default config, 5/5 only with `--timeout=120000`. **Codex:** 0/5 ever passed, and AE-10 showed a real defect. |
| 5 | User-friendliness | 3 | 2 | 4 | **Claude:** a structured plan with 5 explicit decisions for the user, and clear warnings. **Copilot:** concise and correct, but the transcript is noisy and needed 29 approvals. **Codex:** honest, but the user had to drive the troubleshooting. |
| 6 | Cost-effectiveness (low confidence) | 4 | 2 | 3 | No billing data. Token volumes are similar for Copilot and Claude; Copilot delivered the most working value per token. Codex used the fewest tokens but delivered no working tests. |
| 7 | Human intervention (higher = less) | 4 | 2 | 5 | **Extra prompts:** Copilot 0, Codex 3 corrective, Claude 0. **Approvals:** Copilot 29 (manual mode), Codex 2 escalations in the implementation turn (11 across the thread), Claude 0 (auto mode). |
| 8 | Agentic capabilities | 5 | 2 | 4 | **Copilot:** discovered, implemented, ran, diagnosed, fixed and recovered account state on its own. **Claude:** did the same and ran a control test to separate site problems from code problems, but misjudged where the timeout fix belonged. **Codex:** could not run anything and stopped. |
| 9 | Autonomy and consistency | 4 | 2 | 4 | All three kept to the five files and made no config changes. **Codex** broke the "do not invent routes" rule. **Claude** documented 3 deviations from the spec but left the default-config failure unresolved. |
| | **Total (out of 45)** | **35** | **17** | **34** | Totals are a guide only; see section F. |

### Score justifications

**1. Requirement understanding**
- **Copilot (4):** it used the MCP browser on the live pages before planning, observing:
  - `/brand_products/Polo` and the heading.
  - The exact text "Your email or password is incorrect!".
  - `Rs. 1500` without a comma.
  - No "no results" message on an empty search.

  It also flagged that the consent dialog name in the existing tests did not match the live dialog, and listed what it could not verify. It was slightly over-cautious, asking for a "confirmed approved test environment" before AE-10.
- **Codex (2):** it inspected the project and wrote a reasonable plan, but its expected behaviour came from earlier notes ("historical observations, not fresh verification"). At implementation time it still wrote unverified assertions, for example `/brand_products/1`, against the explicit rule "Do not invent route patterns". To its credit, it disclosed that these were unverified.
- **Claude (5):** it explored the site with throwaway scripts outside the repo. On top of what Copilot found, it identified:
  - The hidden `#cartModal` inside `.features_items`.
  - The queue-full page as a source of false passes for AE-05.
  - The anonymous-checkout modal.
  - That CI has no `AE_POC_*` secrets.

  It ended the plan with a list of 5 decisions for the user.

**2. Speed and efficiency:** see the wall-clock times in section D. Copilot's planning time includes waiting for the user to approve 6 actions. Claude was quicker to a first implementation, but that implementation did not pass under the project config. Codex was quickest but produced nothing runnable. No credit is given for speed alone.

**3. Code quality:** detailed per test in section C. The key difference is the waiting strategy:
- **Copilot** navigated with `{ waitUntil: 'domcontentloaded' }` and asserted URLs with RegExp `toHaveURL`, which only polls the URL.
- **Claude and Codex** used the default `page.goto()`, which waits for `load`. Codex also used predicate `toHaveURL`, which in Playwright 1.64 waits for `load` too; this was verified in `node_modules/playwright/lib/matchers/expect.js` and `waitForURL`.

On this site, that choice decides between passing and timing out.

**4. Quality of results:**
- **Copilot:** the only agent whose deliverable passed under the unchanged config.
- **Claude:** in the same time window (4 Nov, about 11:40–12:14Z), every original test timed out under the default config. AE-07 and AE-09 passed once each. A full parallel run on 5 Nov also failed 0/5, though baseline UI tests failed that day too.
- **Codex:** never reached a passing state.

**5. User-friendliness:**
- **Claude:** clearest guidance, with a decisions list, CI-impact warning and step comments in the code. Its reports are long.
- **Copilot:** short final reports; the transcript is mostly raw tool calls. The 29 approvals were a burden, although they come partly from the manual permission mode chosen for that session.
- **Codex:** explanations were clear and honest, but its environment problems became the user's problem.

**6. Cost-effectiveness:** scored with low confidence, because there is no billing data and token counts are not comparable across vendors (see section D).

**7. Human intervention:** extra prompts are counted only up to the end of each agent's implementation report.
- **Copilot:** no extra prompts.
- **Codex:** needed "Find and fix the node modules issues", "fix errors in config.ts" and "But still the problems exists in terminal". Its later prompts (a question and three run requests) are treated as post-task, like Claude's 5 Nov run request.
- **Claude:** no extra prompts in the scored scope.

**8. Agentic capabilities:**
- **Copilot:** read error-context snapshots, recognised the queue-full page, fixed the AE-07 async add and the AE-10 "Proceed To Checkout" locator from evidence, and cleaned up the account cart itself after an interrupted run.
- **Claude:** comparable, plus a control run of the existing tests. However, it concluded "fixing that needs a config change, which was out of scope", which was inaccurate: per-navigation `waitUntil` inside the five files fixes it, as Copilot's code and Claude's own later rewrite both show.
- **Codex:** blocked by the environment; it correctly declined to install dependencies, but did not investigate further on its own.

**9. Autonomy and consistency:**
- **Copilot:** no deviations from the spec.
- **Claude:** three documented deviations: no logout, tracing off for AE-10, and opening `/login` directly instead of via the navigation link. All are reasonable and all were disclosed.
- **Codex:** kept to the file scope, but its AE-02 assertions went against the "do not invent" rule, and its AE-10 runs in Chromium under every browser project (see C).

---

## C. Code quality comparison

Original deliverables. File sizes: Copilot 258 lines, Codex 260, Claude 378 across the five files.

### Cross-cutting patterns

| Aspect | Copilot | Codex | Claude (original) |
|---|---|---|---|
| Structure and conventions | Plain `test()`; no `describe` or `@poc` tag | Plain `test()`; a `resolveConsent()` function inside each file, called after every navigation | `test.describe` + `@poc` tag + numbered step comments, matching the existing tests |
| Consent handling | Approved block, checked once after `goto` | The same block in a function inside the file; called after each `goto` | Approved block repeated in each file, checked once |
| Navigation wait | `waitUntil: 'domcontentloaded'` on every `goto` ✅ | Default `load` ❌ (timed out on this site) | Default `load` on `goto` ❌; `waitForURL(…, { waitUntil: 'commit' })` after clicks ✅ |
| URL assertions | RegExp `toHaveURL`: polls the URL only | Predicate `toHaveURL`: also waits for `load` | `waitForURL` with `commit`, plus a one-off pathname read after a visible heading |
| Assertion strictness | Mostly exact `toHaveText` | Several weaker `toContainText` | Exact `toHaveText`, plus extra content checks |
| Credential safety | Env vars only; no trace protection | Env vars only; no trace protection | Env vars only; **`test.use({ trace: 'off' })`** for AE-10, after confirming a trace contained the password |

### Per-test comparison

**AE-05: Search with no matching product**

| | Copilot | Codex | Claude |
|---|---|---|---|
| Search-state check | RegExp URL with the search term | Predicate URL with the parsed `search` parameter | `waitForURL` predicate with the parsed `search` parameter |
| Heading | Scoped to `.features_items` | Page-wide `Searched Products` | Exact `Searched Products`, checked **before** the zero-count check (guards against the queue-full page) |
| Zero-card check | `.features_items .product-image-wrapper` count 0 ✅ | Same ✅ | Same, plus `.productinfo` count 0 and the container visible ✅ |
| Verdict | Good | Correct logic, but slow wait | Strongest assertions; slow `goto` |

**AE-07: Quantity 3 and cart total**

| | Copilot | Codex | Claude |
|---|---|---|---|
| Empty-cart precondition | ✅ before changing anything | ✅ | ✅ |
| Quantity field | `#quantity` (CSS), value checked | `#quantity`, **value not checked** | `getByRole('spinbutton')`, value checked |
| Price and total | Exact `toHaveText('Rs. 500')` / `('Rs. 1500')` | `toContainText` (weaker) | Exact `toHaveText` |
| Cleanup | `try/finally` + `addAttempted` guard; removes only `#product-1` ✅ | Same ✅ | Same ✅ |
| Verdict | Good | Acceptable | Good |

**AE-02: Filter by Polo brand**

| | Copilot | Codex | Claude |
|---|---|---|---|
| Brand link | `.brands-name` + `/Polo/` | `#brands_products` + `/Polo/`. Claude's 6 Nov diagnosis reported that this id does not exist (the element has the class `brands_products`); not independently re-checked here | `.brands_products` + `/\bPolo$/i` |
| Route | `/brand_products/Polo` ✅ (observed) | **`/brand_products/1`** ❌ (unverified; Copilot and Claude both observed `/brand_products/Polo`) | `/brand_products/Polo` ✅ |
| Heading | Case-insensitive regex (lenient) | Exact `Brand - Polo Products` | Exact, plus a breadcrumb check |
| Ad vignette | Not handled | Not handled | One retry, reusing the pattern in `product-details.spec.ts` |
| Verdict | Good | **Defective: fails every time once the page loads** | Most robust; more complex |

**AE-09: Invalid login**

| | Copilot | Codex | Claude |
|---|---|---|---|
| Synthetic data | `…@example.invalid` ✅ | ✅ | ✅ |
| Locators | `getByRole('textbox')` inside `form[action="/login"]` | `data-qa` attributes | `data-qa` attributes, plus the "Login to your account" heading |
| Error | Exact text, scoped to the form ✅ | Exact text, page-wide | Exact text, scoped to the form ✅ |
| Still logged out | URL plus no "Logged in as" | No Logout link plus email field still visible | Pathname plus nav-scoped checks: Signup/Login shown, no "Logged in as", no Logout |
| Verdict | Good | Acceptable | Good |

**AE-10: Valid login and checkout review**

| | Copilot | Codex | Claude |
|---|---|---|---|
| Chromium only | `test.skip(browserName !== 'chromium')` ✅ | **`test.use({ browserName: 'chromium' })`** ❌: forces Chromium inside the firefox and webkit projects, so with `fullyParallel` the test can run 3 times at once on the shared account | `test.skip` ✅ + `describe.configure({ mode: 'serial' })` |
| Login check | "Logged in as" + Logout | Logout + "Logged in as" | Nav-scoped: "Logged in as", Logout, no Signup/Login |
| Account-cart precondition | Checked **after** login ✅ | Checked **before** login, on the anonymous cart ❌. Codex's own 5 Nov run found quantity 2 at checkout because the account cart was not empty | Checked after login, with a clear failure message ✅ |
| Cleanup | Removes only the row it added ✅ | Can delete `#product-1` even if part of it existed before (as happened on 5 Nov) ❌ | Removes only the row it added ✅ |
| Proceed To Checkout | `getByText` (observed to be generic text, not a link) ✅ | `getByRole('link')` ❌ (Copilot observed it is not a link) | `getByText` ✅ |
| Review assertions | URL, two headings, `#cart_info` contains Blue Top and Rs. 500 | URL, headings, row name, quantity, total | URL, 4 headings, row name, category, price, quantity, total, **Total Amount**, Place Order visible but **never clicked**. `orderRows` count 2 is brittle |
| Credential exposure | Not addressed | Not addressed | Trace off for this file ✅ |
| CI behaviour without secrets | Throws; fails in CI (not mentioned) | Fails in CI (not mentioned) | Throws; fails in CI (**flagged to the user with options**) |
| Verdict | Good | **Defective** | Strongest design; slow `goto` |

### Common weaknesses (all agents)

- The consent block is duplicated in every file. The spec forbade shared helpers, so this is not penalised, but it remains a maintenance cost.
- None of the three adds the tests to CI with secrets. That was out of scope, but only Claude pointed it out.
- None verified flakiness with repeated runs under the default config.

---

## D. Performance and cost comparison

### Execution results (original deliverables)

| Test | Copilot (agent-reported, default config, 1 worker) | Codex | Claude (agent-reported) |
|---|---|---|---|
| AE-05 | ✅ 11.3 s | Blocked, then ❌ timeout on `goto` load | ❌ 30.1 s default · ✅ 31.7 s with `--timeout=120000` |
| AE-07 | ✅ 19.0 s | Blocked, then ❌ timeout | ❌ 30.1 s default (✅ once at 29.7 s) · ✅ 23.1 s with the longer timeout |
| AE-02 | ✅ 5.7 s | Blocked, then ❌ timeout; on 6 Nov ❌ in all 3 browsers | ❌ 30.2 s default · ✅ 33.9 s with the longer timeout |
| AE-09 | ✅ 10.5 s | Blocked, then ❌ timeout | ❌ 30.1 s default (✅ once at 11.0 s) · ✅ 7.1 s with the longer timeout |
| AE-10 | ✅ 19.2 s (run on its own) | ❌ cart quantity 2: implementation defect | ❌ 22.1 s (queue-full page after login) · ✅ 36.5 s with the longer timeout |
| **Passing under the project config** | **5/5** | **0/5** | **0/5** (2 tests passed once each) |

**Failure causes:**

| Agent | Implementation defects found (by the agent or this review) | Environmental failures |
|---|---|---|
| Copilot | URL matching too strict (fixed); AE-07 opened the cart before "Added!" appeared (fixed); AE-10 checkout locator wrong (fixed) | Queue-full page during the first parallel run; an AE-10 timeout that left an item in the cart (the agent cleaned it up) |
| Codex | AE-02 route (and selector, per Claude's diagnosis); AE-10 anonymous-cart precondition; AE-10 `browserName` override; AE-10 checkout locator; default `load` waits | `playwright-bdd` missing from `node_modules` (fixed with `npm ci` when the user asked); Windows sandbox path errors; TLS errors on the API tests in the sandbox; site slowness |
| Claude | URL checks after clicks timing out (fixed during the session); logout masking the result (removed); **default `load` on `goto` (not fixed; wrongly put down to the environment)** | Site overload; the existing baseline tests failed the same way in its control run |

**Evidence quality:**
- **Copilot:** its final `playwright-report` is from a closing `--list` run (5 tests listed as skipped), so its pass results rest on the transcript, which shows exit code 0 on the final runs.
- **Codex:** its 6 Nov report (AE-02 failing in 3 browsers) and its 5 Nov table both confirm failures.
- **Claude:** the original runs exist only in its transcript; later reports were overwritten.

### Development time (from session logs; UTC on 4 Nov; local time is UTC+1)

| Phase | Copilot | Codex | Claude |
|---|---|---|---|
| Planning (prompt 1 → plan delivered) | 10:24:39 → 11:12:46 (**≈48 min**, including 6 approval waits) | 10:24:46 → 10:26:10 (**≈1.4 min**, no live exploration) | 10:26:12 → 10:33:44 (**≈7.5 min**) |
| Implementation, run and debug (prompt 2 → report) | 11:35:28 → 12:00:18 (**≈25 min**, including 23 approval waits) | 11:35:44 → 11:41:11 (**≈5.5 min**, ended blocked) | 11:35:58 → 12:14:56 (**≈39 min**; files written in ≈3 min, the rest running and debugging) |
| Corrective follow-ups | none | 3 prompts on 5 Nov (≈5 min of agent time) | none |
| Reported by the agent? | No ("unavailable") | No ("unavailable") | Yes (from shell timestamps; consistent with the logs) |
| Model API time | 45.9 min over the whole session (tool-reported) | Not available | Not isolated per phase |

### Human intervention

| Metric | Copilot | Codex | Claude |
|---|---|---|---|
| Prompts in the scored scope | 2 | 2 + **3 corrective** | 2 |
| Prompts after the task (excluded from scoring) | 0 | 4 (1 question, 3 run requests) | 1 run request (5 Nov) + 3 fix prompts (6 Nov, excluded as requested) |
| Approvals needed | **29** (6 planning, 23 implementation); 97 more were auto-approved by policy | 2 escalations in the implementation turn; 11 across the thread, at least 1 rejected by the user | **0** (65 actions auto-approved in auto mode) |
| Manual corrections by the user | 0 | `npm ci` was run by the agent at the user's request | 0 |
| Clarifying questions in the plan | 2 blockers (environment and account; consent policy) | 4 unresolved discovery items | 5 explicit decisions |

### Token usage (measured from each tool's own logs; planning and implementation prompts only)

| Metric | Copilot (GPT-6 Luna) | Codex (gpt-6-luna) | Claude (Opus 5.5) |
|---|---|---|---|
| Model calls | 76 | not recorded per call | 51 |
| Total input tokens | 5,899,500 | 631,368 | 5,444,919 |
| …of which cache reads | 5,721,976 | 566,016 (cached) | 5,283,469 |
| …of which cache writes | 177,296 | not reported | 161,346 |
| …uncached input | 228 | 65,352 | 104 |
| Output tokens | 54,364 (including 33,710 reasoning) | 12,914 | 57,012 |
| Planning / implementation split, input | 2.19 M / 3.71 M | 0.11 M / 0.52 M | 0.59 M / 4.86 M |
| Planning / implementation split, output | 16.7 K / 37.7 K | 2.7 K / 10.2 K | 15.4 K / 41.7 K |
| Whole thread (including follow-ups) | same as above | 2,769,199 in / 23,634 out (8,685 reasoning) | n/a (later prompts excluded) |

### Cost

| | Copilot | Codex | Claude |
|---|---|---|---|
| Monetary cost | **Not available** | **Not available** | **Not available** as billing |
| Tool-reported usage figures | 2 premium requests; 10.66 Copilot AI credits (from the session accounting snapshot) | None | Claude Code's own estimate: about US$4.70 cumulative to 5 Nov 11:55Z (includes the 5 Nov run request). A client-side estimate, not an invoice |

> **Caution.** Token counts come from three different tokenizers and caching schemes, and the plans have different pricing models (Copilot premium requests, a ChatGPT/Codex plan, Anthropic usage). They show the scale of work, not comparable cost. Cost-effectiveness is therefore scored with low confidence.

---

## E. Strengths and weaknesses

### GitHub Copilot

**Strengths**
- Thorough live discovery with browser MCP before writing assertions; recorded observed values (route, heading, error text, price format).
- The only agent whose tests passed under the unchanged project configuration, thanks to a deliberate `domcontentloaded` strategy and RegExp URL checks.
- Good diagnosis from error-context snapshots (queue-full page, async add-to-cart, a control that is not a link) and fixes based on that evidence.
- Recovered by itself from an interrupted AE-10 run, removing only the row its test had added.
- Scanned generated reports for leaked credentials.

**Weaknesses**
- 29 manual approvals made the session interaction-heavy (partly because of the manual permission mode).
- Planning took the longest in wall-clock time.
- Final reports were thin: no timing or token data, and no mention of CI impact or the trace credential risk.
- No `describe` blocks or `@poc` tags, unlike the existing tests; one lenient regex heading in AE-02; no ad-vignette handling.
- The pass results were not kept: the last report is a `--list` run.

**Distinctive:** proposed consent handling that matched the live dialog labels, and noticed that the existing tests' dialog name did not match the live site.

### OpenAI Codex

**Strengths**
- Respected the restrictions: refused to install dependencies without permission and changed no config.
- Very honest reporting: clearly marked unverified assertions and blocked runs, and never claimed a pass.
- Reduced repeated code by putting consent handling in a function inside each file, without creating a shared helper.
- Lowest token usage.

**Weaknesses**
- No live discovery, either in planning or before writing assertions, so it produced invented or unverified values (AE-02 route and selector).
- AE-10 design defects: the cart check runs before login, the cleanup can remove items it didn't add, and `test.use({ browserName })` causes the account to be used concurrently across projects.
- Used default `load` waits and predicate `toHaveURL`, which are fragile on this site.
- Could not run anything without help (dependency and sandbox problems), and needed 3 corrective prompts.
- Its 6 Nov diagnosis of AE-02 blamed only the site and missed the code defects.

**Distinctive:** the most conservative about restrictions, at the cost of making progress.

### Claude Code

**Strengths**
- The most complete discovery and plan: hidden modal, false pass on the queue-full page, price format, CI secrets, and explicit decisions for the user.
- The strongest assertions: exact values, nav-scoped login state, the checkout Total Amount, and Place Order checked for visibility but never clicked.
- Unique security finding: Playwright traces record the login password. It disabled tracing for AE-10 and deleted the trace that contained it.
- Followed the existing project conventions (`describe`, `@poc`, numbered steps, the vignette retry pattern).
- The most transparent report: separated environment problems from code problems with a control run, documented its deviations, and reported timings that match the logs.
- No extra prompts and no approvals (in auto mode).

**Weaknesses**
- The original tests used the default `load` wait on `page.goto()`, so **0/5 passed under the project's 30 s timeout**, while Copilot's tests passed in the same time window.
- Wrongly concluded that the fix needed a configuration change. A fix inside the five files was available (and was applied later, after an extra prompt that is out of scope here).
- Some claims were overgeneralised: "`toHaveURL` waits for load" is true for the predicate form only, not the RegExp form.
- The longest files (378 lines); some brittle details (`orderRows` count 2) and non-retrying pathname reads.
- Its diagnostic runs created a trace containing the password before it was found and deleted.

**Distinctive:** the strongest risk analysis and the most safety-minded design, but it did not turn that into tests that pass under the project's own settings.

---

## F. Overall assessment

### Ranking

1. **GitHub Copilot.** It delivered the requirement: five tests based on observed behaviour that pass under the project config. Its execution and recovery were strong, and it needed no extra prompts.
2. **Claude Code, a close second.** It was best on understanding, test design, safety and reporting. But the delivered tests do not pass under the project configuration, which matters most for a test-automation deliverable.
3. **OpenAI Codex.** It produced unverified and partly defective tests, was blocked by its environment, and needed corrective prompts. Its environment problems were partly outside its control, so it should be re-assessed in a healthy environment before drawing firm conclusions.

### Best agent by area

| Area | Best | Reasoning and trade-off |
|---|---|---|
| Code quality | **Tie: Copilot and Claude** | Claude's assertions, safety and conventions are stronger; Copilot's waiting strategy is more robust. Combining the two would give the best test. |
| Speed and efficiency | **Copilot** (to a working result) | Claude reached a first implementation faster but not a working one; Codex was fastest but produced nothing runnable. |
| User-friendliness | **Claude Code** | Clearest plans, decisions and warnings, with no approval prompts. Caveat: it ran in auto mode, Copilot in manual mode. |
| Autonomous execution | **Copilot** | It discovered, implemented, ran, diagnosed, fixed and recovered without extra prompts, and finished green. |
| Cost-effectiveness | **Not determinable** | There is no billing data. On measured tokens per working result, Copilot looks best, but token counts are not comparable across vendors. |
| Reporting quality | **Claude Code** | The most complete and accurate reports, though it was confidently wrong on one point (the scope of the fix). Codex was the most candid about what it had not verified. |

### Recommendation for future Playwright work

1. **For hands-off generation of tests that must pass now, use Copilot.** Run it in a less restrictive permission mode for routine read and run actions, to cut down approvals.
2. **For planning, test design reviews, security-sensitive flows and reporting, use Claude Code.** Add an explicit requirement that tests pass under the project's unchanged configuration, and that timeouts be fixed in code before they are blamed on the environment.
3. **Re-assess Codex** with a verified `npm ci` and sandbox setup, and require live discovery before it writes assertions.
4. **Project improvements** that apply to every agent:
   - Make `waitUntil: 'domcontentloaded'` the standard for this site.
   - Allow a shared consent fixture.
   - Disable tracing for credential-bearing tests.
   - Add `AE_POC_*` secrets to CI, or skip AE-10 when they are missing.
5. **For future comparisons:**
   - Use the same permission mode for all agents.
   - Save each agent's final HTML report.
   - Capture timing and token data at the end of each session.
   - Run every agent's tests in the same time window, three times, under the default config.

---

## Limitations and unavailable metrics

| Limitation | Effect |
|---|---|
| **No independent re-run** for this assessment | Execution results come from the agents' reports and logs. Copilot's passes are not backed by a saved report. |
| Claude's original code was **rebuilt** from its session log | Method validated on one file (AE-02 matched byte for byte) and consistent with Claude's report; the rebuilt files are not kept in the repo. |
| Different **permission modes** (manual, on-request with sandbox, auto) | Approval counts and wall-clock times are not like-for-like. |
| The public site was **overloaded** during the runs | Raises flakiness for everyone; the same-window comparison of Copilot and Claude reduces, but does not remove, this effect. |
| **Cost data unavailable** | Only tool-reported figures (Copilot premium requests and AI credits, Claude Code's own estimate) are given; none is verified billing. |
| Token metrics differ by vendor | Not comparable as cost; shown for scale only. |
| Codex's environment (missing dependency, sandbox) | Penalises Codex partly for problems outside its control. |
| Some defect claims rely on one agent's observation | The Codex `#brands_products` selector problem was reported by Claude and not re-checked here. The `/brand_products/Polo` route was observed by both Copilot and Claude. |
| **Evaluator conflict of interest** | The assessor is the same model family as Claude Code; see the disclosure at the top. |

## Evidence references

- **Generated tests:**
  - `agentic-ai-playwright-poc-copilot/tests/ae0{2,5,7,9}-*.copilot.spec.ts` and `ae10-valid-login-checkout.copilot.spec.ts`
  - The same names with `.codex` in the Codex worktree
  - The Claude originals, rebuilt from the session log; the current Claude files contain the 6 Nov rewrite
- **Transcripts:** the Confluence pages Co-pilot (3089825793), Codex (3089956865) and Claude (3090186241), QTM space.
- **Session logs:**
  - Copilot `~/.copilot/session-state/a5b98316-b417-498e-a209-ebb0001c6eb2/events.jsonl`
  - Codex `~/.codex/sessions/2026/11/04/rollout-2026-11-04T11-24-42-01a1a616….jsonl` and `…/06/rollout-2026-11-06T11-52-55-….jsonl`
  - Claude `~/.claude/projects/c--Users-VigneshKannan-projects-agentic-ai-playwright-poc-claude/4232d43d-1379-4bfc-a8ec-dfa824667332.jsonl`
- **Leftover execution data:** `test-results/.last-run.json` and `playwright-report/` in each worktree:
  - Copilot: a `--list` run on 4 Nov.
  - Codex: AE-02 failing in 3 browsers on 6 Nov.
  - Claude: a single AE-07 pass on 6 Nov, from the rewritten code.
- **Playwright behaviour check:** `node_modules/playwright/lib/matchers/expect.js` (`toHaveURL`: RegExp → polling; predicate → `waitForURL` with the default `load` state).
