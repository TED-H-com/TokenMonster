import {
  WINDOWS_PROCESS_QUERY_TIMEOUT_MS,
  parseWindowsCommandLine,
  processMatchesExactWindowsInvocation,
  validRunnerToken,
  validProcessId,
  processAlive,
  processCommandLine,
  windowsProcessDetailsMatch,
  processMatchesRunner,
  processMatchesTaskRunner,
  processMatchesLauncher
} from "../process-identity.mjs";
import assert from "node:assert/strict";
import test from "node:test";



test("Windows exact-identity query tolerates cold CIM startup", () => {
  assert.equal(WINDOWS_PROCESS_QUERY_TIMEOUT_MS, 15_000);
});

test("Windows command-line parsing preserves reviewed argv boundaries", () => {
  assert.deepEqual(
    parseWindowsCommandLine(
      '"C:\\Program Files\\node.exe" scripts\\agent\\runner.mjs 1234',
    ),
    [
      "C:\\Program Files\\node.exe",
      "scripts\\agent\\runner.mjs",
      "1234",
    ],
  );
  assert.equal(
    parseWindowsCommandLine('"C:\\Program Files\\node.exe'),
    undefined,
  );
  assert.equal(
    parseWindowsCommandLine("node runner token extra").length,
    4,
  );
});

test("runner ownership tokens are strict v4 UUIDs", () => {
  assert.equal(
    validRunnerToken("12345678-1234-4234-8234-123456789abc"),
    true,
  );
  assert.equal(validRunnerToken("token with spaces"), false);
  assert.equal(
    validRunnerToken("12345678-1234-1234-8234-123456789abc"),
    false,
  );
});

test("Windows exact invocation rejects executable, payload and argv drift", () => {
  const executable = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const argv = [
    executable,
    "-NoLogo",
    "-File",
    "C:\\repo\\scripts\\agent\\windows-task-tree.ps1",
    "-Payload",
    "reviewed-base64",
  ];
  const details = {
    ExecutablePath: executable.toUpperCase(),
    CommandLine: argv.map((value) => `"${value}"`).join(" "),
  };
  assert.equal(
    windowsProcessDetailsMatch(details, executable, argv),
    true,
  );
  assert.equal(
    windowsProcessDetailsMatch(
      { ...details, ExecutablePath: "C:\\foreign.exe" },
      executable,
      argv,
    ),
    false,
  );
  assert.equal(
    windowsProcessDetailsMatch(
      {
        ...details,
        CommandLine: details.CommandLine.replace(
          "reviewed-base64",
          "mutated-base64",
        ),
      },
      executable,
      argv,
    ),
    false,
  );
  assert.equal(
    windowsProcessDetailsMatch(
      { ...details, CommandLine: `${details.CommandLine} "extra"` },
      executable,
      argv,
    ),
    false,
  );
  assert.equal(
    processMatchesExactWindowsInvocation(
      1234,
      executable,
      argv,
      () => details,
    ),
    true,
  );
});

import { spawnSync } from "node:child_process";




test("validProcessId validation", () => {
  assert.equal(validProcessId(123), true);
  assert.equal(validProcessId(-1), false);
  assert.equal(validProcessId("123"), false);
  assert.equal(validProcessId(2_147_483_648), false);
});

test("validRunnerToken validation", () => {
  assert.equal(validRunnerToken("12345678-1234-4234-8234-1234567890ab"), true);
  assert.equal(validRunnerToken("invalid"), false);
  assert.equal(validRunnerToken(null), false);
});

test("processAlive validation", () => {
  const originalKill = process.kill;
  try {
    process.kill = () => true;
    assert.equal(processAlive(123), true);

    process.kill = () => { throw { code: 'EPERM' }; };
    assert.equal(processAlive(123), true);

    process.kill = () => { throw { code: 'ESRCH' }; };
    assert.equal(processAlive(123), false);

    assert.equal(processAlive(-1), false);
  } finally {
    process.kill = originalKill;
  }
});

test("processCommandLine handles invalid pid", () => {
  assert.equal(processCommandLine(-1), undefined);
});

test("processMatchesLauncher matches exactly", () => {
  assert.equal(processMatchesLauncher(-1), false);
});

test("processMatchesRunner validates token and delegates", () => {
  assert.equal(processMatchesRunner(-1, "invalid", "cmd"), false);
  assert.equal(processMatchesRunner(-1, "12345678-1234-4234-8234-1234567890ab", "cmd"), false);
});

test("processMatchesTaskRunner validates token and checks tasks", () => {
  assert.equal(processMatchesTaskRunner(-1, "invalid", "cmd"), false);
  assert.equal(processMatchesTaskRunner(-1, "12345678-1234-4234-8234-1234567890ab", "cmd"), false);
});

test("windowsProcessDetailsMatch validates parameter types and equality", () => {
  const validDetails = {
    ExecutablePath: "C:\\node.exe",
    CommandLine: '"C:\\node.exe" arg1'
  };

  assert.equal(windowsProcessDetailsMatch(undefined, "cmd", ["cmd"]), false);
  assert.equal(windowsProcessDetailsMatch(validDetails, undefined, ["cmd"]), false);
  assert.equal(windowsProcessDetailsMatch(validDetails, "C:\\node.exe", undefined), false);

  assert.equal(windowsProcessDetailsMatch(validDetails, "C:\\other.exe", ["C:\\other.exe", "arg1"]), false);
  assert.equal(windowsProcessDetailsMatch(validDetails, "C:\\node.exe", ["C:\\node.exe", "arg1"]), true);
  assert.equal(windowsProcessDetailsMatch(validDetails, "C:\\node.exe", ["C:\\node.exe"]), false);
});
