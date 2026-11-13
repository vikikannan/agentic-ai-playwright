# Agentic AI POC: Comparing AI Coding Agents for Playwright Test Automation

| | |
|---|---|
| **Project** | Agentic AI POC for test automation |
| **Agents compared** | GitHub Copilot, OpenAI Codex, Claude Code |
| **Application under test** | Automation Exercise (public demo e-commerce site) |
| **Agent runs** | 4–5 November 2026 |
| **Report date** | 9 November 2026 |

---

## 1. Introduction

AI coding agents can now do more than complete code. They can read a project, explore a running application, write tests, run them and react to failures. Before we use them in our test automation work, we wanted to see how they behave on a realistic task rather than on isolated code snippets.

We chose three widely available agents (GitHub Copilot, OpenAI Codex and Claude Code) because they are the main options our teams are likely to use, and because each takes a slightly different approach to planning, tool use and approvals. Giving all three the same task let us compare them directly.

The POC set out to answer three questions:

- Can an agent produce Playwright tests that are correct, maintainable and pass in our existing project?
- How much human guidance and review does each agent need along the way?
- Which kinds of test automation work suit each agent best?

## 2. Scope and evaluation approach

### 2.1 Project and application

- **Project:** an existing Playwright and TypeScript project. It already had UI tests, API tests and a BDD layer (playwright-bdd), plus a GitHub Actions pipeline.
- **Application:** the public Automation Exercise site. It is a convenient practice site, but it is ad-heavy and was under heavy load during the runs. Pages often took 20–48 seconds to finish loading, and the site sometimes returned a "queue full" page. This affected every agent, and it is taken into account in the findings.

### 2.2 Test scenarios

| ID | Scenario | Notes |
|---|---|---|
| AE-05 | Search for a product that does not exist | Read-only |
| AE-07 | Set quantity to 3 and verify the cart total | Changes the cart; must clean up |
| AE-02 | Filter products by the Polo brand | Read-only |
| AE-09 | Log in with invalid credentials | One synthetic login attempt |
| AE-10 | Log in and reach the checkout review page | Uses a shared test account; must not place an order |

### 2.3 Common setup for a fair comparison

- Each agent worked in its own Git worktree and branch, and all three branches started from the same commit.
- All agents received the **same two prompts**:
  - **A planning prompt:** analyse the project and the application, and propose a test plan without writing code.
  - **An implementation prompt:** create exactly five test files, run them in Chromium, fix defects in the new files only, and report the results.
- **The same restrictions applied to all three:**
  - No changes to existing tests, the Playwright configuration, dependencies or CI.
  - No shared helpers.
  - Credentials only from a local, git-ignored `.env` file.
  - No order placement.
- The agents ran on the same day and largely in the same time window, against the same live site.

### 2.4 How the results were evaluated

- **Main evidence:** we reviewed the five generated test files from each agent as first delivered, together with the agents' own planning and implementation reports.
- **Metrics:** time, prompts, approvals and token usage come from each tool's local session logs. They are reported as measured values, separately from the qualitative judgements.
- **Classifying failures:** each failure was classed as either a test defect or an environment problem. Where a timeout could have been avoided in the test code, we counted it as an implementation weakness, even though the site was slow.
- **What was excluded:** follow-up prompts given after an agent had delivered its report (for example, a later fix request to Claude Code) are not part of the comparison.
- **AI assistance:** the detailed analysis behind this report was prepared with help from Claude Code, one of the agents being compared. To limit bias, every finding was tied to evidence that can be checked: the test files, Git state, session logs and transcripts.

## 3. Evaluation criteria

| Criterion | What we looked at |
|---|---|
| Requirement understanding | Whether the agent grasped the task, checked expected behaviour against the live application, and stated clearly what it could not verify |
| Speed and efficiency | Time from prompt to a usable result, across planning, implementation and debugging |
| Code quality | Locators, assertions, waiting strategy, error handling, cleanup and readability |
| Quality of results | Whether the tests are correct and pass under the project's unchanged configuration, and whether they meet the requirements |
| User-friendliness | Clarity of plans and reports, quality of guidance, and effort needed to work with the agent |
| Cost-effectiveness | Token usage and cost relative to the value delivered |
| Human intervention | Extra prompts, approval requests and manual fixes needed |
| Agentic capabilities | Ability to explore the project and application, plan, implement, run, diagnose and recover independently |
| Autonomy and consistency | Following instructions and restrictions, preserving existing files, and finishing with minimal supervision |

