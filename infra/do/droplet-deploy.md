# DigitalOcean Droplet Deployment

Phase 8 target: deploy SalarySafe on a single Docker-enabled Ubuntu droplet.

## 1. Provision droplet

1. Create Ubuntu 24.04 droplet (2 vCPU minimum recommended).
2. Open inbound ports:
- 22 (SSH)
- 80 (HTTP)
- 443 (HTTPS, if TLS is later configured)

## 2. Install Docker and Compose plugin

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
	"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
	$(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in after adding the user to the docker group.

## 3. Deploy app

```bash
git clone <your-repo-url> salarysafe
cd salarysafe
cp .env.example .env
docker compose up -d --build
```

Before first production-like run, update `.env` with:

- `JWT_SECRET` (strong secret)
- `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD`
- `LLM_PROVIDER` and corresponding provider credentials

Provider requirements:

- OpenAI:
	- `LLM_PROVIDER=openai`
	- `OPENAI_API_KEY`
	- optional `OPENAI_MODEL`
- Azure OpenAI:
	- `LLM_PROVIDER=azure_openai`
	- `AZURE_OPENAI_API_KEY`
	- `AZURE_OPENAI_ENDPOINT`
	- `AZURE_OPENAI_API_VERSION`
	- `AZURE_OPENAI_DEPLOYMENT_NAME`

## 4. Verify services

```bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 nginx
```

Expected endpoints:
- `http://<droplet-ip>/`
- `http://<droplet-ip>/api/health`

## 5. Seed baseline data

```bash
docker compose exec backend python -m app.scripts.seed_data
```

## 6. Smoke-check script (from local or droplet)

PowerShell:

```powershell
./infra/scripts/smoke_check.ps1 -BaseUrl "http://<droplet-ip>"
```

## 7. Operational commands

```bash
docker compose pull
docker compose up -d --build
docker compose logs -f
docker compose down
docker compose down -v
docker image prune -f
```

## 8. Known limits for PoC

- Single-node deployment (app and database on same host)
- No TLS automation included yet
- No managed backups included yet
