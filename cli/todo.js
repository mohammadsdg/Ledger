#!/usr/bin/env node
const store = require("./lib/store");
const api = require("./lib/api");
const { selectMenu, promptText, confirmPrompt, pause, c } = require("./lib/ui");

const KNOWN_COMMANDS = [
  "add", "list", "lists", "done", "undone", "today", "rm", "delete",
  "fetch", "push", "menu", "help",
];

// ---------- tiny arg parser ----------
// Turns:  breaking bad -list watch list -today
// into:   { text: "breaking bad", list: "watch list", today: true }
function isFlag(tok) {
  return tok === "-today" || tok === "--today" || tok === "-list" || tok === "--list";
}

function parseArgs(args) {
  let today = false;
  let list = null;
  const textParts = [];
  let i = 0;
  while (i < args.length) {
    const tok = args[i];
    if (tok === "-today" || tok === "--today") {
      today = true;
      i++;
    } else if (tok === "-list" || tok === "--list") {
      i++;
      const listParts = [];
      while (i < args.length && !isFlag(args[i])) {
        listParts.push(args[i]);
        i++;
      }
      list = listParts.join(" ");
    } else {
      textParts.push(tok);
      i++;
    }
  }
  return { text: textParts.join(" ").trim(), today, list };
}

// ---------- helpers ----------

function listName(state, listId) {
  const l = state.lists.find((x) => x.id === listId);
  return l ? l.name : "?";
}

function findListByName(state, name) {
  if (!name) return null;
  const q = name.trim().toLowerCase();
  return (
    state.lists.find((l) => l.name.toLowerCase() === q) ||
    state.lists.find((l) => l.name.toLowerCase().includes(q))
  );
}

function inboxList(state) {
  return state.lists.find((l) => l.id === "inbox" || l.name.toLowerCase() === "inbox");
}

function findTaskMatches(state, text, listFilterName) {
  let pool = state.tasks;
  if (listFilterName) {
    const list = findListByName(state, listFilterName);
    if (list) pool = pool.filter((t) => t.listId === list.id);
  }
  const q = text.trim().toLowerCase();
  if (!q) return [];
  return pool.filter((t) => t.title.toLowerCase().includes(q));
}

function printAmbiguous(state, matches) {
  console.log(c.yellow("Multiple tasks match — be more specific:"));
  matches.forEach((t) => console.log("  - " + t.title + c.dim(`  [${listName(state, t.listId)}]`)));
}

function taskLine(state, t, showList) {
  const box = t.done ? c.green("✓") : "○";
  const star = t.today ? c.cyan("★") : " ";
  const tag = showList ? c.dim(`  [${listName(state, t.listId)}]`) : "";
  const title = t.done ? c.dim(t.title) : t.title;
  return `${box} ${star} ${title}${tag}`;
}

// ---------- sync commands ----------

async function cmdFetch() {
  console.log(c.dim(`Fetching from ${api.BASE} ...`));
  try {
    const remote = await api.getState();
    store.write({ ...remote, lastSyncedAt: new Date().toISOString() });
    console.log(c.green(`✓ Synced. ${remote.lists.length} list(s), ${remote.tasks.length} task(s) now local.`));
  } catch (err) {
    console.log(c.red(`✗ Could not reach the server (${err.message}).`));
  }
}

async function cmdPush() {
  const state = store.read();
  console.log(c.dim(`Pushing to ${api.BASE} ...`));
  try {
    const merged = await api.sync(state.lists, state.tasks);
    store.write({ ...merged, lastSyncedAt: new Date().toISOString() });
    console.log(c.green(`✓ Pushed. Server now has ${merged.lists.length} list(s), ${merged.tasks.length} task(s).`));
  } catch (err) {
    console.log(c.red(`✗ Could not reach the server (${err.message}).`));
    console.log(c.dim("  Your changes are still saved locally — try again when you're online."));
  }
}

// ---------- quick commands ----------

