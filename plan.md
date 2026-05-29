# ThinkStorm — Improvement Plan

_Deep-inspection findings and roadmap. Generated 2026-05-29._

ThinkStorm is a React 19 + Vite SPA with an Express proxy (`server.js`) that talks to
Google Gemini. It drives a 4-stage brainstorm flow (Seed → Expand → Structure →
Synthesize) over an interactive spider-web canvas.

This document splits work into:
1. **Done** — UI changes already applied directly.
2. **Plan** — backend logic, security, repo/layout, and DX items awaiting approval.

> Note: the `Bash` tool was non-functional during inspection, so the applied UI changes
> have **not** been run through `npm run dev` / `npm run lint`. A local smoke-test is
> recommended (especially for the canvas zoom feel).

---

## 1. ✅ Done — UI changes applied

| # | Change | Files |
|---|--------|-------|
| 1 | **Canvas zoom** — `⌘/Ctrl + scroll` zooms toward cursor; floating `+ / % / −` controls; `%` resets to 100%; scale-aware `panToNode`; `transform-origin: 0 0` + `scale` on viewport. Panning untouched. | `src/components/BrainCanvas.jsx`, `BrainCanvas.css` |
| 2 | **Recenter (`⌖`) button** — snaps camera back to the active node. | `src/components/BrainCanvas.jsx` |
| 3 | **Surface real error messages** — catch blocks now show `err.message` (invalid/leaked key, quota/rate-limit) instead of a generic "Please try again." | `src/components/BrainCanvas.jsx` |
| 4 | **Node-type legend** — bottom-left glass panel decoding the color coding; hidden on mobile. | `src/components/BrainCanvas.jsx`, `BrainCanvas.css` |
| 5 | **First-run interaction hint** — dismissible top bar, auto-hides after first expansion. | `src/components/BrainCanvas.jsx`, `BrainCanvas.css` |
| 6 | **Toast instead of `alert()`** — copy/download give a non-blocking animated toast. | `src/components/FinalOutput.jsx`, `FinalOutput.css` |
| 7 | **Keyboard accessibility for nodes** — `role="button"`, focusable, Enter/Space activation, aria-labels. | `src/components/ThinkNode.jsx` |
| 8 | **Fixed misleading validation message** — Structure stage requires 2 nodes but said "at least one". | `src/components/BrainCanvas.jsx` |
| 9 | **Documented model env vars** — `GEMINI_FLASH_MODEL` / `GEMINI_PRO_MODEL`. | `.env.example` |

---

## 2. 📋 Plan — awaiting approval

### High priority

#### A. Remove dead dependency `react-markdown`
- **Problem:** Listed in `package.json` and README ("Rendering synthesis reports") but
  **never imported**. `FinalOutput` renders structured JSX, not markdown.
- **Action:** `npm uninstall react-markdown` (regenerates lockfile cleanly).
- **Effort:** XS · **Risk:** none.

#### B. Migrate to the new `@google/genai` SDK
- **Problem:** `server.js` uses `@google/generative-ai`, which Google has deprecated in
  favor of the unified `@google/genai` SDK. The current code hand-rolls fragile JSON
  extraction (`extractBalancedJson`, `parseModelJson`, plain-text retry fallback).
- **Action:** Migrate to `@google/genai`, pass a `responseSchema` for each route, and
  delete the manual brace-balancing parser. Native structured output removes the main
  source of parse failures.
- **Effort:** M · **Risk:** medium (touches all 4 routes) · **Payoff:** large reliability
  + maintainability win. Do on a branch.

#### C. Resolve model config inconsistency
- **Problem:** `FLASH_MODEL` and `PRO_MODEL` both default to `gemini-3-flash-preview`, so
  synthesis ("pro") silently runs on flash. README still says "Gemini 2.0 Flash."
- **Action:** Decide intended models, set them explicitly in `.env`, align README. If
  pro→flash is intentional (free-trial account, per recent commit), document it so it
  doesn't read as a bug.
- **Effort:** XS · **Risk:** none.

#### D. Lock down the key-spending proxy
- **Problem:** `app.use(cors())` allows any origin to hit `/api/*`; every call spends
  Gemini quota. The deployed URL can be drained by anyone who finds it.
- **Action:** Restrict CORS to the deployed origin; add `express-rate-limit`; optionally a
  lightweight request token / shared secret.
- **Effort:** S · **Risk:** low.

### Medium priority

#### E. Session persistence
- **Problem:** A refresh wipes the entire brainstorm (nodes, chain, synthesis).
- **Action:** Debounced persist of `allNodes / connections / activeNodeId / seedData /
  currentStage` to `localStorage`; "Resume previous session?" prompt; Reset clears it.
- **Effort:** M · **Risk:** low.

#### F. Richer + more exportable synthesis report
- **Problem:** Markdown download + clipboard only.
- **Action:** Add PDF export and/or a shareable permalink; consider a visual
  "decision matrix" for the directions comparison.
- **Effort:** M · **Risk:** low.

#### G. Remaining accessibility / UX gaps
- **Problem:** `FinalOutput` modal has no focus trap and no `Esc`-to-close; no
  "fit all nodes" view.
- **Action:** Add Esc + focus-trap to the modal; add a "Fit all nodes in view" button
  (bounding box of `allNodes` → compute zoom + offset).
- **Effort:** S–M · **Risk:** low.

### Repo / layout / DX

#### H. README references a non-existent `Claude.md`
- The project-structure diagram lists `Claude.md` ("Brainstorming methodology spec") but
  the file isn't in the repo. Add it or remove the reference.

#### I. Folder structure & component size
- Flat `src/components` + `src/services` is fine at this size.
- `BrainCanvas.jsx` (~880 lines) does a lot. As features grow, extract camera/zoom logic
  into `src/hooks/useCanvasCamera.js` and shared helpers into `src/lib/`.

#### J. No tests / no CI
- The pure-logic functions in `server.js` (`normalizeDirections`, `normalizeSynthesis`,
  `parseModelJson`) are the brittle parts and ideal unit-test targets.
- **Action:** Add Vitest + a GitHub Action running `lint` + `test` on PRs.

---

## 3. Suggested sequencing

1. **A** (remove dead dep) + **C** (model config) — quick wins, no risk.
2. **B** (SDK migration) — on a branch; deletes fragile parsing code.
3. **D** (proxy hardening) — before any public deployment.
4. **E** (persistence) — highest user-facing value after the above.
5. **J** (tests/CI) — lock in reliability of the normalization layer.
6. **F**, **G**, **H**, **I** — polish as capacity allows.
