import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const GUARD_PATH = path.resolve(
  process.cwd(),
  "scripts/test-worktree/outbound-guard.cjs",
);

async function runGuardedScript(source: string) {
  return execFileAsync(
    process.execPath,
    ["--require", GUARD_PATH, "--eval", source],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ALLORO_WORKTREE_TEST_MODE: "true",
      },
      encoding: "utf8",
    },
  );
}

describe("worktree outbound guard", () => {
  it("permits loopback HTTP and *.localhost hostnames", async () => {
    const source = `
      const http = require("node:http");
      const guard = require(${JSON.stringify(GUARD_PATH)});
      const server = http.createServer((_request, response) => response.end("ok"));
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        http.get("http://127.0.0.1:" + port, (response) => {
          response.resume();
          response.on("end", () => {
            process.stdout.write(JSON.stringify({
              local: response.statusCode,
              runtimeHost: guard.isAllowedHostname("runtime-abc.localhost")
            }));
            server.close();
          });
        }).on("error", (error) => {
          server.close(() => { throw error; });
        });
      });
    `;

    const result = await runGuardedScript(source);

    expect(JSON.parse(result.stdout)).toEqual({
      local: 200,
      runtimeHost: true,
    });
  });

  it("blocks external HTTP, HTTPS, fetch, and DNS with redacted evidence", async () => {
    const source = `
      const dns = require("node:dns");
      const https = require("node:https");
      const checks = {};
      try {
        https.get("https://api.example.test/private-path?token=synthetic-secret", {
          headers: { authorization: "Bearer synthetic-secret" }
        });
      } catch (error) {
        checks.https = error.code;
      }
      Promise.all([
        fetch("https://fetch.example.test/private?token=synthetic-secret")
          .then(() => "unexpected")
          .catch((error) => error.code),
        dns.promises.resolve4("dns.example.test")
          .then(() => "unexpected")
          .catch((error) => error.code)
      ]).then(([fetchCode, dnsCode]) => {
        checks.fetch = fetchCode;
        checks.dns = dnsCode;
        process.stdout.write(JSON.stringify(checks));
      });
    `;

    const result = await runGuardedScript(source);

    expect(JSON.parse(result.stdout)).toEqual({
      https: "ALLORO_WORKTREE_OUTBOUND_BLOCKED",
      fetch: "ALLORO_WORKTREE_OUTBOUND_BLOCKED",
      dns: "ALLORO_WORKTREE_OUTBOUND_BLOCKED",
    });
    expect(result.stderr).toContain("api.example.test");
    expect(result.stderr).toContain("fetch.example.test");
    expect(result.stderr).toContain("dns.example.test");
    expect(result.stderr).not.toContain("private-path");
    expect(result.stderr).not.toContain("synthetic-secret");
    expect(result.stderr).not.toContain("authorization");
  });

  it("refuses to load unless explicit worktree mode is enabled", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        ["--require", GUARD_PATH, "--eval", "process.stdout.write('unexpected')"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            ALLORO_WORKTREE_TEST_MODE: "false",
          },
          encoding: "utf8",
        },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("ALLORO_WORKTREE_TEST_MODE=true is required"),
    });
  });
});
