import readline from "node:readline";

// Default No: only an explicit y/yes applies.
export function parseYes(answer) {
  const text = (answer ?? "").trim().toLowerCase();
  return text === "y" || text === "yes";
}

// The apply question. When the plan strips comments/formatting (a JSONC
// config), the question names that file and promises a backup.
export function planQuestion(plan) {
  const stripped = (plan.files ?? []).filter((file) => file.reason === "jsonc" && file.status !== "unchanged");
  if (stripped.length === 0) {
    return "Apply these changes? [y/N] ";
  }
  return `This removes comments/formatting from ${stripped.map((file) => file.path).join(", ")} (a backup is made). Apply these changes? [y/N] `;
}

export const defaultOut = (line) => process.stdout.write(`${line}\n`);

// Null when stdin is not a TTY: callers fall back to plan-only output.
export function defaultAsker({ stdin = process.stdin, stdout = process.stdout } = {}) {
  if (!stdin.isTTY) {
    return null;
  }
  const question = (prompt) => new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
  return {
    confirm: async (prompt) => parseYes(await question(prompt)),
    input: async (prompt) => question(prompt),
  };
}
