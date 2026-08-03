<p align="center">
  <img src="public/thinkstorm-logo.png" alt="ThinkStorm logo" width="112">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Gemini-3%20Flash-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License">
</p>

# ThinkStorm

**AI-Powered Visual Brainstorming with Interactive Mind Maps**

ThinkStorm transforms how you brainstorm by combining an interactive spider-web visualization with structured AI-guided thinking. Watch your ideas expand, connect, and evolve in real-time as you explore topics with Google's Gemini AI.

---

## ✨ Features

### 🕸️ Interactive Spider-Web Canvas
- **Click-to-Expand**: Click any node to generate new connected ideas radiating outward
- **Visual Connections**: Beautiful curved lines connect parent and child ideas
- **Smart Positioning**: Nodes automatically arrange to avoid overlap
- **Camera Panning**: View smoothly animates to center on your selected idea

### 🧠 AI-Powered Idea Generation
- **Typed Ideas**: Each idea is categorized (🔴 Problem, 🔵 Method, 🟢 Application, 🟡 Assumption, 🟣 Opportunity)
- **Contextual Expansion**: AI considers your exploration path when generating new ideas
- **Human + AI capture**: Add, edit, shortlist, park, and delete your own ideas before asking AI for fresh angles
- **Reversible exploration**: Alternative branches and workflow changes can be undone

### 📊 Structured Brainstorming Workflow
1. **Seed** → Enter a topic, then review and edit the AI-framed objective and guiding questions
2. **Expand** → Capture human ideas, ask AI for optional angles, and curate the web
3. **Structure** → Review, rename, and rearrange AI-proposed directions
4. **Synthesize** → Select a direction, define evaluation criteria, and generate a decision report
5. **Commit** → Turn the report into a small experiment with an owner, due date, and success metric

### 🎨 Premium Visual Design
- **Cosmic Background**: Animated starfield with nebula effects
- **Glowing Connections**: Chain visualization with color-coded paths
- **Smooth Animations**: Powered by Motion (Framer Motion)
- **Responsive**: Works on desktop and mobile

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Google Gemini API Key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ThinkStorm.git
cd ThinkStorm

# Install dependencies
npm install

# Start development server
npm run dev
```

### Configuration

Create a `.env` file in the project root and set your Gemini API key:

```bash
GEMINI_API_KEY=your-gemini-api-key-here
PORT=3001
GEMINI_FLASH_MODEL=gemini-3-flash-preview
GEMINI_PRO_MODEL=gemini-3-flash-preview
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

The key is used by `server.js` only and is never exposed to the browser. By default,
both generation paths use Flash; set `GEMINI_PRO_MODEL` to a Pro model such as
`gemini-2.5-pro` if your account and quota support it. Use `ALLOWED_ORIGINS` to
restrict which browser origins can spend API quota through the proxy.

---

