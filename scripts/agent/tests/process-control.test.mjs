import assert from "node:assert/strict";
import test from "node:test";

import {
  deadProcessTreeAbsent,
  stoppedRuntimeCanBeCleared,
  taskkillSucceeded,
  terminateProcessTree,
} from "../process-control.mjs";

test("termination re-verifies identity before SIGKILL escalation", async () => {
  const signals = [];
  let verifications = 0;
  const result = await terminateProcessTree(
    424242,
    () => {
      verifications += 1;
      return verifications === 1;
    },
    {
      platform: "linux",
      alive: () => true,
      groupAlive: () => true,
      waitForGroupExit: async () => false,
      kill: (pid, signal) => {
        signals.push([pid, signal]);
      },
    },
  );
  assert.equal(result, false);
  assert.deepEqual(signals, [[-424242, "SIGTERM"]]);
  assert.equal(verifications, 2);
});

test("termination waits for descendants after the leader exits", async () => {
  const signals = [];
  let leaderAlive = true;
  let groupAlive = true;
  let waits = 0;
  const result = await terminateProcessTree(
    424243,
    () => true,
    {
      platform: "linux",
      alive: () => leaderAlive,
      groupAlive: () => groupAlive,
      waitForGroupExit: async () => {
        waits += 1;
        if (waits === 1) return false;
        groupAlive = false;
        return true;
      },
      kill: (pid, signal) => {
        signals.push([pid, signal]);
        if (signal === "SIGTERM") leaderAlive = false;
      },
    },
  );
  assert.equal(result, true);
  assert.deepEqual(signals, [
    [-424243, "SIGTERM"],
    [-424243, "SIGKILL"],
  ]);
});

test("a dead leader with live POSIX descendants fails closed", async () => {
  const absent = deadProcessTreeAbsent(424244, {
    platform: "linux",
    alive: () => false,
    groupAlive: () => true,
  });
  assert.equal(absent, false);

  const result = await terminateProcessTree(
    424244,
    () => false,
    {
      platform: "linux",
      alive: () => false,
      groupAlive: () => true,
      kill: () => {
        throw new Error("must not kill an unverified group");
      },
    },
  );
  assert.equal(result, false);
});

test("Windows dead state requires an exact final runner terminal marker", () => {
  const options = {
    platform: "win32",
    alive: () => false,
    groupAlive: () => true,
  };
  assert.equal(
    stoppedRuntimeCanBeCleared(424245, [], options),
    false,
  );
  assert.equal(
    stoppedRuntimeCanBeCleared(
      424245,
      ["[TOKENMONSTER_AGENT] EXIT code=0"],
      options,
    ),
    true,
  );
  assert.equal(
    stoppedRuntimeCanBeCleared(
      424245,
      ["[TOKENMONSTER_AGENT] EXIT code=0 "],
      options,
    ),
    false,
  );
});

test("Windows taskkill cleanup accepts only an unambiguous success", () => {
  assert.equal(
    taskkillSucceeded({ status: 0, signal: null, error: undefined }),
    true,
  );
  assert.equal(
    taskkillSucceeded({ status: 1, signal: null, error: undefined }),
    false,
  );
  assert.equal(
    taskkillSucceeded({ status: 0, signal: "SIGTERM", error: undefined }),
    false,
  );
  assert.equal(
    taskkillSucceeded({
      status: 0,
      signal: null,
      error: new Error("timeout"),
    }),
    false,
  );
});

import {
  waitForProcessExit,
  processGroupAlive,
  waitForProcessGroupExit,
} from "../process-control.mjs";

test("waitForProcessExit returns true when process exits", async () => {
  let aliveChecks = 0;
  const originalAlive = process.kill;
  try {
    process.kill = (pid, signal) => {
      aliveChecks++;
      if (aliveChecks > 2) {
        throw { code: "ESRCH" };
      }
      return true;
    };
    const result = await waitForProcessExit(12345, 500);
    assert.equal(result, true);
  } finally {
    process.kill = originalAlive;
  }
});

test("waitForProcessExit returns false when timeout reached", async () => {
  const originalAlive = process.kill;
  try {
    process.kill = () => true;
    const result = await waitForProcessExit(12345, 150);
    assert.equal(result, false);
  } finally {
    process.kill = originalAlive;
  }
});

test("processGroupAlive returns false for invalid pid", () => {
  assert.equal(processGroupAlive(-1), false);
});

test("processGroupAlive handles kill EPERM correctly", () => {
  const result = processGroupAlive(12345, (pid, signal) => {
    throw { code: "EPERM" };
  });
  assert.equal(result, true);
});

test("processGroupAlive handles kill other error correctly", () => {
  const result = processGroupAlive(12345, (pid, signal) => {
    throw { code: "ESRCH" };
  });
  assert.equal(result, false);
});

test("waitForProcessGroupExit handles timely exit", async () => {
  let aliveChecks = 0;
  const result = await waitForProcessGroupExit(12345, 500, (pid) => {
    aliveChecks++;
    return aliveChecks <= 2;
  });
  assert.equal(result, true);
});

test("waitForProcessGroupExit handles timeout", async () => {
  const result = await waitForProcessGroupExit(12345, 150, (pid) => true);
  assert.equal(result, false);
});

test("stoppedRuntimeCanBeCleared works for posix", () => {
  const result = stoppedRuntimeCanBeCleared(12345, [], {
    platform: "linux",
    alive: () => false,
    groupAlive: () => false,
  });
  assert.equal(result, true);
});

test("stoppedRuntimeCanBeCleared returns false if pid invalid or alive", () => {
  assert.equal(stoppedRuntimeCanBeCleared(-1, []), false);
  assert.equal(stoppedRuntimeCanBeCleared(12345, [], {
    platform: "linux",
    alive: () => true
  }), false);
});
