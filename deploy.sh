#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${LEDGER_REPO_URL:-https://github.com/mohammadsdg/Ledger.git}"
INSTALL_DIR="${LEDGER_INSTALL_DIR:-/opt/ledger}"
SERVICE_NAME="ledger"
BOOTSTRAP="${LEDGER_BOOTSTRAP:-0}"

say() { printf '\nLedger · %s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }

# Supports: curl -fsSL https://raw.githubusercontent.com/mohammadsdg/Ledger/main/deploy.sh | sudo bash
if [[ ! -f "${BASH_SOURCE[0]}" || ! -f "$(dirname -- "${BASH_SOURCE[0]}")/schema.sql" ]]; then
  BOOTSTRAP=1
fi

if [[ "$BOOTSTRAP" == "1" ]]; then
  if [[ $EUID -eq 0 ]]; then
    RUN_USER="${SUDO_USER:-root}"
    USER_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
  else
    RUN_USER="$USER"
    USER_HOME="$HOME"
  fi
  INSTALL_DIR="${LEDGER_INSTALL_DIR:-/opt/ledger}"
  if [[ $EUID -ne 0 ]]; then INSTALL_DIR="${LEDGER_INSTALL_DIR:-$USER_HOME/ledger}"; fi
  require_command git
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone "$REPO_URL" "$INSTALL_DIR" || fail "Could not clone Ledger into $INSTALL_DIR"
  else
    git -C "$INSTALL_DIR" pull --ff-only
  fi
  [[ -r /dev/tty ]] || fail "Run the one-line installer from an interactive SSH terminal so it can show the setup menu."
  exec bash "$INSTALL_DIR/deploy.sh" menu </dev/tty
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
ENV_FILE="$SERVER_DIR/.env"

as_root() {
  if [[ $EUID -eq 0 ]]; then "$@"; else require_command sudo; sudo "$@"; fi
}

load_env() {
  [[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE. Run Install Ledger from the menu first."
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  [[ -n "${APP_PASSWORD:-}" ]] || fail "APP_PASSWORD is missing from server/.env."
}

health_check() {
  require_command curl
  local url="${LEDGER_HEALTH_URL:-http://127.0.0.1:${PORT:-4000}/healthz}"
  local attempt
  for attempt in {1..30}; do
    if curl --fail --silent "$url" >/dev/null; then say "Health check passed: $url"; return 0; fi
    sleep 1
  done
  fail "Health check did not pass after 30 seconds: $url"
}

write_service() {
  load_env
  local node_path service_file service_user
  node_path="$(command -v node)"
  service_user="${SUDO_USER:-$USER}"
  service_file="$(mktemp)"
  cat > "$service_file" <<UNIT
[Unit]
Description=Ledger self-hosted task manager
After=network-online.target mysql.service mariadb.service
Wants=network-online.target

[Service]
Type=simple
User=$service_user
WorkingDirectory=$ROOT_DIR/server
Environment=NODE_ENV=production
ExecStart=$node_path $ROOT_DIR/server/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
UNIT
  as_root install -m 0644 "$service_file" "/etc/systemd/system/${SERVICE_NAME}.service"
  rm -f "$service_file"
  as_root systemctl daemon-reload
  as_root systemctl enable "$SERVICE_NAME"
  as_root systemctl restart "$SERVICE_NAME"
}

install_prerequisites() {
  [[ -r /etc/os-release ]] || fail "Automatic installation supports Ubuntu and Debian servers."
  # shellcheck disable=SC1091
  source /etc/os-release
  [[ "${ID:-}" == "ubuntu" || "${ID:-}" == "debian" ]] || fail "Automatic installation supports Ubuntu and Debian. Install Node.js 20+, MySQL/MariaDB, git, and curl, then rerun this menu."
  say "Installing system packages"
  as_root apt-get update
  as_root apt-get install -y ca-certificates curl git gnupg openssl mysql-server
  say "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | as_root bash -
  as_root apt-get install -y nodejs
}

configure_environment() {
  [[ -f "$ENV_FILE" ]] && { say "Keeping existing $ENV_FILE"; return; }
  say "Configure Ledger"
  read -r -p "Database name [ledger]: " db_name; db_name="${db_name:-ledger}"
  read -r -p "Database user [ledger]: " db_user; db_user="${db_user:-ledger}"
  [[ "$db_name" =~ ^[A-Za-z0-9_]+$ ]] || fail "Database name may contain only letters, numbers, and underscores."
  [[ "$db_user" =~ ^[A-Za-z0-9_]+$ ]] || fail "Database username may contain only letters, numbers, and underscores."
  db_password="$(openssl rand -hex 32)"
  read -r -s -p "Choose a Ledger sign-in password (12+ letters, numbers, or . _ @ % + = ! -): " app_password; printf '\n'
  [[ -n "$app_password" ]] || fail "Ledger sign-in password cannot be empty."
  [[ ${#app_password} -ge 12 ]] || fail "Use at least 12 characters for the Ledger sign-in password."
  [[ "$app_password" =~ ^[A-Za-z0-9._@%+=!-]+$ ]] || fail "Use only letters, numbers, and the listed punctuation so the password is saved safely."
  local session_secret
  session_secret="$(openssl rand -hex 32)"
  umask 077
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=4000
APP_PASSWORD=$(printf '%q' "$app_password")
SESSION_SECRET=$session_secret
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=$(printf '%q' "$db_user")
DB_PASSWORD=$(printf '%q' "$db_password")
DB_NAME=$(printf '%q' "$db_name")
DB_POOL_SIZE=10
VAPID_SUBJECT=mailto:admin@example.com
ENV
  if [[ $EUID -eq 0 && -n "${SUDO_USER:-}" ]]; then chown "$SUDO_USER" "$ENV_FILE"; fi
  unset db_password app_password
  say "Creating the database and application user"
  local sql_tmp
  sql_tmp="$(mktemp)"
  chmod 600 "$sql_tmp"
  set -a; source "$ENV_FILE"; set +a
  local escaped_password="${DB_PASSWORD//\'/\'\'}"
  printf "CREATE DATABASE IF NOT EXISTS \`%s\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nCREATE USER IF NOT EXISTS '%s'@'127.0.0.1' IDENTIFIED BY '%s';\nALTER USER '%s'@'127.0.0.1' IDENTIFIED BY '%s';\nGRANT SELECT, INSERT, UPDATE, DELETE ON \`%s\`.* TO '%s'@'127.0.0.1';\nFLUSH PRIVILEGES;\n" "$DB_NAME" "$DB_USER" "$escaped_password" "$DB_USER" "$escaped_password" "$DB_NAME" "$DB_USER" > "$sql_tmp"
  as_root mysql < "$sql_tmp"
  rm -f "$sql_tmp"
}

apply_schema() {
  load_env
  local defaults_file
  defaults_file="$(mktemp)"; chmod 600 "$defaults_file"
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" > "$defaults_file"
  mysql --defaults-extra-file="$defaults_file" "$DB_NAME" < "$ROOT_DIR/schema.sql"
  rm -f "$defaults_file"
}

build_app() {
  require_command npm
  (cd "$SERVER_DIR" && npm ci && npm run build)
}

install_ledger() {
  [[ -f "$ENV_FILE" ]] || install_prerequisites
  configure_environment
  apply_schema
  build_app
  write_service
  health_check
  say "Install complete. Open http://SERVER-IP:4000 and sign in with your Ledger password. Configure HTTPS before enabling push notifications."
}

update_ledger() {
  load_env
  if [[ -d "$ROOT_DIR/.git" ]]; then git -C "$ROOT_DIR" pull --ff-only; fi
  build_app
  if systemctl list-unit-files "${SERVICE_NAME}.service" --no-legend 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then
    as_root systemctl restart "$SERVICE_NAME"
  elif command -v pm2 >/dev/null 2>&1 && pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
    pm2 reload "$ROOT_DIR/server/ecosystem.config.cjs" --update-env
  else
    write_service
  fi
  health_check
  say "Update complete."
}

service_action() {
  local action="$1"
  if systemctl list-unit-files "${SERVICE_NAME}.service" --no-legend 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then
    as_root systemctl "$action" "$SERVICE_NAME"
  elif command -v pm2 >/dev/null 2>&1; then
    case "$action" in restart) pm2 restart "$SERVICE_NAME";; stop) pm2 stop "$SERVICE_NAME";; start) pm2 start "$SERVICE_NAME";; esac
  else fail "Ledger service is not installed."; fi
}

show_status() {
  if systemctl list-unit-files "${SERVICE_NAME}.service" --no-legend 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then as_root systemctl status "$SERVICE_NAME" --no-pager; else require_command pm2; pm2 status "$SERVICE_NAME"; fi
  health_check
}

show_logs() {
  if systemctl list-unit-files "${SERVICE_NAME}.service" --no-legend 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then as_root journalctl -u "$SERVICE_NAME" -n 100 --no-pager; else require_command pm2; pm2 logs "$SERVICE_NAME" --lines 100; fi
}

backup_database() {
  load_env
  local backup_dir="$ROOT_DIR/backups" defaults_file backup_file
  mkdir -p "$backup_dir"
  backup_file="$backup_dir/ledger-$(date +%Y%m%d-%H%M%S).sql"
  defaults_file="$(mktemp)"; chmod 600 "$defaults_file"
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" > "$defaults_file"
  mysqldump --defaults-extra-file="$defaults_file" "$DB_NAME" > "$backup_file"
  rm -f "$defaults_file"; chmod 600 "$backup_file"
  say "Database backup created at $backup_file"
}

uninstall_service() {
  read -r -p "Remove the Ledger service only? Database and files will remain. [y/N] " confirm
  [[ "$confirm" == [yY] ]] || return
  as_root systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
  as_root rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  as_root systemctl daemon-reload
  say "Service removed. Your database and project files are kept."
}

menu() {
  while true; do
    printf '\n╭────────────────────────────────────╮\n│       Ledger server installer      │\n╰────────────────────────────────────╯\n'
    printf '  1) Install Ledger on this server\n'
    printf '  2) Update Ledger\n'
    printf '  3) Check service and health\n'
    printf '  4) Restart Ledger\n'
    printf '  5) Stop Ledger\n'
    printf '  6) View recent logs\n'
    printf '  7) Back up the database\n'
    printf '  8) Apply database schema upgrade\n'
    printf '  9) Remove service (keep data)\n'
    printf '  0) Exit\n'
    read -r -p 'Choose an option: ' choice
    case "$choice" in
      1) install_ledger ;;
      2) update_ledger ;;
      3) show_status ;;
      4) service_action restart ;;
      5) service_action stop ;;
      6) show_logs ;;
      7) backup_database ;;
      8) apply_schema; say "Schema upgrade complete." ;;
      9) uninstall_service ;;
      0) return 0 ;;
      *) printf 'Choose a number from 0 to 9.\n' ;;
    esac
  done
}

case "${1:-menu}" in
  menu) menu ;;
  install) install_ledger ;;
  update|deploy) update_ledger ;;
  status) show_status ;;
  restart) service_action restart ;;
  stop) service_action stop ;;
  logs) show_logs ;;
  backup) backup_database ;;
  schema) apply_schema ;;
  *) printf 'Usage: %s [menu|install|update|status|restart|stop|logs|backup|schema]\n' "$0" >&2; exit 2 ;;
esac
