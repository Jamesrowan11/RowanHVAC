// PM2 process manager config for Rowan HVAC (website + portal + van API).
// Keeps the app running and restarts it on crash/reboot.
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   (to survive reboots)
//
// Cluster mode with 2 processes: `pm2 reload` restarts them one at a time, so
// the droplet keeps answering the load balancer during an update.
module.exports = {
  apps: [
    {
      name: "rowanhvac-portal",
      script: "server.js",
      cwd: "/var/www/rowanhvac-app",
      instances: Number(process.env.WEB_CONCURRENCY || 2),
      exec_mode: "cluster",
      autorestart: true,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOST: "127.0.0.1", // only nginx (on this server) talks to the app
      },
    },
  ],
};
