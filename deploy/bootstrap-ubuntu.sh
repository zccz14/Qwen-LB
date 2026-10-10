#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes ca-certificates certbot curl nginx python3-certbot-nginx

id qwen-lb >/dev/null 2>&1 || useradd \
  --system \
  --home-dir /var/lib/qwen-lb \
  --shell /usr/sbin/nologin \
  qwen-lb

install -d -m 0755 /opt/qwen-lb/releases
install -d -o qwen-lb -g qwen-lb -m 0700 /var/lib/qwen-lb

install -m 0644 /dev/stdin /etc/systemd/system/qwen-lb.service <<'UNIT'
[Unit]
Description=Qwen-LB
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=qwen-lb
Group=qwen-lb
Environment=HOME=/var/lib/qwen-lb
WorkingDirectory=/var/lib/qwen-lb
ExecStart=/opt/qwen-lb/current/qwen-lb
Restart=on-failure
RestartSec=5s
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
ReadWritePaths=/var/lib/qwen-lb

[Install]
WantedBy=multi-user.target
UNIT

install -m 0644 /dev/stdin /etc/nginx/sites-available/qwen-lb <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name qwen.ntnl.io;

    client_max_body_size 512m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

ln -sfn /etc/nginx/sites-available/qwen-lb /etc/nginx/sites-enabled/qwen-lb
rm -f /etc/nginx/sites-enabled/default
systemctl daemon-reload
systemctl enable qwen-lb.service
nginx -t
systemctl restart nginx
