const readline = require("readline");

function ansi(code, str) {
  return `\x1b[${code}m${str}\x1b[0m`;
}

const c = {
  bold: (s) => ansi(1, s),
  dim: (s) => ansi(2, s),
  green: (s) => ansi(32, s),
  cyan: (s) => ansi(36, s),
  yellow: (s) => ansi(33, s),
  red: (s) => ansi(31, s),
};

/**
 * Arrow-key select menu. Returns the `value` of the chosen item, or null if cancelled.
 * items: [{ label: string, value: any }]
 */
function selectMenu(title, items) {
  return new Promise((resolve) => {
    if (items.length === 0) {
      resolve(null);
      return;
    }
    let index = 0;

    const render = () => {
      console.clear();
      if (title) console.log(c.bold(title) + "\n");
      items.forEach((item, i) => {
        const active = i === index;
        const arrow = active ? c.cyan("❯ ") : "  ";
        const label = active ? c.cyan(item.label) : item.label;
        console.log(arrow + label);
      });
      console.log("\n" + c.dim("↑/↓ move   Enter select   q back"));
    };

    render();
    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isTTY && process.stdin.isRaw;
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKey = (str, key) => {
      if (!key) return;
      if (key.name === "up") {
        index = (index - 1 + items.length) % items.length;
        render();
      } else if (key.name === "down") {
        index = (index + 1) % items.length;
        render();
      } else if (key.name === "return") {
        cleanup();
        resolve(items[index].value);
      } else if (key.name === "q" || (key.ctrl && key.name === "c")) {
        cleanup();
        resolve(null);
      }
    };

    function cleanup() {
      process.stdin.removeListener("keypress", onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(!!wasRaw);
    }

    process.stdin.on("keypress", onKey);
  });
}

function promptText(question, defaultValue = "") {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

async function confirmPrompt(question) {
  const answer = await promptText(question + " (y/N) ");
  return answer.toLowerCase().startsWith("y");
}

async function pause(message = "Press Enter to continue…") {
  await promptText(c.dim(message));
}

module.exports = { selectMenu, promptText, confirmPrompt, pause, c };