## 4. Comparative assessment: evaluation matrix

The labels below are qualitative judgements based on the evidence described in section 2.4. They are not scores, and the number of positive labels should not be read as an overall ranking.

| Evaluation criterion | GitHub Copilot | OpenAI Codex | Claude Code | Key observation |
|---|---|---|---|---|
| **Requirement understanding** | Strong | Needs improvement | Strong | Copilot and Claude explored the live site before planning, and recorded the real routes, error text and price format. Claude also found less obvious risks: a false pass on the "queue full" page, missing CI secrets, and passwords captured in Playwright traces. Codex planned from older notes and wrote some expected values it had not checked. |
| **Speed and efficiency** | Slower, but reached working tests | Faster, but incomplete result | Fast planning; result incomplete | Copilot took the longest (about 48 min planning and 25 min implementation, including time waiting for approvals) and was the only agent to finish with passing tests. Claude planned in about 8 min and implemented in about 39 min, but its tests did not pass under the default configuration. Codex finished in about 7 min in total without a runnable result. |
| **Code quality** | Strong | Needs improvement | Strong, with one significant weakness | Copilot's waiting strategy suited this slow site. Claude's assertions, cleanup and safety measures were the most thorough, but it waited for full page loads, which timed out. Codex's tests contained logic defects in AE-02 and AE-10. |
| **Quality of results** | Reliable | Needs improvement | Partially successful | Copilot: 5 of 5 tests passed under the project configuration, as reported by the agent. Claude: 0 of 5 passed under the default 30-second timeout, but 5 of 5 passed with a longer timeout. Codex: no test passed, and one real defect surfaced in AE-10. |
| **User-friendliness** | Moderate | Requires guidance | Easy | Claude's plans listed explicit decisions for the user and its reports were clear. Copilot's reports were brief, and it asked for many approvals. With Codex, the user had to drive the troubleshooting. |
| **Cost-effectiveness** | Not enough data | Not enough data | Not enough data | No billing data was available. Token usage was measured (section 4.1), but token counts are not comparable across vendors. |
| **Human intervention** | Moderate | High | Minimal | Copilot needed no extra prompts but 29 approvals, because it ran in manual-approval mode. Codex needed 3 corrective prompts and several sandbox approvals. Claude needed neither, but it ran in auto-approval mode, so the approval counts are not like-for-like. |
| **Agentic capabilities** | Strong | Limited | Strong | Copilot discovered, implemented, ran, diagnosed, fixed and cleaned up account state on its own. Claude did the same and ran control tests, but misjudged where the timeout fix belonged. Codex could not run its tests and stopped. |
| **Autonomy and consistency** | Independent | Significant supervision | Independent | All three kept to the five files and left the configuration unchanged. Claude documented three small deviations from the spec. Codex invented a route despite an explicit instruction not to. |

### 4.1 Measured values

These figures come from each tool's session logs. They cover only the two shared prompts. Times are wall-clock times and include time spent waiting for the user's approval.

| Measure | GitHub Copilot | OpenAI Codex | Claude Code |
|---|---|---|---|
| Model used | GPT-6 Luna | gpt-6-luna | Claude Opus 5.5 |
| Approval mode | Manual | On request (sandboxed) | Auto |
| Planning time | ~48 min | ~1.5 min | ~8 min |
| Implementation and debugging time | ~25 min | ~5.5 min (ended blocked) | ~39 min |
| Extra corrective prompts | 0 | 3 | 0 |
| Approvals requested from the user | 29 | 2 (11 across the whole session) | 0 |
| Tests passing under the project configuration | 5 of 5 (agent-reported) | 0 of 5 | 0 of 5 (5 of 5 with a longer timeout) |
| Input tokens (mostly cached) | ~5.9 M | ~0.63 M | ~5.4 M |
| Output tokens | ~54 K | ~13 K | ~57 K |
| Monetary cost | Not available | Not available | Not available |

Two of the tools record their own usage figures: Copilot logged 2 premium requests, and Claude Code estimated about US$4.70. Neither is a verified bill, and they cannot be compared with each other.

## 5. Code quality and implementation comparison

**Waiting strategy (the most important difference).**
- Copilot opened pages with `waitUntil: 'domcontentloaded'` and checked URLs with patterns that do not wait for the page to finish loading.
- Claude and Codex used Playwright's default, which waits for the full `load` event. On this ad-heavy site that event often took longer than the 30-second test timeout.

