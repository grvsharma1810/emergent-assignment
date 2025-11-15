#!/bin/bash

# Temporary HTTP-only Deployment Script
# Use this while DNS is being set up
# Once DNS is ready, use the full deployment with SSL

set -e

echo "🚀 Pulse Backend Deployment (HTTP Only)"
echo "========================================="
echo ""
echo "⚠️  WARNING: This deployment uses HTTP only (no SSL)"
echo "    Use this temporarily while waiting for DNS propagation"
echo "    Once DNS is ready, run: sudo ./setup-ssl.sh domain email"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo -e "${RED}Error: .env file not found!${NC}"
  echo ""
  echo "Please create a .env file with your configuration."
  echo "You can use .env.production.example as a template:"
  echo "  cp .env.production.example .env"
  echo ""
  exit 1
fi

echo "📦 Building Docker images..."
docker compose -f docker-compose.production.yml build

echo ""
echo "🛑 Stopping existing containers (if any)..."
docker compose -f docker-compose.production.yml down

echo ""
echo "🚀 Starting services (without certbot, HTTP only)..."
docker compose -f docker-compose.production.yml up -d postgres backend nginx

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check if backend is healthy
echo "🔍 Checking backend health..."
for i in {1..30}; do
  if docker compose -f docker-compose.production.yml exec -T backend wget -q -O- http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is healthy!${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}✗ Backend health check failed${NC}"
    echo ""
    echo "Viewing backend logs:"
    docker compose -f docker-compose.production.yml logs backend --tail=50
    exit 1
  fi
  echo -n "."
  sleep 2
done

echo ""
echo "📊 Service Status:"
docker compose -f docker-compose.production.yml ps

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}🎉 HTTP Deployment Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# Get server IP
SERVER_IP=$(curl -s ifconfig.me || echo "your-server-ip")

echo "Your API is now running!"
echo ""
echo "📍 Access via:"
echo "  HTTP: http://$SERVER_IP"
echo "  Health: http://$SERVER_IP/health"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: This is HTTP only (not secure)${NC}"
echo ""
echo "Next steps:"
echo "  1. Configure DNS A record for your domain"
echo "  2. Wait for DNS to propagate (5-30 minutes)"
echo "  3. Verify: nslookup emergent-api.gauravkr.com"
echo "  4. Setup SSL: sudo ./setup-ssl.sh emergent-api.gauravkr.com your@email.com"
echo "  5. Redeploy with SSL: ./deploy-production.sh"
echo ""
echo "📝 Useful commands:"
echo "  View logs:     docker compose -f docker-compose.production.yml logs -f"
echo "  Stop services: docker compose -f docker-compose.production.yml down"
echo "  Restart:       docker compose -f docker-compose.production.yml restart"
echo ""
