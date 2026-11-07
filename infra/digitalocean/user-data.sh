#!/bin/bash
# DigitalOcean "User data" for a new droplet: sets up Rowan HVAC on first boot.
# Fill in APP_DOMAIN (and ADMIN_EMAIL), paste into the droplet's User data box,
# then point the domain's A record at the droplet. Progress: /var/log/rowanhvac-setup.log
exec > >(tee -a /var/log/rowanhvac-setup.log) 2>&1
export HOME=/root
git clone -q https://github.com/Jamesrowan11/RowanHVAC.git /root/rowanhvac-setup
APP_DOMAIN='rowanhvac.example.com' ADMIN_EMAIL='' bash /root/rowanhvac-setup/infra/digitalocean/setup.sh