This single choice explains most of the difference in pass rates. It was not purely an environment problem: Copilot's and Claude's tests ran against the same site in the same time window, with different outcomes.

**Locators.** All three used accessible locators where the site allows them (roles, headings, labels). They used CSS only inside meaningful containers, such as the product listing or a specific cart row.
- **Copilot** relied mostly on roles and form scoping.
- **Claude** also used `data-qa` attributes and a role-based quantity field.
- **Codex** used an element id for the brand filter. Claude later reported that this id does not exist on the page; we did not check that ourselves.

**Assertions.**
- **Claude's** were the most specific: exact prices, the checkout total, login state checked in the navigation bar, and a check that "Place Order" is visible without ever clicking it.
- **Copilot's** were exact and focused.
- **Codex** used looser "contains" checks in places, and wrote two expected values it had never observed, including the brand page route.

**Cleanup and test data.** All three checked that the cart was empty before adding a product, and removed only their own item in a `finally` block. The exception is Codex's AE-10: it checked the anonymous cart *before* logging in, so it missed an item already in the account's cart. Its cleanup then removed a cart row that held that item as well as its own.

**Test independence.** Copilot and Claude restricted AE-10 to Chromium by skipping it in other browsers, and Claude also forced serial execution. Codex forced the Chromium browser in every browser project, so its AE-10 can run three times in parallel against the same account.

**Readability and reuse.**
- **Claude** followed the existing project conventions most closely: `describe` blocks, `@poc` tags, numbered step comments, and the existing workaround for ad pop-ups.
- **Copilot's** files were the shortest and easiest to read.
- **Codex** wrapped the consent handling in a function inside each file, which cut down repetition without breaking the "no shared helpers" rule.

**Compliance and security.** No agent changed existing files, the configuration or the dependencies. Claude was the only agent to notice that Playwright traces record the login password. It turned tracing off for the login test and pointed out that AE-10 would fail in CI because CI has no credentials.

## 6. Key observations: individual agent performance

### GitHub Copilot

- **Strengths:**
  - Explored the live site with a browser tool before writing any assertions.
  - Delivered the only set of tests that passed with the project's settings unchanged.
  - Diagnosed failures from the page snapshots Playwright saves on failure.
  - When an interrupted run left an item in the test account's cart, it removed that item itself.
- **Challenges:**
  - The session needed 29 approvals, partly because of the manual approval mode.
  - Planning took the longest.
  - The final report contained no time or usage data.
  - The saved test report was overwritten by a final listing run, so the passing results rest on the agent's own report.
- **Implementation characteristics:** compact tests and a robust waiting strategy. It did not use the project's `describe` and tag conventions, and did not handle the ad pop-up.
- **Overall experience:** dependable, and it got to working tests without extra prompts, though it asked for approval often.

### OpenAI Codex

- **Strengths:**
  - Followed the restrictions strictly; for example, it would not install dependencies without permission.
  - The most candid reports: it clearly marked unverified assertions and blocked runs, and never claimed success.
  - Lowest token usage.
- **Challenges:**
  - It did not explore the live application, so some expected values were guesses.
  - Its worktree was missing a dependency, and Windows sandbox path errors stopped it from running tests.
  - The user had to guide it through troubleshooting with three extra prompts.
  - When later asked about the AE-02 failure, it blamed the site and missed the defects in its own test.
- **Implementation characteristics:** readable code with consent handling in a function inside each file, but with logic defects in AE-02 and AE-10.
- **Overall experience:** needed the most supervision. Part of the outcome was caused by its environment, so it should be re-tested in a clean setup before drawing firm conclusions.

### Claude Code

- **Strengths:**
  - The most thorough discovery and plan, ending with a clear list of decisions for the user.
  - The strongest assertions and the most security-aware design (tracing turned off for the login test).
  - The most detailed and transparent reporting: it used a control run of the existing tests to separate site problems from test problems, and it documented its deviations from the spec.
  - No extra prompts.
- **Challenges:**
  - Its original tests waited for the full page load, so none passed within the project's 30-second timeout.
  - It concluded that the fix needed a configuration change, which was out of scope. A fix inside the test files was possible; it applied one only after a later prompt, which is outside this comparison.
  - Its diagnostic runs briefly produced a trace file containing the password, which it found and deleted.
