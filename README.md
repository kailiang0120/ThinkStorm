<p align="center">
  <img src="https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Gemini-2.0-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI">
  <img src="https://img.shields.io/badge/Vite-5+-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License">
</p>

# ⚡ ThinkStorm

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
- **Regenerate**: Not satisfied? Regenerate subtopics with one click

### 📊 Structured 4-Stage Brainstorming
1. **Seed** → Enter your topic and let AI interpret your thinking objective
2. **Expand** → Click nodes to explore different directions (spider-web exploration)
3. **Structure** → AI clusters your explored ideas into coherent directions
4. **Synthesize** → Get a comprehensive analysis with recommendations and next actions

### 🎨 Premium Visual Design
- **Cosmic Background**: Animated starfield with nebula effects
- **Glowing Connections**: Chain visualization with color-coded paths
- **Smooth Animations**: Powered by Motion (Framer Motion)
- **Responsive**: Works on desktop and mobile

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
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

Set your Gemini API key in `src/services/gemini.js`:

```javascript
const API_KEY = "your-gemini-api-key-here";
```

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
2. **AI generates**: Root node + 5-7 typed idea nodes (spider-web pattern)
3. **Click** a node like "AI-powered diagnostics" to explore that direction
4. **New nodes** appear around your selection, building the web
5. **Continue exploring** until satisfied with your thinking path
6. **Structure**: AI identifies key directions from your exploration
7. **Synthesize**: Get a comprehensive report with problem statement, analysis, and next actions

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
├── Claude.md                    # Brainstorming methodology spec
├── package.json
└── vite.config.js
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 18** | UI components with hooks |
| **Vite 5** | Fast dev server & build |
| **Motion** | Smooth animations (Framer Motion) |
| **Google Gemini 2.0 Flash** | AI-powered idea generation |
| **React Markdown** | Rendering synthesis reports |

---

## 🎨 Node Types

Each generated idea is classified into one of five types:

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

Export as Markdown or copy to clipboard!

---

## 🔧 Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 📝 License

Apache 2.0 - See [LICENSE](LICENSE) for details.

---

<p align="center">
  <b>Built with ⚡ and AI</b><br>
  <sub>Transform your thinking with ThinkStorm</sub>
</p>
