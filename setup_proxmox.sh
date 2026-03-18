#!/bin/bash

# Script d'installation automatique pour Proxmox (VM Debian/Ubuntu avec Docker)
# APM - API Proxy Manager

echo "--- Installation APM sur Proxmox ---"

# 1. Vérification de Docker
if ! [ -x "$(command -v docker)" ]; then
  echo "Installation de Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
fi

if ! [ -x "$(command -v docker-compose)" ]; then
  echo "Installation de Docker Compose..."
  sudo apt-get update
  sudo apt-get install -y docker-compose
fi

# Nettoyage si un ancien conteneur nommé 'portainer' bloque (optionnel mais conseillé)
# Si vous avez déjà un portainer, démentez cette ligne ou changez le port dans docker-compose.yml
# docker rm -f portainer 2>/dev/null

# 2. Récupération de l'adresse IP pour la configuration Frontend
IP_ADDR=$(hostname -I | awk '{print $1}')
echo "Adresse IP détectée : $IP_ADDR"

# 3. Création du fichier .env pour Docker Compose
echo "APM_API_URL=http://$IP_ADDR:8001" > .env

# 4. Lancement de Docker Compose
echo "Lancement des conteneurs (Backend, Frontend, Portainer)..."
docker-compose up -d --build

echo ""
echo "--- Installation Terminée ---"
echo "Accès Application : http://$IP_ADDR:8000"
echo "Accès Portainer   : http://$IP_ADDR:9000"
echo "API (Swagger)    : http://$IP_ADDR:8001/api-docs"