- **Implementation characteristics:** the longest files, closest to the project's conventions, and the strongest checks. A few details are brittle, such as an exact row count on the checkout page.
- **Overall experience:** the easiest to work with, and the best analysis, but the delivered tests did not meet the "pass under the existing configuration" requirement.

## 7. Overall findings

There is no single best agent. The results point to different strengths:

| Area | Finding |
|---|---|
| Strongest code quality | **Copilot and Claude Code**, for different reasons. Claude's tests have the better assertions, safety measures and consistency with the project; Copilot's are more robust against the slow site. The ideal test would combine both. |
| Best speed and efficiency | **GitHub Copilot**, measured as time to working tests. Claude was quicker to a first implementation and Codex was quickest overall, but neither produced passing tests. |
| Best user experience | **Claude Code**: clear plans, explicit decisions and readable reports. Its auto-approval mode also reduced friction, so this is not a like-for-like comparison. |
| Highest autonomy | **GitHub Copilot**: it finished green without extra prompts and recovered from problems on its own. Claude was similarly independent but left a key issue unresolved. |
| Best cost-effectiveness | **Not enough data.** No billing information was available, and token counts are not comparable across vendors. |

**Which agent suits which activity:**

- **Implementing and running tests until they pass:** GitHub Copilot was the most dependable at turning observed behaviour into passing tests.
- **Planning, test design, risk analysis and reporting:** Claude Code gave the most complete analysis, found the most risks (including a security issue) and wrote the clearest reports.
- **Codex:** no firm conclusion yet. Its result was strongly affected by environment problems, but it also skipped live verification. It needs a re-test under clean conditions.

## 8. Lessons learned

- **Structured prompts work.** Splitting the work into a planning prompt and an implementation prompt, with explicit restrictions, kept all three agents within scope. No agent changed existing files or configuration.
- **Planning only helps if it includes live verification.** The two agents that explored the actual application before writing assertions produced correct tests. The agent that planned from notes produced tests with invented values.
- **"Passing" must be defined precisely.** We should have stated that tests must pass under the unchanged project configuration and timeouts. One agent passed only with a longer timeout passed on the command line.
- **Generated tests need human review.** Some defects only show up on review: the account-cart check made before login, the browser forced in every project, and passwords captured in traces.
- **Environment problems blur the comparison.** A slow, ad-heavy public site and a worktree with a missing dependency both influenced the results. Separating environment problems from code defects took deliberate effort.
- **Productivity and cost are hard to measure afterwards.** Timing and token data had to be recovered from local logs, and no billing data was available. We should collect these during the run.
- **Evaluation conditions must match.** The agents ran with different approval modes (manual, sandboxed, automatic), which makes approval counts and timings hard to compare.
- **AI agents may misjudge where a fix belongs.** One agent concluded that a configuration change was needed when the fix fitted inside the test files. Agent diagnoses should be checked, not just accepted.

## 9. Recommendations and next steps

**Good fits for AI-assisted test automation (with review):**
- Exploring an application and drafting test plans.
- Writing new tests that follow the existing patterns.
- Diagnosing failures from Playwright snapshots and traces.
- Producing structured reports for each test run.

**Candidates for more autonomous, agent-based workflows:**
- Well-defined, read-only or easily reversible scenarios, such as search and filtering, against a stable test environment, where the agent can run and fix tests in a loop.

**Where human supervision remains essential:**
- Anything that uses real or shared accounts.
- Handling of credentials and secrets.
- Changes to configuration or CI.
- Deciding whether a failure is a test defect or an application or environment issue.
- Final review before generated tests are merged.

**Suggested improvements to our Playwright project, independent of the agent used:**
- Standardise on waiting for the page's content (`domcontentloaded`) rather than the full load event for this application.
- Allow a shared consent fixture instead of repeating the consent-handling code in every test.
- Turn off tracing for tests that enter credentials.
- Add the test account's credentials to CI as secrets, or skip AE-10 when they are missing.

**Further POC experiments:**
- Re-run Codex with a verified dependency install and sandbox setup.
- Repeat the comparison with the same approval mode for all agents, the same time window and three runs per test under the default configuration.
- Record timing, token usage and the final test reports automatically for each session.
- Combine the agents: Claude Code for planning and review, and Copilot for implementation and execution.
- Try the agents against a stable test environment rather than a public demo site.

**Integration into our workflow:**
- Use agents in feature branches only.
- Require the generated tests to pass the existing CI pipeline unchanged.
- Treat agent output like any other pull request: code review, plus a check that the tests follow project conventions and contain no secrets.
