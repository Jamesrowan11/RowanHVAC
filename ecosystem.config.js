// PM2 process manager config for the Rowan HVAC portal (Node app).
// Keeps the portal running and restarts it on crash/reboot.
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   (to survive reboots)
module.exports = {
  apps: [
    {
      name: "rowanhvac-portal",
      script: "server.js",
      cwd: "/var/www/rowanhvac-app",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
