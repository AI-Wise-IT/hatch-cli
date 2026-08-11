// A password-style prompt: input is never echoed to the terminal.
//
// When stdin is a TTY, this reads raw keystrokes so nothing is displayed
// while typing (matching the convention of tools like `sudo`, `npm login`).
// When stdin is not a TTY (piped input — scripting or non-interactive
// verification), it just reads the first line, since there is no terminal
// echo to suppress in that case.

const ENTER_CHARS = new Set(["\n", "\r"]);
const BACKSPACE_CHARS = new Set([
  String.fromCharCode(127),
  String.fromCharCode(8),
]);
const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);

export function promptHidden(promptText: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(promptText);

  if (!stdin.isTTY) {
    return readLineFromPipe();
  }

  return new Promise((resolve) => {
    const chars: string[] = [];
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (ENTER_CHARS.has(char) || char === CTRL_D) {
          cleanup();
          stdout.write("\n");
          resolve(chars.join(""));
          return;
        }
        if (char === CTRL_C) {
          // Resolve empty rather than force-exiting here: the caller treats
          // an empty token as "nothing provided" and exits cleanly with a
          // non-zero code, without an abrupt process.exit() racing pending
          // async work (e.g. an in-flight fetch) on the way out.
          cleanup();
          stdout.write("\n");
          resolve("");
          return;
        }
        if (BACKSPACE_CHARS.has(char)) {
          chars.pop();
          continue;
        }
        chars.push(char);
      }
    };

    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    }

    stdin.on("data", onData);
  });
}

function readLineFromPipe(): Promise<string> {
  return new Promise((resolve) => {
    let buffer = "";
    const onData = (chunk: string) => {
      buffer += chunk;
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(buffer.slice(0, newlineIndex).replace(/\r$/, ""));
      }
    };
    process.stdin.on("data", onData);
    process.stdin.once("end", () => {
      process.stdin.removeListener("data", onData);
      resolve(buffer.replace(/\r$/, ""));
    });
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
  });
}
