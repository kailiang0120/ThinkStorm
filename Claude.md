# 🕸️ Thought Graph Brainstorming System

**Preserving Spider‑Web Thinking with Structured Intelligence**

---

## 1. Core Philosophy

Traditional AI brainstorming tools feel like:

> select → generate → repeat → summarize

This kills creativity.

Human thinking is **non‑linear**, **associative**, and **visual**.

Therefore:

> **The UI must remain a spider web.**
> **Structure must stay invisible.**

The system should feel playful while behaving intelligently underneath.

---

## 2. Product North Star

If the user feels:

> “I’m exploring ideas freely — and clarity slowly emerges.”

Then the system succeeds.

Not by forcing steps —
but by letting structure *emerge naturally*.

---

## 3. Mental Model

### What the user sees

```
idea — idea — idea
  \      |      /
     idea — idea
```

### What the system maintains

```
Thought Graph
→ semantic embeddings
→ relationship inference
→ clustering
→ synthesis readiness
```

---

## 4. Core Data Structure: Thought Graph

Everything in the system is a **node in a graph**.

### Node Schema

```json
{
  "node_id": "n_42",
  "type": "idea | question | insight | direction",
  "content": "Multimodal models can explain medical scans",
  "embedding": "vector",
  "confidence": 0.72,
  "created_by": "user | ai",
  "edges": [
    {
      "to": "n_17",
      "relation": "expands"
    }
  ]
}
```

---

## 5. Edge Types (Relationships)

Edges define meaning, not layout.

| Relation   | Meaning               |
| ---------- | --------------------- |
| expands    | natural continuation  |
| supports   | reinforces idea       |
| contrasts  | alternative viewpoint |
| questions  | introduces doubt      |
| depends_on | prerequisite          |
| similar    | semantic closeness    |

These relations form the spider‑web experience.

---

## 6. Interaction Model

### Users never move through steps.

They move through **modes**.

```
Explore → Connect → Focus → Conclude
```

Modes change system behavior — not layout.

---

# 🧭 Mode 1 — Explore

### Goal

Free idea generation without judgment.

### User Actions

* Click anywhere → create node
* Type thought → bubble appears
* Press Enter → AI suggests connected ideas

### System Behavior

* Generates related nodes
* Links them automatically
* Updates embeddings silently

---

### Prompt — Node Expansion

```text
You are expanding a thought graph.

Given the selected node content, generate 4–6 connected thoughts.

Rules:
- Each thought must be a complete idea.
- Maximum 15 words.
- Do not summarize or conclude.

For each idea, assign one relationship:
- expands
- supports
- contrasts
- questions

Return JSON only.
```

Example output:

```json
[
  {
    "content": "Vision-language models could generate human-readable explanations",
    "relation": "expands"
  },
  {
    "content": "Clinicians may distrust synthetic explanations",
    "relation": "questions"
  }
]
```

---

# 🔗 Mode 2 — Connect

### Goal

Reveal hidden relationships.

### System Behavior

* Continuously computes embeddings
* Suggests possible links:

> “These ideas appear related — connect them?”

* Strengthens semantic graph

User can accept, reject, or edit links.

---

# 🎯 Mode 3 — Focus

### Goal

Allow meaning to emerge from chaos.

### Interaction

* User selects multiple nodes (lasso / shift‑click)
* System detects semantic cluster

AI responds with:

> “These ideas appear to form a direction.”

A **Direction Node** appears inside the web.

---

### Direction Node Schema

```json
{
  "node_id": "d_01",
  "type": "direction",
  "title": "Explainable Medical AI",
  "summary": "Improving interpretability of diagnostic models",
  "source_nodes": ["n_12", "n_18", "n_31"]
}
```

Direction nodes do not replace ideas — they sit above them.

---

# 🧩 Mode 4 — Conclude

Activated only when the user clicks:

> **“Turn this map into insight.”**

The system now has:

* full thought graph
* clusters
* direction nodes
* relationship weights

This enables deep synthesis.

---

## Final Synthesis Output

```json
{
  "interpreted_goal": "",
  "key_directions": [],
  "direction_analysis": [
    {
      "direction_id": "d_01",
      "value": "",
      "risks": [],
      "unknowns": [],
      "potential": "high | medium | low"
    }
  ],
  "recommended_focus": "",
  "next_actions": [],
  "detected_mode": "research | startup | product | exploration"
}
```

---

## 7. Hidden System Pipeline

```
Node created
   ↓
Embedding updated
   ↓
Edge inference
   ↓
Cluster detection
   ↓
Direction candidates cached
   ↓
Synthesis-ready graph
```

All invisible to the user.

---

## 8. UX Principles

### Must Preserve

* visual chaos
* instant feedback
* freeform placement
* no mandatory order

### Must Avoid

* step wizards
* long text blocks
* forced summaries
* "generate more" loops

---

## 9. Why This Works

| Human                | System               |
| -------------------- | -------------------- |
| thinks associatively | models relationships |
| explores freely      | enforces structure   |
| visual cognition     | semantic computation |

The user experiences **play**.

The system produces **clarity**.

---

## Final Product Insight

> **Structure should not replace creativity.**

It should quietly grow beneath it.

A great brainstorming tool does not feel smart.

It makes the *user* feel smart.

---

**End of Document**