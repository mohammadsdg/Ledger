# Ledger

Ledger is a small, self-hosted todo app with a responsive web UI and an offline-first CLI. MySQL is the source of truth, access is protected by a shared password, and devices merge changes per task/list instead of replacing the entire database.

## Install

Requirements: Node.js 18+, MySQL 8+ (or a compatible recent MariaDB), and a reverse proxy for production.

Create the database exactly as requested:

```bash
mysql -u root -p < schema.sql
```

For production, create a restricted database user instead of running the app as root:

```sql
CREATE USER 'ledger'@'localhost' IDENTIFIED BY 'use-a-strong-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.* TO 'ledger'@'localhost';
FLUSH PRIVILEGES;
```

Install and start the server:

```bash
cd server
npm ci
cp .env.example .env
# edit .env
npm start
```

The server loads `server/.env` automatically and refuses to start without `APP_PASSWORD`. `SESSION_SECRET` should be a different long random value. Environment files are intentionally ignored by Git.

For a quick local run:

```bash
cd server
APP_PASSWORD=change-me DB_USER=root DB_PASSWORD='your-mysql-password' npm start
```

Open `http://localhost:4000` and enter `APP_PASSWORD`.

## CLI

The CLI stores an offline cache at `~/.todo-cli/cache.json`. Both `fetch` and `push` now perform a safe two-way merge. Edits to separate records are retained and deletion tombstones stop another offline device from bringing deleted tasks back.

```bash
cd cli
npm link

export TODO_API_URL=https://todo.mastiam.ir/api
export TODO_PASSWORD='the-same-value-as-APP_PASSWORD'

todo add "buy milk" -today
todo add "breaking bad" -list "Watch list"
todo done buy milk
todo list all
todo push
```

If multiple devices change the same task while offline, the most recently updated copy of that task wins. Unlike the old whole-database strategy, unrelated tasks and lists are never overwritten.

## Deploy at `todo.mastiam.ir`

Run the Node service on `127.0.0.1:4000` with systemd, PM2, or another process manager. A minimal Nginx site is:

```nginx
server {
    listen 80;
    server_name todo.mastiam.ir;

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

Enable HTTPS (for example with Certbot) before using the production site. Set `NODE_ENV=production` so the login cookie is HTTPS-only.

## API and sync behavior

- MySQL writes use a connection pool and transactions.
- Lists and tasks carry independent update timestamps.
- Deletions are retained as tombstones and participate in sync.
- List deletion is atomic and cascades to its tasks.
- Browser API access uses a signed, HTTP-only, same-site cookie.
- CLI access uses `Authorization: Bearer <TODO_PASSWORD>`.
- Login attempts are rate-limited in memory.

## Commands

```text
todo                         show Today
todo add <task>              add to Inbox
todo add <task> -today       add and mark Today
todo add <task> -list <name> add to a list
todo list [today|all|name]   show tasks
todo lists                   show lists and counts
todo done|undone <task>      update completion
todo today <task>            toggle Today
todo rm <task>               delete and record a tombstone
todo fetch / todo push       merge with the server
todo menu                    interactive mode
```
