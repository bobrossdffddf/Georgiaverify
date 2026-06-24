// PM2 process file (alternative to Docker/systemd):  pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'gsrp-verify',
      script: 'src/index.js',
      node_args: '',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 4000,
      time: true,
    },
  ],
};
