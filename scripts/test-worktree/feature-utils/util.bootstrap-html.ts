const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function assertWorktreeBootstrapToken(token: string): void {
  if (!JWT_PATTERN.test(token)) {
    throw new Error("Worktree bootstrap token is not a valid compact JWT.");
  }
}

export function createWorktreeBootstrapHtml(token: string): string {
  assertWorktreeBootstrapToken(token);
  const tokenLiteral = JSON.stringify(token);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Starting isolated Alloro session</title>
</head>
<body>
  <p>Starting isolated Alloro session…</p>
  <script>
    localStorage.setItem("auth_token", ${tokenLiteral});
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("pilot_mode");
    window.location.replace("/admin");
  </script>
</body>
</html>`;
}
