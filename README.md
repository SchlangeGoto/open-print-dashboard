<div align="center">

<img src="https://img.shields.io/badge/version-0.1.0-blue?style=flat-square" />
<img src="https://img.shields.io/badge/license-GNU%20AGPLv3-green?style=flat-square" />
<img src="https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" />

<br> <br>

```
        ██████╗ ██████╗ ███████╗███╗   ██╗    ██████╗ ██████╗ ██╗███╗   ██╗████████╗
         ██╔═══██╗██╔══██╗██╔════╝████╗  ██║    ██╔══██╗██╔══██╗██║████╗  ██║╚══██╔══╝
         ██║   ██║██████╔╝█████╗  ██╔██╗ ██║    ██████╔╝██████╔╝██║██╔██╗ ██║   ██║
         ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║    ██╔═══╝ ██╔══██╗██║██║╚██╗██║   ██║
         ╚██████╔╝██║     ███████╗██║ ╚████║    ██║      ██║  ██║██║██║ ╚████║   ██║
          ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝   ╚═╝      ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝

     ██████╗  █████╗ ███████╗██╗  ██╗
     ██╔══██╗██╔══██╗██╔════╝██║  ██║
     ██║  ██║███████║███████╗███████║
     ██║  ██║██╔══██║╚════██║██╔══██║
     ██████╔╝██║  ██║███████║██║  ██║
      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝

```

### Your 3D printer, fully visible. No cloud required.

**OpenPrintDashboard** is a beautiful, self-hosted dashboard for Bambu Lab 3D printers.
Live status, filament inventory, print history, cost tracking — all in one place, all yours.

<br />

