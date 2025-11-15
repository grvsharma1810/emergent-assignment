#!/bin/bash

# Production Deployment Script for Pulse Backend
# This script deploys the backend API with SSL support

set -e

echo "🚀 Pulse Backend Deployment"
echo "============================"
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

# Check if SSL certificates exist
if [ ! -d "certbot/conf/live" ] || [ -z "$(ls -A certbot/conf/live 2>/dev/null)" ]; then
  echo -e "${YELLOW}⚠️  SSL certificates not found!${NC}"
  echo ""
  echo "Please run the SSL setup script first:"
  echo "  sudo ./setup-ssl.sh yourdomain.com your@email.com"
  echo ""
  echo "Or to deploy without SSL (HTTP only), edit docker-compose.production.yml"
  echo "and remove the SSL-related nginx configuration."
  echo ""
  read -p "Continue anyway? (y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "📦 Building Docker images..."
docker compose -f docker-compose.production.yml build

echo ""
echo "🛑 Stopping existing containers (if any)..."
docker compose -f docker-compose.production.yml down

echo ""
echo "🚀 Starting services..."
docker compose -f docker-compose.production.yml up -d

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
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# Get domain from nginx config if available
DOMAIN=$(grep -oP 'server_name \K[^;]+' nginx/conf.d/default.conf 2>/dev/null | head -1 || echo "your-domain.com")

echo "Your API is now running!"
echo ""
echo "📍 Endpoints:"
if [ -d "certbot/conf/live" ] && [ -n "$(ls -A certbot/conf/live 2>/dev/null)" ]; then
  echo "  HTTPS: https://$DOMAIN"
  echo "  Health: https://$DOMAIN/health"
else
  echo "  HTTP: http://$DOMAIN"
  echo "  Health: http://$DOMAIN/health"
fi
echo ""
echo "📝 Useful commands:"
echo "  View logs:     docker compose -f docker-compose.production.yml logs -f"
echo "  Stop services: docker compose -f docker-compose.production.yml down"
echo "  Restart:       docker compose -f docker-compose.production.yml restart"
echo "  Backend logs:  docker compose -f docker-compose.production.yml logs backend -f"
echo ""
