module.exports = {
  apps: [
    {
      name: "finprince-backend",
      script: "gunicorn",
      args: "--bind 127.0.0.1:8000 --workers 4 --timeout 300 backend.wsgi:application",
      cwd: "/home/ubuntu/finprince/backend",
      interpreter: "python3", // or point to your virtualenv like "/home/ubuntu/finprince/venv/bin/python"
      env: {
        DJANGO_SETTINGS_MODULE: "backend.settings",
        DJANGO_DEBUG: "False", // Ensure False in production
        CLUSTER_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "/var/log/pm2/finprince-backend-error.log",
      out_file: "/var/log/pm2/finprince-backend-out.log",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },
    // Optional: Add celery or any other worker processes here if needed
    // {
    //   name: "finprince-celery",
    //   script: "celery",
    //   args: "-A backend worker -l info",
    //   cwd: "/home/ubuntu/finprince/backend",
    //   interpreter: "python3",
    // }
  ]
};