async function cmdAdd(args) {
  const { text, today, list } = parseArgs(args);
  if (!text) {
    console.log(c.red('What\'s the task? e.g.  todo add "buy milk" -today'));
    return;
  }

  const state = store.read();
  let target;

  if (list) {
    target = findListByName(state, list);
    if (!target) {
      target = { id: store.newId(), name: list, createdAt: new Date().toISOString() };
      state.lists.push(target);
      console.log(c.dim(`(created new list "${list}")`));
    }
  } else {
    target = inboxList(state);
    if (!target) {
      target = { id: "inbox", name: "Inbox", createdAt: new Date().toISOString() };
      state.lists.push(target);
    }
  }

  const now = new Date().toISOString();
  state.tasks.push({
    id: store.newId(),
    listId: target.id,
    title: text,
    done: false,
    today: !!today,
    createdAt: now,
    updatedAt: now,
  });
  store.write(state);

  console.log(c.green(`✓ Added "${text}"`) + c.dim(`  → ${target.name}${today ? " · Today" : ""}`));
}

async function cmdList(args) {
  const state = store.read();
  const query = args.join(" ").trim().toLowerCase();

  let tasks, title;
  if (!query || query === "today") {
    tasks = state.tasks.filter((t) => t.today);
    title = "Today";
  } else if (query === "all") {
    tasks = state.tasks;
    title = "All tasks";
  } else {
    const list = findListByName(state, query);
    if (!list) {
      console.log(c.red(`No list matching "${args.join(" ")}".`));
      if (state.lists.length) console.log(c.dim("Lists: " + state.lists.map((l) => l.name).join(", ")));
      return;
    }
    tasks = state.tasks.filter((t) => t.listId === list.id);
    title = list.name;
  }

  console.log(c.bold(title));
  if (tasks.length === 0) {
    console.log(c.dim("  (nothing here)"));
    return;
  }
  const showList = title === "Today" || title === "All tasks";
  tasks
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((t) => console.log("  " + taskLine(state, t, showList)));
}

async function cmdLists() {
  const state = store.read();
  if (state.lists.length === 0) {
    console.log(c.dim("No lists yet. todo add \"first task\" -list Inbox"));
    return;
  }
  state.lists.forEach((l) => {
    const total = state.tasks.filter((t) => t.listId === l.id).length;
    const open = state.tasks.filter((t) => t.listId === l.id && !t.done).length;
    console.log(`  ${l.name}${c.dim(`  ${open}/${total} open`)}`);
  });
}

async function cmdDone(args, done = true) {
  const { text, list } = parseArgs(args);
  if (!text) {
    console.log(c.red("Which task? e.g.  todo done buy milk"));
    return;
  }
  const state = store.read();
  const matches = findTaskMatches(state, text, list);
  if (matches.length === 0) {
    console.log(c.red(`No task matching "${text}".`));
    return;
  }
  if (matches.length > 1) {
    printAmbiguous(state, matches);
    return;
  }
  const task = matches[0];
  task.done = done;
  task.updatedAt = new Date().toISOString();
  store.write(state);
  console.log(c.green(`${done ? "✓ Marked done" : "○ Marked not done"}: ${task.title}`));
}

async function cmdToggleToday(args) {
  const { text, list } = parseArgs(args);
  if (!text) {
    console.log(c.red("Which task? e.g.  todo today buy milk"));
    return;
  }
  const state = store.read();
  const matches = findTaskMatches(state, text, list);
  if (matches.length === 0) {
    console.log(c.red(`No task matching "${text}".`));
    return;
  }
  if (matches.length > 1) {
    printAmbiguous(state, matches);
    return;
  }
  const task = matches[0];
  task.today = !task.today;
  task.updatedAt = new Date().toISOString();
  store.write(state);
  console.log(c.green(task.today ? `★ Added to Today: ${task.title}` : `☆ Removed from Today: ${task.title}`));
}

