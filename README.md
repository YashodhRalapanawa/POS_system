# POS System (Point of Sale)

A modern Point-of-Sale (POS) system designed for managing billing, inventory, products, payments, receipts, and sales reports.

---

## 📑 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start with Docker (Recommended)](#quick-start-with-docker-recommended)
  - [Docker Compose Watch](#docker-compose-watch)
  - [Service Endpoints](#service-endpoints)
- [Local Development (Without Docker)](#local-development-without-docker)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Environment Configuration](#environment-configuration)
- [Production Builds](#production-builds)
- [Key Features & Roadmap](#key-features--roadmap)
- [License](#license)

---

## 📌 Overview

The **POS System** is a full-stack web application designed to streamline daily retail and counter checkout workflows. It combines a fast, responsive user interface with an Express backend integrated with Supabase for data persistence.

---

## 🛠 Tech Stack

### Frontend
- **Framework:** [React 19](https://react.dev/)
- **Bundler & Dev Server:** [Vite](https://vite.dev/)
- **Styling:** CSS3 (Modern responsive styling)
- **Production Server:** [Nginx](https://nginx.org/) (Alpine)

### Backend
- **Runtime:** [Node.js](https://nodejs.org/) (v22 / v20+)
- **Framework:** [Express 5](https://expressjs.com/)
- **Database / Backend as a Service:** [Supabase](https://supabase.com/) (`@supabase/supabase-js`)
- **Utilities:** `cors`, `dotenv`

### Containerization & DevOps
- **Docker:** Multi-stage builds for production (`Dockerfile`) and development containers (`Dockerfile.dev`)
- **Docker Compose:** Multi-service orchestration with Compose Watch file synchronization

---

## 📂 Project Structure

```text
POS_system/
├── Backend/
│   ├── src/
│   │   └── server.js            # Express application entrypoint and healthcheck
│   ├── .dockerignore
│   ├── Dockerfile.dev           # Development container configuration
│   ├── package.json             # Backend dependencies and scripts
│   └── package-lock.json
├── Frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/              # Icons and images
│   │   ├── App.css              # Main view styling
│   │   ├── App.jsx              # Core React component
│   │   ├── index.css            # Base stylesheet
│   │   └── main.jsx             # React DOM mounting
│   ├── .dockerignore
│   ├── Dockerfile               # Production multi-stage build (Node -> Nginx)
│   ├── Dockerfile.dev           # Development container configuration
│   ├── index.html               # SPA HTML entry point
│   ├── nginx.conf               # Nginx routing configuration for SPA
│   ├── package.json             # Frontend dependencies and scripts
│   └── vite.config.js           # Vite build configuration
├── .gitignore
├── compose.yaml                 # Docker Compose with Compose Watch configuration
└── README.md
```

---

## ⚙️ Prerequisites

Ensure you have the following installed on your machine:

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/) (v2.22+ recommended for Compose Watch)
- *Optional (for running locally without Docker):* [Node.js](https://nodejs.org/) (v20+ or v22+) and `npm`

---

## 🚀 Quick Start with Docker (Recommended)

The easiest way to run the entire system (Frontend + Backend) with hot reloading is via Docker Compose:

```bash
docker compose up --watch
```

If you prefer running in detached mode:

```bash
docker compose up -d
```

To shut down services:

```bash
docker compose down
```

### 🔄 Docker Compose Watch

`compose.yaml` is preconfigured with Docker Compose Watch:
- **Code file changes:** Automatically synchronized live into running containers without full rebuilds.
- **Dependency changes (`package.json` / `package-lock.json`):** Triggers an automatic container image rebuild.

### 🌐 Service Endpoints

| Service | URL | Description |
| :--- | :--- | :--- |
| **Frontend** | [http://localhost:5173](http://localhost:5173) | Vite dev server |
| **Backend** | [http://localhost:3000](http://localhost:3000) | Express API |
| **Health Check** | [http://localhost:3000/health](http://localhost:3000/health) | Backend health verification endpoint |

---

## 💻 Local Development (Without Docker)

You can also run both services directly using Node.js:

### 1. Backend Setup

```bash
cd Backend
npm install
npm run dev
```

The backend server will start on port `3000` with Node's built-in file watcher (`--watch`).

### 2. Frontend Setup

In a separate terminal:

```bash
cd Frontend
npm install
npm run dev
```

The Vite dev server will start at `http://localhost:5173`.

---

## 🔐 Environment Configuration

Create a `.env` file inside the `Backend/` directory when configuring environment variables:

```env
PORT=3000
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_or_service_key
```

> **Note:** `.env` files are excluded from Git by [.gitignore](file:///Users/yashodhralapanawa/Desktop/POS_system/.gitignore). Do not commit sensitive keys.

---

## 📦 Production Builds

### Frontend Production Container (Nginx)

The frontend includes a multi-stage Docker build that compiles the React app and serves static assets using Nginx:

```bash
docker build -t pos-frontend -f Frontend/Dockerfile ./Frontend
docker run -d -p 8080:80 pos-frontend
```

Access the production frontend at `http://localhost:8080`.

---

## 📋 Key Features & Roadmap

- [x] Foundation setup & Docker development environment with Compose Watch
- [x] Express backend health check & CORS configuration
- [x] React 19 + Vite frontend baseline
- [ ] Product catalog & category management
- [ ] Cart management & barcode/item lookup
- [ ] Multi-channel payment processing (Cash, Card, QR)
- [ ] Digital and printed receipt generation
- [ ] Real-time inventory tracking and low-stock alerts
- [ ] Sales reports and transaction history

---

## 📄 License

This project is licensed under the terms defined in the repository.
add those files into main