## 🎯 How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         ThinkStorm Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────┐    ┌─────────┐    ┌───────────┐    ┌──────────┐  │
│   │  SEED   │ →  │ EXPAND  │ →  │ STRUCTURE │ →  │SYNTHESIZE│  │
│   │         │    │         │    │           │    │          │  │
│   │ Enter   │    │ Click   │    │ AI groups │    │ Get full │  │
│   │ topic   │    │ nodes   │    │ into dirs │    │ analysis │  │
│   └─────────┘    └─────────┘    └───────────┘    └──────────┘  │
│                                                                 │
│   Stage 1        Stage 2        Stage 3         Stage 4        │
└─────────────────────────────────────────────────────────────────┘
```

### Example Session

1. **Enter**: "AI in healthcare"
2. **Frame**: Edit the objective and guiding questions until they match the decision you need to make
3. **Capture**: Add your own concerns, opportunities, and ideas to the root topic
4. **Diversify**: Ask AI for fresh angles or expand a selected node
5. **Curate**: Edit ideas, shortlist the strongest ones, and park distractions
6. **Structure**: Review and adjust the proposed directions
7. **Evaluate**: Choose a direction and define what “best” means for this session
8. **Commit**: Generate the report and record the first experiment to run

---

## 📁 Project Structure

```
ThinkStorm/
├── src/
│   ├── components/
│   │   ├── BrainCanvas.jsx      # Main canvas with 4-stage logic
│   │   ├── BrainCanvas.css      # Cosmic background & layout
│   │   ├── ThinkNode.jsx        # Interactive node component
│   │   ├── ThinkNode.css        # Node styling with types
│   │   ├── ConnectionLine.jsx   # Animated SVG connections
│   │   ├── FinalOutput.jsx      # Synthesis report modal
│   │   └── FinalOutput.css
│   ├── services/
│   │   └── gemini.js            # Gemini API with 4 functions:
│   │                            #   - interpretSeed()
│   │                            #   - generateIdeaNodes()
│   │                            #   - clusterIntoDirections()
│   │                            #   - generateSynthesis()
│   ├── App.jsx
│   └── main.jsx
├── package.json
└── vite.config.js
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 19** | UI components with hooks |
| **Vite 7** | Fast dev server & build |
| **Motion** | Smooth animations (Framer Motion) |
| **Google Gen AI SDK** | Structured Gemini responses via the backend proxy |
| **Express Rate Limit** | Basic quota protection for API routes |

---

## 🎨 Expansion Lenses and Node Types

Each AI expansion uses one thinking lens at a time—strategic directions, deeper analysis,
alternatives, risks, assumptions, applications, or next steps—and returns 3–5 parallel
sibling ideas. It stops before weaker or repetitive branches are added.

The five node types are descriptive tags for scanning the canvas. They are not a required
set of branches, and an expansion may use the same type for every sibling when appropriate:

| Type | Icon | Color | Description |
|------|------|-------|-------------|
| Problem | 🔴 | Red | Issues to solve |
| Method | 🔵 | Blue | Approaches or techniques |
| Application | 🟢 | Green | Use cases or implementations |
| Assumption | 🟡 | Yellow | Underlying beliefs to validate |
| Opportunity | 🟣 | Purple | Potential benefits or openings |

---

## 📄 Output Example

The synthesis report includes:

- **🎯 Thinking Objective**: What you're trying to understand or solve
- **📋 Problem Statement**: Clear definition of the challenge
- **🔑 Key Assumptions**: Critical success factors
- **📂 Directions Analysis**: Each direction with value, risks, and unknowns
- **📊 Comparison**: Most promising direction and combination potential
- **✅ Next Actions**: Immediate steps, questions to answer, validation methods
- **🧪 Experiment commitment**: First step, success metric, owner, due date, and completion status

Export as Markdown or copy to clipboard!

---

## 🔧 Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Run unit tests
npm test

# Preview production build
npm run preview
```

---

## Cloudflare Pages Deployment

This repo includes `wrangler.toml` for Cloudflare Pages. It builds the Vite app to
`dist` and serves `/api/*` through Pages Functions in `functions/api/[[path]].js`.

Cloudflare settings:

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `20` or newer |

Set secrets in Cloudflare, not in Git:

```bash
npx wrangler pages secret put GEMINI_API_KEY --project-name thinkstorm
```

Do not place `GEMINI_API_KEY` or `CLOUDFLARE_API_TOKEN` in `wrangler.toml`,
README files, package scripts, or committed env files. For local deploys, use
`npx wrangler login` or set `CLOUDFLARE_API_TOKEN` only in your terminal/session
secret store.

Optional secrets:

```bash
npx wrangler pages secret put API_REQUEST_TOKEN --project-name thinkstorm
```

Local Cloudflare testing:

```bash
copy .dev.vars.example .dev.vars
npm run cloudflare:dev
```

Production deploy:

```bash
npm run cloudflare:deploy
```

---

## 📝 License

Apache 2.0 - See [LICENSE](LICENSE) for details.

---

<p align="center">
  <b>Built with ⚡ and AI</b><br>
  <sub>Transform your thinking with ThinkStorm</sub>
</p>