async function cmdRemove(args) {
  const { text, list } = parseArgs(args);
  if (!text) {
    console.log(c.red("Which task? e.g.  todo rm buy milk"));
    return;
  }
  const state = store.read();
  const matches = findTaskMatches(state, text, list);
  if (matches.length === 0) {
    console.log(c.red(`No task matching "${text}".`));
    return;
  }
  if (matches.length > 1) {
    printAmbiguous(state, matches);
    return;
  }
  const task = matches[0];
  state.tasks = state.tasks.filter((t) => t.id !== task.id);
  store.write(state);
  console.log(c.green(`✓ Removed: ${task.title}`));
}

function printHelp() {
  console.log(`
${c.bold("todo")} — quick, offline-first task capture

  todo add <task> [-today] [-list <name>]   Add a task (default list: Inbox)
  todo <task text>                          Shorthand for "todo add ..."
  todo list [today|all|<list name>]         Show tasks (default: Today)
  todo lists                                Show all lists with counts
  todo done <task>                          Mark a task done (matches by title)
  todo undone <task>                        Mark a task not done
  todo today <task>                         Toggle the Today tag on a task
  todo rm <task>                            Delete a task
  todo fetch                                Pull latest state from the server
  todo push                                 Upload local changes to the server
  todo menu                                 Old arrow-key browsing menu

Examples:
  todo add "breaking bad" -list watch list
  todo add "call dentist" -today
  todo done call dentist
  todo list watch list

Local cache: ${store.FILE}
Server:      ${api.BASE}  (override with TODO_API_URL)
`);
}

// ---------- old interactive menu (still here if you want to browse instead of type) ----------

function tasksForView(state, view) {
  if (view === "today") return state.tasks.filter((t) => t.today);
  if (view === "all") return state.tasks;
  return state.tasks.filter((t) => t.listId === view);
}

function viewTitle(state, view) {
  if (view === "today") return "★ Today";
  if (view === "all") return "☰ All tasks";
  const l = state.lists.find((x) => x.id === view);
  return l ? l.name : "List";
}

async function newListFlow() {
  const name = await promptText("New list name: ");
  if (!name) return;
  const state = store.read();
  state.lists.push({ id: store.newId(), name, createdAt: new Date().toISOString() });
  store.write(state);
}

async function addTaskFlow(view) {
  const state = store.read();
  let listId = view;

  if (view === "today" || view === "all") {
    if (state.lists.length === 0) {
      console.log(c.yellow("No lists yet — create one first."));
      await pause();
      return;
    }
    listId = await selectMenu(
      "Add task to which list?",
      state.lists.map((l) => ({ label: l.name, value: l.id }))
    );
    if (!listId) return;
  }

  const title = await promptText("Task: ");
  if (!title) return;

  const now = new Date().toISOString();
  state.tasks.push({
    id: store.newId(),
    listId,
    title,
    done: false,
    today: view === "today",
    createdAt: now,
    updatedAt: now,
  });
  store.write(state);
}

async function taskActionsFlow(taskId) {
  while (true) {
    const state = store.read();
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const choice = await selectMenu(task.title, [
      { label: task.done ? "○ Mark not done" : "✓ Mark done", value: "toggle-done" },
      { label: task.today ? "☆ Remove from Today" : "★ Add to Today", value: "toggle-today" },
      { label: "✎ Rename", value: "rename" },
      { label: "⇄ Move to another list", value: "move" },
      { label: "✕ Delete", value: "delete" },
      { label: "‹ Back", value: "back" },
    ]);

    if (!choice || choice === "back") return;

    if (choice === "toggle-done") {
      task.done = !task.done;
      task.updatedAt = new Date().toISOString();
      store.write(state);
    } else if (choice === "toggle-today") {
      task.today = !task.today;
      task.updatedAt = new Date().toISOString();
      store.write(state);
    } else if (choice === "rename") {
      const title = await promptText("New title: ", task.title);
      task.title = title;
      task.updatedAt = new Date().toISOString();
      store.write(state);
    } else if (choice === "move") {
      const otherLists = state.lists.filter((l) => l.id !== task.listId);
      if (otherLists.length === 0) {
        console.log(c.yellow("No other lists to move to."));
        await pause();
        continue;
      }
      const newListId = await selectMenu(
        "Move to which list?",
        otherLists.map((l) => ({ label: l.name, value: l.id }))
      );
      if (newListId) {
        task.listId = newListId;
        task.updatedAt = new Date().toISOString();
        store.write(state);
      }
    } else if (choice === "delete") {
      const ok = await confirmPrompt(`Delete "${task.title}"?`);
      if (ok) {
        state.tasks = state.tasks.filter((t) => t.id !== task.id);
        store.write(state);
        return;
      }
    }
  }
}

