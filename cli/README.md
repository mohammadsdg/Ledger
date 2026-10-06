# Ledger CLI usage

The Ledger CLI is an offline-first companion to the web app. It writes every change to `~/.todo-cli/cache.json` immediately, then merges that cache with your Ledger server when you run `todo fetch` or `todo push`.

## Install and connect

Ledger requires Node.js 18 or newer. From this directory:

```bash
npm link
export TODO_API_URL=https://tasks.example.com/api
export TODO_PASSWORD='the-same-value-as-APP_PASSWORD'
```

`TODO_API_URL` defaults to `http://localhost:4000/api`. Put the exports in your shell profile if you do not want to repeat them in every terminal.

## Commands

```text
todo                                      Show My Day
todo add <task>                           Add to All tasks
todo add <task> -today                    Add to My Day
todo add <task> -list <name>              Add to a list (creates it if needed)
todo <task> [-today] [-list <name>]        Shorthand for todo add
todo list [today|all|<list name>]          Show a view or list
todo lists                                Show lists and open/total counts
todo done <task>                          Mark a title match complete
todo undone <task>                        Mark a title match incomplete
todo today <task>                         Toggle My Day
todo rm <task>                            Delete a task
todo menu                                 Open the interactive menu
todo fetch                                Merge local and server changes
todo push                                 Merge local and server changes
todo help | todo --help | todo -h          Show built-in help
```

Task matching is case-insensitive and can use part of a title. Ledger will list the candidates instead of guessing when several tasks match. Add `-list <name>` to narrow a task command to one list.

## Examples

```bash
todo add "buy milk"
todo add "call dentist" -today
todo add "The Left Hand of Darkness" -list "Reading"
todo done call dentist
todo undone dentist
todo today buy milk
todo rm "The Left Hand"
todo list reading
```

## Offline use and syncing

All task commands work without the server. Both `fetch` and `push` perform the same safe two-way merge; the two names are kept because they are easy to remember in different workflows. Unrelated changes are preserved, and the newest edit wins when the same item changed on two devices.

If a sync fails, the local file is left intact. Check the server URL, password, HTTPS certificate, and network connection, then run either sync command again.
