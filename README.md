# logging-service — Central Observability Stack

Central **Loki + Alloy + Grafana** stack for collecting logs from multiple Docker services on the same host.

```
Service containers (stdout JSON)
  └─ Docker json-file driver
       └─ Alloy (docker.sock, label logging=loki)
            └─ Loki (7-day retention)
                 └─ Grafana — "Docker Loki Operations" dashboard
```

## Quick start

```bash
# 1. Configure host name (shown in Grafana "Host" dropdown)
cp .env.example .env
# edit LOKI_HOST=prod-backend  (or your machine name)

# 2. Start the stack
docker compose up -d

# 3. Optional: include demo NestJS app
docker compose --profile demo up -d --build

# 4. Open Grafana
open http://localhost:8000   # admin / admin
# Dashboard: Docker Loki Operations
```

## Connect your services

Alloy collects logs from **any container on this Docker host** that has the label `logging=loki`.  
Services do **not** need to talk to Loki directly.

Add to each service in your compose file:

```yaml
environment:
  LOG_FORMAT: json          # CustomLogger → JSON on stdout
  LOG_TO_FILE: "false"
  SERVICE_NAME: auth        # your service name
labels:
  logging: loki             # required
  service: auth             # optional extra label
logging:
  driver: json-file
  options:
    max-size: "50m"
    max-file: "3"
networks:
  - observability           # same network name as this stack (optional for shipping)
```

See `compose.example-service.yaml` for a full snippet.

### Shared network

This stack creates network `saman_log` by default (override with `DOCKER_NETWORK` in `.env`).

If your services already use another network (e.g. `ba_network`):

```bash
# .env
DOCKER_NETWORK=ba_network
```

Or declare the network as external in both composes.

## Grafana dashboard filters

| Dropdown | Loki label | Example |
|---|---|---|
| Job | `job` | `docker` |
| Host | `host` | `prod-backend` (from `LOKI_HOST`) |
| Container | `container` | `sih-service-auth` |
| Log Level | `level` | `info`, `warn`, `error` |
| Search Text | — | full-text search on `msg` |

## Verify

```bash
# Alloy discovered containers
docker logs sih-observability-alloy 2>&1 | tail -20

# Trigger demo logs
curl http://localhost:3000/
```

## Files

| Path | Purpose |
|---|---|
| `docker-compose.yaml` | Loki + Alloy + Grafana (+ optional demo app profile) |
| `observability/config.alloy` | Docker discovery, relabel, JSON parse, push |
| `observability/loki-config.yaml` | Loki single-binary, 7d retention |
| `observability/grafana/` | Datasource + dashboard provisioning |
| `compose.example-service.yaml` | How to wire another service |
| `src/common/handler/custom.logger.ts` | JSON / pretty logger used by NestJS apps |

## CustomLogger env vars

| Variable | Values | Effect |
|---|---|---|
| `LOG_FORMAT` | `json` / unset | JSON stdout / pretty console |
| `LOG_TO_FILE` | `true` / unset | append plain text to `/var/log/app` |
| `SERVICE_NAME` | e.g. `auth` | `service` field in JSON |
| `APP_ENV` | e.g. `development` | `environment` field in JSON |

## Multiple hosts

Run one observability stack **per Docker host**. Set a unique `LOKI_HOST` on each machine so the Grafana Host dropdown distinguishes them.
