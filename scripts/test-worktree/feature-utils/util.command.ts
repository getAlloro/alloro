import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_COMMAND_BUFFER_BYTES = 64 * 1024 * 1024;

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  const result = await execFileAsync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: MAX_COMMAND_BUFFER_BYTES,
  });

  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}
