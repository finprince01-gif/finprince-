# Finprince AWS EC2 Deployment Guide

These files provide an automated way to deploy the Finprince application onto a new Ubuntu AWS EC2 instance.

## Prerequisites
1. **EC2 Instance**: Launch an Ubuntu 22.04 or 24.04 instance (e.g., `g4dn.xlarge` if GPU is needed).
2. **Security Groups**: Ensure your EC2 Security Group allows inbound traffic on:
   - Port 22 (SSH)
   - Port 80 (HTTP)
   - Port 443 (HTTPS - optional but recommended)
3. **Database**: If you're not using AWS RDS, you'll need to install and configure MySQL manually on the EC2 instance or adjust the script to do so.
4. **Codebase**: Your code should be cloned into `/home/ubuntu/finprince`.

## How to Deploy

1. **Upload your code** to the server (e.g. via `git clone`). Ensure this `deploy/` directory is present.
2. **Make the script executable**:
   ```bash
   chmod +x deploy/setup_ec2.sh
   ```
3. **Run the script**:
   ```bash
   ./deploy/setup_ec2.sh
   ```
4. **Update Environment Variables**:
   Copy `.env.example` to `.env` in both `frontend` and `backend` directories and update them with production credentials (database password, AWS keys, etc.).
   *Note: PM2 must be restarted if you change backend `.env` variables:*
   ```bash
   pm2 restart finprince-backend
   ```

## Managing the Application

- **View Logs (Backend)**: 
  `pm2 logs finprince-backend`
- **Restart Backend**: 
  `pm2 restart finprince-backend`
- **Restart Nginx**: 
  `sudo systemctl restart nginx`

## SSL Configuration (Optional but highly recommended)
To enable HTTPS, use Let's Encrypt / Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```
