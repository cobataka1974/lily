module.exports = {
  apps: [{
    name: 'lily',
    script: 'server.js',
    cwd: '/home/work/.openclaw/workspace/lily-app',
    env: {
      PORT: 3001,
      NODE_ENV: 'production'
    },
    log_file: '/home/work/.pm2/logs/lily-combined.log',
    error_file: '/home/work/.pm2/logs/lily-error.log',
    out_file: '/home/work/.pm2/logs/lily-out.log',
    restart_delay: 3000,
    max_restarts: 10
  }]
};
