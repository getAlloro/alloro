import { describe, expect, it } from "vitest";
import {
  assertWorktreeBootstrapToken,
  createWorktreeBootstrapHtml,
} from "./util.bootstrap-html";

const TEST_TOKEN = "header.payload.signature";

describe("worktree bootstrap page", () => {
  it("stores the token locally and redirects without putting it in a URL or cookie", () => {
    const html = createWorktreeBootstrapHtml(TEST_TOKEN);

    expect(html).toContain(`localStorage.setItem("auth_token", "${TEST_TOKEN}")`);
    expect(html).toContain('window.location.replace("/admin")');
    expect(html).not.toContain("document.cookie");
    expect(html).not.toContain(`?token=${TEST_TOKEN}`);
  });

  it.each(["", "not-a-jwt", "one.two", "one.two.three.four", "<script>.x.y"])(
    "rejects invalid token %j",
    (token) => {
      expect(() => assertWorktreeBootstrapToken(token)).toThrow(
        "not a valid compact JWT",
      );
    },
  );
});
