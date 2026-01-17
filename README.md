# ⚡ ThinkStorm

AI-powered brainstorming application with a spider-web style mind map using Google's Gemini AI.

## Features

- **Spider-Web Mind Map** - Ideas branch out radially around the active node
- **Camera Panning** - View automatically centers on the selected node
- **Focused View** - Only the selected chain and current subtopics remain visible
- **Cosmic Background** - Beautiful animated starfield with nebula effects
- **AI-Powered Subtopics** - Uses Gemini Flash for instant generation (max 5 words each)
- **Thinking Chain** - Track your exploration path in the header
- **Generate Proposal** - Create a comprehensive markdown document from your thinking chain
- **Download & Copy** - Export your final proposal

## How It Works

1. Enter a topic to start brainstorming
2. Subtopics generate radially around the parent node
3. Click a subtopic to select it - an animated connection line extends
4. The view pans to center on your selection
5. New subtopics generate around your selected node
6. The view stays clean by hiding unselected branches
7. Click "Generate Proposal" when satisfied

## Tech Stack

- **React** with Vite
- **Motion** for animations
- **Google Generative AI** (Gemini 2.0 Flash)
- **React Markdown** for proposal rendering

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Project Structure

```
ThinkStorm/
├── src/
│   ├── components/
│   │   ├── BrainCanvas.jsx    # Main canvas with camera panning
│   │   ├── BrainCanvas.css    # Cosmic background & layout
│   │   ├── ThinkNode.jsx      # Node component
│   │   ├── ThinkNode.css
│   │   ├── ConnectionLine.jsx # Animated SVG connections
│   │   ├── FinalOutput.jsx    # Proposal modal
│   │   └── FinalOutput.css
│   ├── services/
│   │   └── gemini.js          # Gemini API integration
│   └── ...
└── ...
```

## Key UI Behaviors

- **Radial Layout**: Subtopics fan out around the active parent node
- **Camera Pan**: Viewport smoothly animates to center on active node
- **Chain Visualization**: In-chain nodes glow green, active node glows cyan
- **Focused Exploration**: Only the active chain and current subtopics are shown

## API

Uses Google Gemini API. Configure in `src/services/gemini.js`.

## License

Apache 2.0
