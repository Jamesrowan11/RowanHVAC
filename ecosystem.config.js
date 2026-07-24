/** PM2 config — alternative to Plesk's Node.js extension. `pm2 start ecosystem.config.js` */
module.exports = {
  apps: [
    {
      name: "rowanhvac",
      script: "server.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