[🚀 Quick Start](#-quick-start) · [✨ Features](#-features) · [⚙️ Configuration](#%EF%B8%8F-configuration) · [🛠️ Development](#️-development)

<br />

</div>

---

## ✨ Features

### 🖨️ Live Printer Status
Real-time data streamed directly from your printer over your local network via MQTT — no polling, no lag.
- Nozzle & bed temperature (current + target)
- Print progress bar, layer count, and time remaining
- Cooling fan speed and print speed level
- Online / offline detection
- Auto-reconnects after network blips

### 📊 Print History & Analytics
Every print is automatically captured and logged when it completes.
- Full print timeline with title, duration, weight used
- Status tracking: Finished / Canceled / Running
- Success rate statistics
- Cover image thumbnails from Bambu Cloud
- Delete individual records to clean up your history

### 🎨 Filament Library
Build a catalogue of every filament type you own, with all the details that matter.
- Brand, material type, and color (with visual color swatch)
- Nozzle and bed temperature profiles
- Bambu AMS info index for automatic slot mapping
- Remaining stock aggregated across all spools
- Average price per kg, calculated from real purchase data

### 🧵 Spool Inventory
Track individual spools from purchase to empty.
- Remaining weight with a color-coded progress bar
- Mark a spool as active (currently loaded in the printer)
- NFC tag support — scan a tag to instantly activate a spool
- Price per kg for per-print cost calculations
- Usage automatically deducted after every print

---

**Stack at a glance:**

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js · React · TypeScript · Tailwind CSS · shadcn/ui |
| Backend | FastAPI · Python 3.13 · SQLModel · Pydantic · Alembic |
| Database | PostgreSQL 16 |
| Protocol | MQTT (local LAN, TLS) · Bambu Cloud REST API |
| Email | SMTP (Mailpit in local development) |
| Deployment | Docker · Docker Compose |

The backend structure follows the [full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template):
`app/api/routes`, `app/core`, `app/models.py`, `app/crud.py`, managed with `uv` and Alembic migrations.

---

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed
  (with BuildKit — included in current Docker Engine and Docker Desktop; the image builds use BuildKit cache mounts)
- Your Bambu Lab printer on the same local network
- Your printer's **IP address**, **serial number**, and **access code** (see [finding these values](#finding-printer-credentials))

### 1. Clone the repository

```bash
git clone https://github.com/your-username/OpenPrintDashboard.git
cd OpenPrintDashboard
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Open `.env` and, at minimum, set a `SECRET_KEY`:

```bash
openssl rand -hex 32   # copy the output into SECRET_KEY
```

### 3. Start the stack

```bash
docker compose up -d --build
```

Docker will start PostgreSQL, the FastAPI backend, the Next.js frontend, and Mailpit
(a local email catcher used to preview emails sent by the app).

### 4. Run the setup wizard

Open **http://localhost:3000** in your browser.

You'll be guided through:
<br><br>

```
Step 1: Create Account  →  Step 2: Bambu Lab Login  →  Step 3: Printer Setup
    (local admin)            (cloud sync + history)       (LAN connection)
```

If Mailpit is running, the new-account email is captured at **http://localhost:8025**.

> **Note:** After completing the printer setup the backend reconnects to your printer via MQTT.
> First data usually arrives within a few seconds.

---

## ⚙️ Configuration

### Finding Printer Credentials

| Value | Where to find it |
|-------|-----------------|
| **IP Address** | Printer touchscreen → **Settings** → **Network** → **IP Address** — or check your router's DHCP client list |
| **Serial Number** | Printer touchscreen → **Settings** → **Device** → **Serial Number** — also on the sticker on the back of the machine |
| **Access Code** | Printer touchscreen → **Settings** → **Network** → **Access Code** — requires LAN mode to be enabled |

📖 Official guide: [Bambu Lab Wiki — Finding Serial Number](https://wiki.bambulab.com/en/general/find-sn)

### Docker Compose Services

The default `compose.yml` exposes:

| Service | Port | Description |
|---------|------|-------------|
| `frontend` | `3000` | Next.js frontend |
| `backend` | `8000` | FastAPI backend + Swagger UI at `/docs` |
| `db` | `5432` | PostgreSQL |
| `mailpit` | `8025` | Mailpit web UI (SMTP on `11025`) |

To run on a different port, edit `compose.yml`:

```yaml
services:
  frontend:
    ports:
      - "8080:3000"   # Change 8080 to whatever you want
```

---

## 🔄 Updating

```bash
git pull
docker compose down
docker compose up -d --build
```

Your database data is persisted in the Docker volume `postgres_data` and survives updates.

---

## 🛠️ Development

See [development.md](./development.md) for running the backend and frontend locally
without Docker, running migrations, tests, and linting.

### Project Structure

```
OpenPrintDashboard/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py         # Shared dependencies (DB session, current user)
│   │   │   ├── main.py         # API router
│   │   │   └── routes/         # login, users, filaments, spools, prints, ...
│   │   ├── core/               # Config, database engine, security, encryption
│   │   ├── services/           # BambuClient (MQTT), BambuCloudClient, PrinterService
│   │   ├── alembic/            # Database migrations
│   │   ├── models.py           # SQLModel models
│   │   ├── crud.py             # Database access helpers
│   │   ├── utils.py            # Email helpers
│   │   └── main.py             # FastAPI application
│   ├── scripts/                # prestart, start, lint, format, test
│   ├── tests/                  # Pytest suite
│   └── pyproject.toml
├── frontend/                   # Next.js frontend
│   ├── app/                    # Routes (dashboard, setup, login, recovery)
│   ├── components/
│   │   ├── layout/             # Sidebar shell, auth layout, user menu
│   │   ├── modals/             # Dialog-based detail/edit modals
│   │   └── ui/                 # shadcn/ui components (+ project helpers)
│   └── lib/                    # API client and auth context
├── .github/workflows/          # CI (backend + frontend)
├── compose.yml
└── .env.example
```

---

## 🤝 Contributing

Contributions are very welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Open a pull request with a clear description

---

## 📄 License

GNU AGPLv3 — See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- MQTT commands adapted from [ha-bambulab](https://github.com/greghesp/ha-bambulab) by greghesp
- Built on top of the unofficial Bambu Lab cloud and MQTT APIs
- Backend structure inspired by the [full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template)

<div align="center">

Made with ❤️ for the 3D printing community

⭐ **Star this repo** if it's useful to you — it helps others find it!

</div>
