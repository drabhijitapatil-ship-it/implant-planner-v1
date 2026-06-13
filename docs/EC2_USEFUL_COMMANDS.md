# EC2 Useful Commands — api.implanr.com

## Service Management

```bash
# Status
sudo systemctl status implant-backend

# Start / Stop / Restart
sudo systemctl start implant-backend
sudo systemctl stop implant-backend
sudo systemctl restart implant-backend

# Live logs
sudo journalctl -u implant-backend -f

# Last 100 log lines
sudo journalctl -u implant-backend -n 100
```

---

## Code Update / Redeploy

```bash
cd /opt/implant-backend/repo

# Pull latest from phase1 branch
git pull origin phase1

# Restart backend
sudo systemctl restart implant-backend
```

---

## Nginx

```bash
# Test config
sudo nginx -t

# Reload after config change
sudo systemctl reload nginx

# Restart
sudo systemctl restart nginx

# Status
sudo systemctl status nginx
```

---

## SSL / Certbot

```bash
# Test auto-renewal (dry run)
sudo certbot renew --dry-run

# Force renew
sudo certbot renew

# View cert expiry
sudo certbot certificates
```

---

## Environment Variables

```bash
# Edit .env
nano /opt/implant-backend/repo/backend/.env

# After editing, restart backend
sudo systemctl restart implant-backend
```

---

## Python / Deps

```bash
# Activate venv
source /opt/implant-backend/repo/backend/venv/bin/activate

# Install new dependency
pip install <package>

# Sync requirements after pulling new code
pip install -r /opt/implant-backend/repo/backend/requirements.txt

# Deactivate
deactivate
```

---

## System

```bash
# Disk usage
df -h

# Memory
free -h

# CPU / process monitor
top

# Reboot
sudo reboot
```

---

## Quick Health Check

```bash
curl -I https://api.implanr.com
curl https://api.implanr.com/docs
```
