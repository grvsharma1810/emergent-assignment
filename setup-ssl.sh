#!/bin/bash

# SSL Setup Script for Pulse Backend
# This script sets up Let's Encrypt SSL certificates using certbot standalone mode

set -e

echo "🔐 SSL Certificate Setup for Pulse Backend"
echo "==========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root or with sudo${NC}"
  exit 1
fi

# Check if domain is provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: Domain name required${NC}"
  echo ""
  echo "Usage: sudo ./setup-ssl.sh yourdomain.com your@email.com"
  echo ""
  echo "Example:"
  echo "  sudo ./setup-ssl.sh api.pulse.com admin@pulse.com"
  exit 1
fi

# Check if email is provided
if [ -z "$2" ]; then
  echo -e "${RED}Error: Email address required${NC}"
  echo ""
  echo "Usage: sudo ./setup-ssl.sh yourdomain.com your@email.com"
  exit 1
fi

DOMAIN=$1
EMAIL=$2

echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""

# Create required directories
echo "📁 Creating directories..."
mkdir -p nginx/conf.d
mkdir -p certbot/conf
mkdir -p certbot/www
echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Check if certificate already exists
if [ -d "certbot/conf/live/$DOMAIN" ]; then
  echo -e "${YELLOW}⚠️  Certificate already exists for $DOMAIN${NC}"
  read -p "Do you want to renew it? (y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping certificate renewal"
    exit 0
  fi
  RENEW_FLAG="--force-renewal"
else
  RENEW_FLAG=""
fi

# Stop nginx if running to free port 80
echo "🛑 Stopping nginx (if running) to free port 80..."
docker compose -f docker-compose.production.yml stop nginx 2>/dev/null || true
echo -e "${GREEN}✓ Port 80 is free${NC}"
echo ""

# Obtain SSL certificate using standalone mode
echo "📜 Obtaining SSL certificate from Let's Encrypt..."
echo "This may take a minute..."
echo ""

# Use docker run directly (not docker compose) to avoid entrypoint issues
docker run -it --rm \
  -v $(pwd)/certbot/conf:/etc/letsencrypt \
  -v $(pwd)/certbot/www:/var/www/certbot \
  -p 80:80 \
  certbot/certbot certonly \
  --standalone \
  --preferred-challenges http \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  $RENEW_FLAG \
  -d $DOMAIN

if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✓ SSL certificate obtained successfully!${NC}"
else
  echo ""
  echo -e "${RED}✗ Failed to obtain SSL certificate${NC}"
  echo ""
  echo "Common issues:"
  echo "1. Domain not pointing to this server"
  echo "2. Port 80 not accessible from internet"
  echo "3. Firewall blocking traffic"
  echo ""
  echo "Please check:"
  echo "  - DNS A record for $DOMAIN points to this server's IP"
  echo "  - Security group allows inbound traffic on port 80"
  echo "  - Run: nslookup $DOMAIN"
  exit 1
fi
echo ""

# Verify certificate files exist
echo "🔍 Verifying certificate files..."
if [ -f "certbot/conf/live/$DOMAIN/fullchain.pem" ] && [ -f "certbot/conf/live/$DOMAIN/privkey.pem" ]; then
  echo -e "${GREEN}✓ Certificate files found${NC}"
  ls -la certbot/conf/live/$DOMAIN/
else
  echo -e "${RED}✗ Certificate files not found!${NC}"
  exit 1
fi
echo ""

# Create HTTPS-enabled Nginx configuration
echo "📝 Creating HTTPS-enabled Nginx configuration..."
cat > nginx/conf.d/default.conf << EOF
# HTTP server - redirect to HTTPS
server {
    listen 80;
    server_name $DOMAIN;

    # Let's Encrypt validation
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Backend API proxy
    location / {
        # Handle preflight requests
        if (\$request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin "\$http_origin" always;
            add_header Access-Control-Allow-Credentials "true" always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
            add_header Access-Control-Max-Age 1728000;
            add_header Content-Type "text/plain charset=UTF-8";
            add_header Content-Length 0;
            return 204;
        }

        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Let's Encrypt validation (also available via HTTPS)
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}
EOF
echo -e "${GREEN}✓ Nginx configuration created${NC}"
echo ""

# Start nginx with SSL
echo "🚀 Starting Nginx with SSL configuration..."
docker compose -f docker-compose.production.yml up -d nginx
sleep 3
echo -e "${GREEN}✓ Nginx started${NC}"
echo ""

# Test SSL
echo "🧪 Testing SSL certificate..."
sleep 3
if curl -sSf https://$DOMAIN/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ SSL is working! API accessible via HTTPS${NC}"
else
  echo -e "${YELLOW}⚠️  Could not verify SSL (this might be OK if backend isn't started yet)${NC}"
fi
echo ""

# Certificate info
echo "📋 Certificate Information:"
echo "  Domain: $DOMAIN"
echo "  Location: ./certbot/conf/live/$DOMAIN/"
echo "  Valid for: 90 days"
echo "  Expires on: $(date -d "+90 days" +%Y-%m-%d 2>/dev/null || date -v+90d +%Y-%m-%d 2>/dev/null)"
echo "  Auto-renewal: Enabled (certbot container runs renewal checks twice daily)"
echo ""

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}🎉 SSL Setup Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Update your .env file with production values"
echo "  2. Run: docker compose -f docker-compose.production.yml up -d"
echo "  3. Your API will be available at: https://$DOMAIN"
echo ""
echo "Certificate will auto-renew before expiry."
