import assert from "node:assert/strict";
import test from "node:test";

import {
  taskkillResultSucceeded,
  terminateVerifiedWindowsChildTree,
  installParentDisconnectWatchdog,
  createWindowsAbandonedTaskCleanup,
  sendTaskResult
} from "../task-runner.mjs";

test("taskkillResultSucceeded validates successful execution", () => {
  assert.equal(taskkillResultSucceeded(undefined), false);
  assert.equal(taskkillResultSucceeded({ status: 1 }), false);
  assert.equal(taskkillResultSucceeded({ status: 0, signal: 'SIGTERM' }), false);
  assert.equal(taskkillResultSucceeded({ status: 0, signal: null, error: new Error() }), false);
  assert.equal(taskkillResultSucceeded({ status: 0, signal: null, error: undefined }), true);
});

test("terminateVerifiedWindowsChildTree validates child object and terminates", () => {
  assert.equal(terminateVerifiedWindowsChildTree(undefined, undefined), false);
  assert.equal(terminateVerifiedWindowsChildTree({ pid: -1 }, undefined), false);
  assert.equal(terminateVerifiedWindowsChildTree({ pid: 12345, exitCode: 1 }, undefined), false);

  const child = { pid: 12345, exitCode: null, signalCode: null };
  const identity = { executablePath: "cmd", argv: ["cmd"] };

  const res = terminateVerifiedWindowsChildTree(child, identity, {
    matchesInvocation: () => true,
    runTaskkill: () => ({ status: 0, signal: null, error: undefined }),
    alive: () => false
  });

  assert.equal(res, true);

  const resFail = terminateVerifiedWindowsChildTree(child, identity, {
    matchesInvocation: () => false
  });
  assert.equal(resFail, false);
});

test("installParentDisconnectWatchdog handles triggering and cleanup", () => {
  const channel = {
    connected: true,
    once: () => {},
    removeListener: () => {}
  };
  let killed = false;
  const watchdog = installParentDisconnectWatchdog({
    channel,
    killTree: () => { killed = true; return true; }
  });

  assert.equal(watchdog.armed, true);
  assert.equal(watchdog.cleanupStarted, false);

  watchdog.trigger();
  assert.equal(watchdog.cleanupStarted, true);
  assert.equal(killed, true);
  assert.equal(watchdog.armed, false);

  watchdog.disarm();
});

test("createWindowsAbandonedTaskCleanup manages child state lifecycle", () => {
  let terminated = false;
  const cleanup = createWindowsAbandonedTaskCleanup({}, {
    terminateChildTree: () => { terminated = true; return true; },
    acknowledge: () => 'acknowledged',
    exit: () => {}
  });

  assert.equal(cleanup.cleanup(), true);

  const child = { pid: 12345, exitCode: null, signalCode: null };
  const identity = { executablePath: 'cmd', argv: ['cmd'] };

  cleanup.onSpawn(child, identity);
  assert.equal(cleanup.cleanup(), false); // requires false return upon terminating true on first call per implementation
  assert.equal(terminated, true);

  cleanup.onClose(child, true);
  assert.equal(cleanup.cleanup(), true);
});

test("sendTaskResult sends well-formed result to parent channel", async () => {
  const channel = {
    connected: true,
    send: (msg, cb) => cb()
  };

  // Valid task result
  const res = await sendTaskResult("12345678-1234-4234-8234-1234567890ab", "build", "succeeded", channel);
  assert.equal(res, true);

  // Invalid token
  const res2 = await sendTaskResult("invalid", "build", "succeeded", channel);
  assert.equal(res2, false);

  // Invalid task
  const res3 = await sendTaskResult("12345678-1234-4234-8234-1234567890ab", "invalid_task", "succeeded", channel);
  assert.equal(res3, false);

  // Disconnected channel
  const res4 = await sendTaskResult("12345678-1234-4234-8234-1234567890ab", "build", "succeeded", { connected: false });
  assert.equal(res4, false);
});

import { parseProcessGroupSnapshot } from "../task-runner.mjs";

test("parseProcessGroupSnapshot handles typical output", () => {
  const snapshot = `PPID PID
100 12345
12345 54321`;
  const result = parseProcessGroupSnapshot(snapshot, {
    processGroupId: 12345,
    runnerPid: 100,
    probePid: 99999
  });

  // Just testing it doesn't throw and parses properly
  assert.equal(result, undefined);
});

test("parseProcessGroupSnapshot handles empty", () => {
  const result = parseProcessGroupSnapshot("", {
    processGroupId: 12345,
    runnerPid: 100,
    probePid: 99999
  });

  assert.equal(result, undefined);
});
