# 🌊 ClawCrossHub

**A community marketplace for discovering, sharing, and distributing multi-agent OASIS workflows — built for [Clawcross](https://github.com/ClawCross/ClawCross).**

ClawcrossHub is where Clawcross teams publish their workflow templates so others can browse, star, download, and remix them. Think of it as a "workflow app store" for multi-agent orchestration.

> **Live site**: [clawcross.net](https://clawcross.net/)

---

## ✨ Features

### 🔍 Browse & Discover
- Search workflows by keyword, category, or tag
- Filter by categories: Engineering, Ideation, Business, Research, Community, and more
- Card-based grid layout with rich metadata (steps, DAG mode, agents, stars)

### 📊 Visual Workflow Inspector
- Interactive **DAG / sequential flow diagrams** with zoom and pan
- Full agent breakdown: internal agents, OpenClaw agents, external connected agents
- Skills, Cron Jobs, and YAML configuration at a glance

### 📦 Publish & Share
- **Upload a Team Snapshot ZIP** — includes YAML workflow, agents, skills, and everything needed to run
- **Write YAML directly** — paste or author a workflow definition in the browser
- GitHub login required to publish; browsing and downloading are open to everyone

### ⭐ Star & Collect
- Star your favorite workflows
- Personal profile page with published works and starred collections

### 🌐 Bilingual (中文 / English)
- Full i18n support with one-click language toggle
- Covers all UI text: navigation, forms, workflow detail, error messages, tooltips

### 🖥️ CLI-Friendly API
```bash
# List all workflows (JSON)
curl https://clawcross.net/api/cli/workflows

# Pretty-printed table for terminal
curl -H 'Accept: text/plain' https://clawcross.net/api/cli/workflows

# Search by keyword
curl 'https://clawcross.net/api/cli/workflows?search=creative'

# Download a workflow as ZIP
curl -L -o workflow.zip https://clawcross.net/api/workflows/<id>/download
```

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 15](https://nextjs.org/) (App Router, React 19) |
| Language | TypeScript 5.7 (strict) |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) (Radix UI + Tailwind CSS) |
| Icons | [Lucide](https://lucide.dev/) |
| Auth | GitHub OAuth 2.0 + signed cookie sessions |
| Data Store | JSON files (no external database) |
| YAML | [js-yaml](https://github.com/nodeca/js-yaml) |
| ZIP | [adm-zip](https://github.com/cthackers/adm-zip) |
| Layout Engine | Python bridge to `mcp_oasis._yaml_to_layout_data` (optional) |
| Deployment | [Vercel](https://vercel.com/) |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x
- A [GitHub OAuth App](https://github.com/settings/developers) (for authentication)

### Setup

```bash
# Clone the repository
git clone https://github.com/ClawCross/ClawCrossHub.git
cd ClawCrossHub

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
```

Edit `.env.local`:

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_REDIRECT_URI=http://localhost:51211/auth/github/callback
SESSION_SECRET=any_random_secret_string
```

### Run

```bash
# Development
npm run dev        # → http://localhost:51211

# Production build
npm run build
npm run start      # → http://localhost:51211
```

---

## 📐 Project Structure

```
ClawcrossHub/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (I18nProvider)
│   ├── page.tsx                  # Home → <MainPage />
│   ├── auth/                     # GitHub OAuth routes
│   │   ├── github/route.ts       #   Initiate login
│   │   ├── github/callback/      #   OAuth callback
│   │   └── logout/route.ts       #   Logout
│   ├── api/
│   │   ├── workflows/            # CRUD + list + publish
│   │   ├── cli/workflows/        # CLI-friendly endpoint
│   │   ├── import/               # ZIP & JSON import
│   │   ├── categories/           # Category list
│   │   └── user/[login]/         # User workflows & stars
│   ├── profile/[login]/          # User profile page
│   └── workflow/[workflowId]/    # Workflow detail page
├── components/
│   ├── clawcrosshub/
│   │   ├── main-page.tsx         # Home page (search, filter, publish)
│   │   ├── profile-page.tsx      # Profile (CRUD, stars, settings)
│   │   ├── workflow-detail-page.tsx  # Detail (diagram, agents, YAML)
│   │   └── logo.tsx              # ClawcrossHub logo
│   └── ui/                       # shadcn/ui primitives
├── lib/
│   ├── workflow-store.ts         # Core data layer (JSON read/write)
│   ├── auth.ts                   # Session management (HMAC cookies)
│   ├── i18n.tsx                  # Bilingual translations (150+ keys)
│   ├── import-export.ts          # ZIP import/export with security checks
│   ├── constants.ts              # Preset workflows & expert definitions
│   ├── types.ts                  # TypeScript type definitions
│   ├── layout.ts                 # Python layout engine bridge
│   └── oauth.ts                  # OAuth redirect URI resolution
├── hub_meta.json                 # Community workflow data store
├── vercel.json                   # Vercel deployment config
└── .env.example                  # Environment variable template
```

---

## 📡 API Reference

### Workflows

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/workflows` | No | List all workflows. Query: `?search=`, `?category=`, `?tag=` |
| `GET` | `/api/workflows/[id]` | No | Get workflow detail |
| `POST` | `/api/workflows/publish` | Yes | Publish a new workflow |
| `PATCH` | `/api/workflows/[id]/edit` | Owner | Edit workflow |
| `DELETE` | `/api/workflows/[id]/manage` | Owner | Delete workflow |
| `GET` | `/api/workflows/[id]/download` | No | Download as ZIP |
| `GET/POST` | `/api/workflows/[id]/star` | Yes | Check / toggle star |
| `GET` | `/api/workflows/[id]/layout` | No | Get visual layout data |

### Import

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/import/zip` | Yes | Import from Team Snapshot ZIP |
| `POST` | `/api/import/json` | Yes | Import from JSON |

### User

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/user/[login]/workflows` | No | User's published workflows |
| `GET` | `/api/user/[login]/stars` | Self | User's starred workflows |

### Utility

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/auth/status` | No | Current login status |
| `GET` | `/api/categories` | No | Available categories |
| `GET` | `/api/cli/workflows` | No | CLI-friendly listing (supports `Accept: text/plain`) |

---

## 🔐 Authentication

ClawcrossHub uses **GitHub OAuth 2.0** for authentication:

1. User clicks "Sign in with GitHub" → redirected to GitHub authorization page
2. GitHub calls back with an authorization code
3. Server exchanges code for access token, fetches user profile
4. Session is stored as a **signed cookie** (HMAC-SHA256, 14-day expiry)

**Permissions:**
- 🔓 **No login needed**: Browse, search, download, view details
- 🔒 **Login required**: Publish, star, edit, delete

---

## 🗄️ Data Model

ClawcrossHub uses a **lightweight JSON file store** (no external database):

- **`hub_meta.json`** — All community-published workflows
- **`star_records.json`** — User star records
- **Preset workflows** — Hardcoded in `lib/constants.ts` (6 official templates)
- **User local workflows** — Scanned from `data/user_files/` directory

### Workflow Sources

| Source | Description | Editable |
|--------|-------------|----------|
| **Preset** | 6 built-in official workflow templates | No |
| **Community** | Published by users via the platform | By owner |
| **User** | Local YAML files from `data/user_files/` | Via filesystem |

---

## 🤝 Relation to Clawcross

ClawcrossHub is a companion project to [Clawcross](https://github.com/ClawCross/ClawCross) — a multi-agent collaboration framework. The relationship:

- **Clawcross** → The runtime engine. Creates teams of AI agents that collaborate through OASIS workflows.
- **ClawcrossHub** → The distribution hub. Lets users share and discover workflow templates that run on Clawcross.

A typical workflow:
1. Design a multi-agent workflow in Clawcross
2. Export it as a Team Snapshot ZIP (agents + workflow YAML + skills)
3. Publish to ClawcrossHub for the community
4. Others browse ClawcrossHub, download the ZIP, and import into their Clawcross instance

---

## 📄 License

Apache License 2.0

---

<p align="center">
  Built with ❤️ for the Clawcross community
</p>
