# Ledger (todo)

Turned the old single-file CLI into something a bit more real: a server that
holds the actual data, a web page for it, and a CLI that's actually fast to
use day to day. All three talk to the same data so nothing gets out of sync.

```
todo-app/
├── server/   the API + the "database" (just a json file, don't overthink it) + the web page
└── cli/      the terminal thing, no deps, works offline
```

Basic idea: you've got **Lists** (Work, Watch list, whatever), each list has
**Tasks**, and any task can get a **Today** star on it. There's also an "All
tasks" view that just dumps everything together.

---

## getting it running on a machine

You need Node 18+ (uses the built-in `fetch`, nothing fancy).

**Server first** — this is what actually stores your stuff:

```bash
cd server
npm install
npm start
```

Then just open `http://localhost:4000` in a browser, that's the GUI. It's
running on your machine, nothing's hosted anywhere unless you set that up
yourself.

**CLI** — no install needed, no dependencies at all, just run it:

```bash
cd cli
node todo.js add "buy milk" -today
```

If typing `node todo.js` every time annoys you, do this once:

```bash
cd cli
npm link
```

and now you've got a global `todo` command from anywhere. Nice.

## using the CLI day to day

This is the whole point of the rewrite — it should feel like typing a note,
not filling out a form:

```bash
todo add "breaking bad" -list watch list   # makes the list if it's new
todo add "call dentist" -today             # lands in Inbox, starred for today
todo call the plumber -today               # you can even skip "add"

todo                    # just shows today's stuff
todo list all           # everything, every list
todo list watch list    # one list by name
todo lists              # list of your lists + how many are open

todo done call dentist      # marks it done, matches by title
todo undone call dentist    # oops, undo that
todo today call dentist     # toggle the today star on/off
todo rm call dentist        # gone
```

If what you typed matches more than one task it'll just show you the
matches instead of guessing wrong. Type a bit more and try again.

There's also `todo menu` if you're in the mood to arrow-key around instead
of typing — same thing, just the clickier version. And `todo help` if you
forget any of this.

## using it on more than one device

This is the part that needed thinking about. The CLI keeps its own local
copy at `~/.todo-cli/cache.json`, so it works completely offline — add
tasks on a plane, whatever, no server needed for any of the commands above.

When you do want to sync it up with the server:

```bash
todo fetch   # pulls down whatever's on the server, overwrites local
todo push    # pushes your local stuff up to the server
```

Heads up: it's simple "last one wins" syncing, not smart merging. Totally
fine for "same person, couple of laptops," not built for two people editing
the same list at once. If that ever becomes a real need, that's the next
thing to build.

To point the CLI at a server that isn't on your own machine (like if you
host it somewhere), just set an env var:

```bash
TODO_API_URL=https://wherever-you-hosted-it.com/api todo add "test"
```

Do that on every device you use and they'll all `fetch`/`push` to the same
place. The web GUI, though, always talks to whatever server it's being
served from — no config needed there.

## the web page

Kept it plain HTML/CSS/JS on purpose — no React, no Next, nothing to build
or bundle. It's a simple GUI, didn't need a framework for it, and this way
you just open the file and it works.

Dark by default because obviously, but there's a toggle if you're one of
those people. Also actually works on your phone now — sidebar tucks away
behind a hamburger menu on small screens instead of just looking broken.

## stuff that's not built yet

Two things are floating around as "later" — didn't want to rush them in
and make the foundation messy:

- **Telegram bot** — would just hit the same API the CLI and GUI already
  use, so it's not a huge lift whenever it happens
- **git integration** — auto-tasks from issues, linking tasks to commits,
  that kind of thing

Both are easy to bolt on later since everything already flows through one
shared API instead of being tangled into the CLI directly.