# Déploiement APM sur Proxmox

Ce guide explique comment déployer l'API Proxy Manager (APM) sur une VM Proxmox (Debian/Ubuntu) avec Docker.

## Prérequis
- Une VM avec Docker et Docker Compose installés.
- Accès Git à ce dépôt.

## Instructions Rapides

1. **Cloner le dépôt sur votre VM Proxmox :**
```bash
git clone https://github.com/Crapoto94/API-Proxy-Manager.git
cd API-Proxy-Manager
```

2. **Lancer le script d'installation automatique :**
```bash
chmod +x setup_proxmox.sh
./setup_proxmox.sh
```

## Accès aux services
Une fois l'installation terminée, les services seront accessibles via l'adresse IP de votre VM :
- **Application APM** : `http://[IP_PROXMOX]:8000`
- **Portainer (Gestion Docker)** : `http://[IP_PROXMOX]:9000`
- **Backend API (Swagger)** : `http://[IP_PROXMOX]:8001/api-docs`

## Configuration Manuelle
Si vous souhaitez changer l'URL de l'API manuellement, éditez le fichier `.env` :
```bash
APM_API_URL=http://[VOTRE_IP]:8001
docker-compose up -d --build
```
