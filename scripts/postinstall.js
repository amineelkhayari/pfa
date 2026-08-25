/**
 * Post-install hook (npm `postinstall`).
 *
 * Installs dashboard dependencies when the dashboard source is present.
 *
 *   1. `npm run dashboard:ci` when dashboard/ exists — the dashboard carries its own lockfile and
 *      the root install would otherwise leave it without dependencies. A failure here MUST abort
 *      the install: the old inline hook swallowed spawnSync's exit status, so a red dashboard
 *      install still reported `npm install` success and the breakage surfaced only at build/run
 *      time.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

/** The steps to run for a given repo root, in order. */
function planSteps(root) {
  const steps = [];
  if (fs.existsSync(path.join(root, 'dashboard'))) {
    steps.push({
      name: 'dashboard dependencies (npm run dashboard:ci)',
      command: 'npm run dashboard:ci',
      options: { stdio: 'inherit', shell: true, cwd: root },
    });
  }
  return steps;
}

/** Human-readable failure cause from a spawnSync result. */
function failureReason(res) {
  if (res.error) return `failed to start — ${res.error.message}`;
  if (typeof res.status === 'number' && res.status !== 0) return `exit code ${res.status}`;
  if (res.signal) return `killed by ${res.signal}`;
  return null;
}

/**
 * Run the planned steps, stopping at the first failure. Returns the process exit code (0 = all
 * steps ran clean or were absent). `spawn` is injectable for tests.
 */
function run(root = ROOT, spawn = spawnSync) {
  const steps = planSteps(root);
  if (!steps.length) {
    console.log('postinstall: no dashboard source present — nothing to do.');
    return 0;
  }
  for (const step of steps) {
    const res = spawn(step.command, step.args, step.options);
    const reason = failureReason(res ?? {});
    if (reason) {
      console.error(
        `postinstall: ${step.name} failed (${reason}). The install is INCOMPLETE — ` +
          'fix the error above and re-run `npm install`.',
      );
      return 1;
    }
  }
  return 0;
}

if (require.main === module) {
  process.exit(run());
}

module.exports = { planSteps, failureReason, run, ROOT };
