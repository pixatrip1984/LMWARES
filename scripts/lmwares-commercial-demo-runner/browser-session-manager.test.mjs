import test from 'node:test';
import assert from 'node:assert/strict';
import { launchDedicatedBrowser, profileArgument, transitionBrowserSession } from './browser-session-manager.mjs';

test('profile identity is constrained to an explicit Windows user-data directory', () => {
  assert.equal(profileArgument('C:\\dev\\lmwares-demo-brave-profile\\'), '--user-data-dir=c:\\dev\\lmwares-demo-brave-profile');
  assert.throws(() => profileArgument('..\\other-profile'), /no es válida/);
});

test('interactive transition closes the dedicated process before starting the visible recovery', async () => {
  const steps = [];
  const result = await transitionBrowserSession({
    action: 'open-interactive', launcherPath: 'C:\\launcher.ps1', endpoint: 'http://127.0.0.1:9223', debuggingPort: 9223,
    close: async () => { steps.push('close'); return { closed: true, reason: 'closed' }; },
    launch: async ({ executionMode }) => { steps.push(executionMode); return { launched: true, executionMode }; },
  });
  assert.deepEqual(steps, ['close', 'interactive']);
  assert.equal(result.transitioned, true);
});

test('a close timeout never launches a second browser owner for the same profile', async () => {
  let launches = 0;
  const result = await transitionBrowserSession({
    action: 'return-background', launcherPath: 'C:\\launcher.ps1',
    close: async () => ({ closed: false, reason: 'timeout' }),
    launch: async () => { launches += 1; },
  });
  assert.equal(result.transitioned, false);
  assert.equal(result.reason, 'close-timeout');
  assert.equal(launches, 0);
});

test('launcher receives only approved visible or isolated modes', async () => {
  let invocation;
  await launchDedicatedBrowser({ launcherPath: 'C:\\launcher.ps1', executionMode: 'interactive', runner: async (...args) => { invocation = args; } });
  assert.deepEqual(invocation[1].slice(-4), ['-ExecutionMode', 'interactive', '-DebuggingPort', '9223']);
  await assert.rejects(launchDedicatedBrowser({ launcherPath: 'C:\\launcher.ps1', executionMode: 'headless' }), /no es válido/);
});
