# Ledger

A quiet, self-hosted place for tasks.

Ledger has a focused web app for everyday use and a small offline-first CLI for quick capture. Your data stays in your own MySQL database, the app is protected by a password, and it can be installed on a phone or desktop as a PWA.

## What it feels like

The main views stay simple:

| View | What belongs there |
| --- | --- |
| **My Day** | Tasks chosen for today. The list resets with the calendar day. |
| **Important** | Anything you star. |
| **Planned** | Tasks with a due date or reminder. |
| **All tasks** | Tasks created there, plus tasks promoted to My Day, Important, or Planned. |
| **Your lists** | Separate spaces for work, home, reading, or whatever else you keep around. |

Tasks from a regular list stay in that list unless you add them to a smart view. If an unfinished My Day task slips past midnight, it stays visible in All tasks with a small `Yesterday` or `Missed My Day` label.

Open a task to work with the useful details:

- Steps
- Add to My Day
- Reminder
- Due date
- Repeat
- Notes

Dates use the Persian Jalali calendar with English month and weekday names and Western digits. The detail panel sits beside the list on desktop and becomes a comfortable full-screen sheet on mobile.

## A few useful details

- Installable PWA with proper icons, manifest, and offline app shell
- Web Push reminders on Android and supported desktop browsers
- Notifications open the task they belong to
- Repeating tasks create their next occurrence when completed
- Responsive layout for phones, tablets, and desktops
- MySQL transactions and connection pooling
- Per-task sync instead of replacing the complete database
- Deletion tombstones, so an offline device cannot bring deleted tasks back
- Signed, HTTP-only browser sessions
- Offline-first CLI cache with safe two-way sync

## Run it

You need Node.js 20.19+ and MySQL 8+ or a recent compatible MariaDB.

Clone the repository, then create or update the database:

```bash
git clone https://github.com/mohammadsdg/Ledger.git
cd Ledger
mysql -u root -p < schema.sql
```

`schema.sql` works for both a new installation and an existing Ledger database. It checks the current structure and only adds what is missing.

Set up the server:

```bash
cd server
npm ci
cp .env.example .env
```

Open `.env` and set at least these values:

```dotenv
APP_PASSWORD=choose-a-long-password
SESSION_SECRET=choose-a-different-long-random-value

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=ledger
DB_PASSWORD=your-database-password
DB_NAME=ledger
```

Then start it:

```bash
npm start
```

Open `http://localhost:4000` and sign in with `APP_PASSWORD`.

## A database user for Ledger

Running the app with a dedicated MySQL user is better than using root:

```sql
CREATE USER 'ledger'@'localhost' IDENTIFIED BY 'use-a-strong-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.* TO 'ledger'@'localhost';
FLUSH PRIVILEGES;
```

## Phone install and reminders

Put Ledger behind HTTPS, open it in your phone browser, and choose **Install app** or **Add to Home Screen**. Android and supported desktop browsers can receive reminders even when the Ledger window is closed.

On the first reminder, Ledger asks for notification permission and registers that device. Notification keys are generated automatically and kept in the MySQL `app_settings` table, so they survive restarts. The Node server needs to stay running to deliver reminders.

The installed Android app keeps its most recent data locally. You can add, edit, complete, and delete tasks or steps without a connection; Ledger shows an offline status and merges those changes with the server automatically when connectivity returns. In the main task view, swipe right to open navigation.

If you prefer to manage Web Push keys yourself, set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the environment.

## CLI

The complete command reference, setup options, matching rules, offline behavior, and troubleshooting notes are in the [CLI usage guide](cli/README.md). Run `todo --help` for the same quick reference in your terminal.

The CLI keeps its local cache in `~/.todo-cli/cache.json`, so capturing and editing tasks does not depend on a network connection. It has no separate `.env` file; set its connection variables in your shell environment.

```bash
cd cli
npm link

export TODO_API_URL=https://tasks.example.com/api
export TODO_PASSWORD='the-same-value-as-APP_PASSWORD'
```

Some everyday commands:

```bash
todo add "buy milk"
todo add "call dentist" -today
todo add "The Left Hand of Darkness" -list "Reading"

todo
todo list all
todo list reading

todo done 1
todo today call dentist
todo rm buy milk

todo push
todo fetch
```

Both `push` and `fetch` perform a two-way merge. Changes to unrelated tasks are preserved. If two devices edit the same task while offline, the newest version of that task wins.

## Self-hosting

Ledger listens on port `4000` by default. In production, run it with systemd, PM2, Docker, or the process manager you already use, then place a reverse proxy in front of it. Build the web app after each update, before restarting the server. For PM2:

```bash
cd server
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 logs ledger
curl http://127.0.0.1:4000/healthz
```

On later updates, run `npm ci && npm run build && pm2 reload ecosystem.config.cjs --update-env`. PM2 timestamps the logs, restarts a crashed process with a short delay, and gives it time to close connections on shutdown. The health endpoint checks the database connection and returns HTTP 503 when it is unavailable.

Use `pm2 status ledger` to check the process and `pm2 logs ledger --lines 100` to inspect startup, reminder, and server errors. PM2 keeps the log files under its own log directory; set up rotation with your normal host maintenance policy.

A small Nginx configuration is enough:

```nginx
server {
    listen 80;
    server_name tasks.example.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable HTTPS before using the PWA or notifications, and set `NODE_ENV=production` so login cookies are marked secure.

## Project shape

```text
Ledger/
├── schema.sql          MySQL schema and in-place upgrades
├── server/
│   ├── server.js       API, authentication, sync, and reminders
│   ├── db.js           MySQL connection and state loading
│   └── web/            React + MUI web app
└── cli/                Offline-first terminal client
```

There is no hosted account or third-party task database involved. It is your server, your password, and your data.
