module.exports = {
  apps: [{
    name: "ledger",
    cwd: __dirname,
    script: "server.js",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    min_uptime: "10s",
    restart_delay: 5000,
    max_memory_restart: "350M",
    kill_timeout: 10000,
    time: true,
    env: { NODE_ENV: "production" },
  }],
};
