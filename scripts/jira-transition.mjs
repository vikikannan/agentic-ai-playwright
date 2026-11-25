#!/usr/bin/env node
/**
 * Move a Jira Test Execution to its final status after an automated run, and comment the result.
 *
 * Used by .github/workflows/xray-ci.yml when Jira Automation triggered the run with a
 * test_execution_key. It only ever touches the issue whose key it is given.
 *
 * Usage:
 *   node scripts/jira-transition.mjs --issue QTM-27 --result passed|failed [--dry-run]
 *
 * The transition is chosen by its TARGET status, not by transition name or id:
 *   passed → JIRA_STATUS_PASSED (default "Completed")   failed → JIRA_STATUS_FAILED (default "Failed")
 *
 * Environment: JIRA_BASE_URL (e.g. https://<site>.atlassian.net), JIRA_USER_EMAIL, JIRA_API_TOKEN.
 * The token is never printed.
 *
 * Exit code: 0 when transitioned, already in the target status, or the transition is not
 * available from the current status (a warning is printed); 2 on invalid input or a Jira API error.
 */
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    issue: { type: 'string', default: '' },
    result: { type: 'string', default: '' },
    'dry-run': { type: 'boolean', default: false },
  },
});

class TransitionError extends Error {}

const issueKey = args.issue.trim();
const result = args.result.trim().toLowerCase();
const targetStatus =
  result === 'passed' ? process.env.JIRA_STATUS_PASSED || 'Completed' : process.env.JIRA_STATUS_FAILED || 'Failed';

function stepSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function annotate(level, title, message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::${level} title=${title}::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
}

function runUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_REPOSITORY && GITHUB_RUN_ID ? `${GITHUB_SERVER_URL || 'https://github.com'}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : '';
}

async function jira(method, path, body) {
  const { JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN } = process.env;
  const response = await fetch(`${JIRA_BASE_URL.replace(/\/+$/, '')}/rest/api/3${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new TransitionError(`Jira ${method} ${path} failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(issueKey)) throw new TransitionError(`Invalid issue key "${issueKey}".`);
  if (!['passed', 'failed'].includes(result)) throw new TransitionError(`--result must be "passed" or "failed", not "${args.result}".`);
  const missing = ['JIRA_BASE_URL', 'JIRA_USER_EMAIL', 'JIRA_API_TOKEN'].filter(name => !process.env[name]);
  if (missing.length) throw new TransitionError(`Missing Jira settings: ${missing.join(', ')} (GitHub repository secrets).`);

  const issue = await jira('GET', `/issue/${issueKey}?fields=status,issuetype`);
  const currentStatus = issue.fields?.status?.name ?? '?';
  console.log(`${issueKey} (${issue.fields?.issuetype?.name ?? '?'}) is "${currentStatus}"; run result: ${result} → target "${targetStatus}".`);

  if (currentStatus.toLowerCase() === targetStatus.toLowerCase()) {
    console.log(`Already in "${targetStatus}"; nothing to do.`);
    return;
  }

  const { transitions = [] } = await jira('GET', `/issue/${issueKey}/transitions`);
  const transition = transitions.find(t => t.to?.name?.toLowerCase() === targetStatus.toLowerCase());
  if (!transition) {
    const available = transitions.map(t => `"${t.name}" → ${t.to?.name}`).join(', ') || 'none';
    const message = `${issueKey} cannot move from "${currentStatus}" to "${targetStatus}" (available: ${available}). Status left unchanged.`;
    console.log(`WARNING: ${message}`);
    annotate('warning', 'Jira status not updated', message);
    stepSummary(`## Jira status\n\n⚠️ ${message}`);
    return;
  }

  if (args['dry-run']) {
    console.log(`Dry run: would apply transition "${transition.name}" (id ${transition.id}) → "${targetStatus}". Nothing changed.`);
    stepSummary(`## Jira status (dry run)\n\n${issueKey}: would apply "${transition.name}" → ${targetStatus}. Nothing changed.`);
    return;
  }

  await jira('POST', `/issue/${issueKey}/transitions`, { transition: { id: transition.id } });
  console.log(`Transitioned ${issueKey}: "${currentStatus}" → "${targetStatus}" via "${transition.name}".`);

  const url = runUrl();
  const text = `Automated Playwright run ${result === 'passed' ? 'PASSED' : 'FAILED'}; status set to ${targetStatus}.${url ? ' Run: ' : ''}`;
  await jira('POST', `/issue/${issueKey}/comment`, {
    body: {
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text },
          ...(url ? [{ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }] : []),
        ],
      }],
    },
  });
  console.log(`Comment added to ${issueKey}.`);
  stepSummary(`## Jira status\n\n${issueKey}: "${currentStatus}" → **${targetStatus}** (run ${result}).`);
}

main().catch(error => {
  const message = error instanceof TransitionError ? error.message : error.stack;
  console.error(message);
  annotate('error', 'Jira status update failed', message);
  stepSummary(`## Jira status update failed\n\n\`\`\`\n${message}\n\`\`\``);
  process.exitCode = 2;
});