async function viewMenu(view) {
  while (true) {
    const state = store.read();
    const tasks = tasksForView(state, view).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const showTag = view === "today" || view === "all";

    const items = tasks.map((t) => ({
      label:
        `${t.done ? "✓" : "○"} ${t.today ? "★ " : "  "}${t.title}` +
        (showTag ? c.dim(`  [${listName(state, t.listId)}]`) : ""),
      value: { type: "task", id: t.id },
    }));
    items.push({ label: "+ Add task", value: { type: "add" } });
    items.push({ label: "‹ Back", value: { type: "back" } });

    const choice = await selectMenu(viewTitle(state, view), items);
    if (!choice || choice.type === "back") return;
    if (choice.type === "add") await addTaskFlow(view);
    else if (choice.type === "task") await taskActionsFlow(choice.id);
  }
}

async function interactiveMenu() {
  const state = store.read();
  const items = [
    { label: "★ Today", value: { type: "view", view: "today" } },
    { label: "☰ All tasks", value: { type: "view", view: "all" } },
    ...state.lists.map((l) => ({ label: `  ${l.name}`, value: { type: "view", view: l.id } })),
    { label: "+ New list", value: { type: "newlist" } },
    { label: "⇣ Fetch from server", value: { type: "fetch" } },
    { label: "⇡ Push to server", value: { type: "push" } },
    { label: "Quit", value: { type: "quit" } },
  ];

  const synced = state.lastSyncedAt ? `last synced ${new Date(state.lastSyncedAt).toLocaleString()}` : "never synced — fully local";
  const choice = await selectMenu(`todo  ${c.dim("(" + synced + ")")}`, items);

  if (!choice || choice.type === "quit") return false;
  if (choice.type === "view") await viewMenu(choice.view);
  else if (choice.type === "newlist") await newListFlow();
  else if (choice.type === "fetch") { await cmdFetch(); await pause(); }
  else if (choice.type === "push") { await cmdPush(); await pause(); }
  return true;
}

async function runInteractiveMenu() {
  let keepGoing = true;
  while (keepGoing) {
    keepGoing = await interactiveMenu();
  }
  console.clear();
  console.log(c.dim("Bye."));
}

// ---------- entry ----------

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd) return cmdList([]); // bare `todo` = quick glance at Today, not a maze of menus

  if (!KNOWN_COMMANDS.includes(cmd)) {
    // `todo buy milk -today` — no need to type "add"
    return cmdAdd(args);
  }

  const rest = args.slice(1);
  switch (cmd) {
    case "add": return cmdAdd(rest);
    case "list": return cmdList(rest);
    case "lists": return cmdLists();
    case "done": return cmdDone(rest, true);
    case "undone": return cmdDone(rest, false);
    case "today": return rest.length ? cmdToggleToday(rest) : cmdList(["today"]);
    case "rm":
    case "delete": return cmdRemove(rest);
    case "fetch": return cmdFetch();
    case "push": return cmdPush();
    case "menu": return runInteractiveMenu();
    case "help": return printHelp();
  }
}

main();
