# logging-service

Centralized **logs + metrics** for Docker microservices — **Loki**, **Prometheus**, **Grafana Alloy**, and **Grafana**, ready to run with a single `docker compose up`.

Alloy tails container logs through the Docker socket, collects container metrics via its built-in cAdvisor exporter, and pushes logs to Loki and metrics to Prometheus. Grafana ships with a pre-provisioned **Docker Operations** dashboard (logs + metrics).

---

## How it works

```
Docker containers (stdout + cgroups)
        │
        ├──────────────────────────────┐
        ▼                              ▼
  Grafana Alloy                   (cAdvisor exporter inside Alloy)
  (logs + metrics via docker.sock)
        │                              │
        ▼                              ▼
  Loki                            Prometheus
  (7-day retention)               (7-day retention)
        │                              │
        └──────────────┬───────────────┘
                       ▼
                  Grafana
            (logs + metrics dashboard)
```

**Important:** your application services do **not** talk to Loki directly. They only need to write logs to stdout. Alloy picks them up from the Docker daemon on the same host.

---

## Quick start

**Requirements:** Docker Engine 24+ and Docker Compose v2

```bash
cd observability

cp .env.example .env
# optional: set LOKI_HOST to identify this machine in Grafana

docker compose up -d
```

| Service | URL | Default credentials |
|---|---|---|
| Grafana | http://localhost:3000 | `admin` / `admin` |
| Loki API | http://localhost:3100 | — |
| Prometheus | http://localhost:9090 | — |
| Alloy UI | http://localhost:12345 | — |

Open Grafana → folder **Logging** → dashboard **Docker Operations**.

---

## Which containers are collected?

Alloy is configured to tail containers whose names match:

```
sih-service-*   →  e.g. sih-service-auth, sih-service-user
sih-gateway
```

This is defined in `observability/alloy/config.alloy`. Observability containers (`sih-loki`, `sih-alloy`, `sih-grafana`) are excluded automatically because they do not match the pattern.

To collect different containers, edit the regex in `config.alloy`:

```river
regex = "/(sih-service-.+|sih-gateway)"
```

Services **do not** need to join the `sih-observability` Docker network — Alloy reads logs through the socket.

---

## Environment variables

### Stack (`observability/.env`)

| Variable | Default | Description |
|---|---|---|
| `LOKI_HOST` | `local-dev` | Host label shown in the Grafana **Host** dropdown. Use a unique value per machine when running multiple collectors. |

### Application (`CustomLogger`)

The NestJS demo app in this repo uses `src/common/handler/custom.logger.ts`:

| Variable | Values | Effect |
|---|---|---|
| `LOG_FORMAT` | `json` / unset | JSON on stdout (recommended for Loki) / pretty colored console |
| `LOG_TO_FILE` | `true` / unset | Also append plain-text logs to `/var/log/app` |
| `SERVICE_NAME` | e.g. `auth` | Service name in JSON logs |
| `APP_ENV` | e.g. `development` | Environment field in JSON logs |
| `PORT` | `3000` | HTTP port for the demo app |

**Plain-text logs** (dev mode) look like:

```
[2026-07-28T12:00:00.000Z]  [LOG] [MyService] message here
```

Alloy parses `[LOG]`, `[WARN]`, `[ERROR]`, `[DEBUG]`, `[FATAL]` and maps them to Grafana levels (`info`, `warn`, `error`, …).

**JSON logs** (production-friendly):

```bash
LOG_FORMAT=json SERVICE_NAME=auth npm run start:dev
```

---

## Grafana dashboard

### Filters

| Dropdown | Loki label | Example |
|---|---|---|
| Job | `job` | `docker` |
| Host | `host` | `local-dev` |
| Container | `container` | `sih-service-auth` |
| Log Level | `level` | All, info, warn, error, debug, … |
| Search Text | — | Free-text filter on log lines |

### Stat panels (top row)

| Panel | What it shows |
|---|---|
| **Log Rate** | Average log lines per second over the last 5 minutes |
| **Lines in Range** | Total log lines in the selected time range |
| **Errors** | Count of logs with `level=error` or `level=critical` |
| **Warnings** | Count of logs with `level=warn` |

### Log stream

Live tail with level badges. Select **info** to see standard `[LOG]` application output. **error** only shows results when actual error-level logs exist.

### Container metrics (Alloy → Prometheus)

The **Container Metrics** section uses the same **Container** dropdown filter:

| Panel | Source | What it shows |
|---|---|---|
| CPU Usage | Alloy cAdvisor exporter | CPU % for selected container(s) |
| Memory | Alloy cAdvisor exporter | Working-set memory |
| Network In / Out | Alloy cAdvisor exporter | Receive / transmit throughput |
| CPU by Container | Alloy cAdvisor exporter | CPU % over time, one line per container |
| Memory by Container | Alloy cAdvisor exporter | Memory usage over time |

Metrics are collected from `sih-service-*` and `sih-gateway` containers only (same filter as Alloy logs).

---

## Verify the stack

```bash
# containers running
docker compose ps

# Alloy is shipping logs
docker logs sih-alloy 2>&1 | tail -20

# Loki received labels
curl -s http://localhost:3100/loki/api/v1/labels | jq .

# optional: run the NestJS demo app and generate logs
cd ..
npm install
npm run start:dev
curl http://localhost:3000/
```

---

## Project structure

```
logging-service/
├── observability/
│   ├── docker-compose.yaml              # Loki + Alloy + Prometheus + Grafana
│   ├── .env.example
│   ├── alloy/config.alloy               # logs pipeline + cAdvisor metrics export
│   ├── loki/loki-config.yaml            # retention (7d), ingestion limits
│   ├── prometheus/prometheus.yml        # Prometheus self-scrape + Alloy
│   └── grafana/provisioning/            # datasources + dashboard (auto-loaded)
└── src/
    └── common/handler/custom.logger.ts  # NestJS logger (JSON + pretty modes)
```

---

## Operations

### Restart after config changes

```bash
cd observability
docker compose restart alloy grafana prometheus
```

### Reset Alloy read position

If Alloy is stuck on old backlog after a config change:

```bash
docker compose down
docker volume rm observability_alloy-data   # volume name may vary — check with `docker volume ls`
docker compose up -d
```

### Multiple hosts

Run one stack per Docker host. Set a different `LOKI_HOST` in each `.env` file so the Grafana **Host** filter can distinguish them.

---

## Production checklist

- [ ] Change Grafana `admin` password in `docker-compose.yaml`
- [ ] Do not expose Loki port `3100` publicly (auth is disabled)
- [ ] Set `LOG_FORMAT=json` on application services
- [ ] Adjust retention in `loki/loki-config.yaml` if needed (`168h` = 7 days)
- [ ] Set a meaningful `LOKI_HOST` per environment (`staging`, `prod-api-1`, …)

---

## Stack versions

| Component | Image |
|---|---|
| Loki | `grafana/loki:3.7.0` |
| Alloy | `grafana/alloy:v1.18.0` |
| Prometheus | `prom/prometheus:v3.2.1` |
| Grafana | `grafana/grafana:13.1.0` |
