import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Gemini
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY in environment variables');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const flashModel = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
const proModel = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

// ============ API Routes ============

/**
 * POST /api/interpret-seed
 * Stage 1: Seed Interpretation
 */
app.post('/api/interpret-seed', async (req, res) => {
    try {
        const { userInput } = req.body;

        const prompt = `You are an expert problem-framing assistant.

Given the user's input topic: "${userInput}"

Rewrite it into:
1. A clear thinking objective - what the user is trying to figure out
2. 1–2 guiding questions that define what the user is trying to figure out

Rules:
- Do not expand ideas yet.
- Do not provide solutions.
- Focus on clarifying intent.

Return ONLY valid JSON in this exact format:
{
  "objective": "What the user is trying to figure out",
  "guiding_questions": [
    "Primary question",
    "Secondary question"
  ]
}`;

        const result = await flashModel.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            res.json(JSON.parse(jsonMatch[0]));
        } else {
            res.json({
                objective: `Explore ideas related to ${userInput}`,
                guiding_questions: [`What are the key aspects of ${userInput}?`]
            });
        }
    } catch (error) {
        console.error('Error in interpret-seed:', error);
        res.status(500).json({ error: 'Failed to interpret seed' });
    }
});

/**
 * POST /api/generate-ideas
 * Stage 2: Idea Node Generation
 */
app.post('/api/generate-ideas', async (req, res) => {
    try {
        const { topic, context = {} } = req.body;

        const contextText = context.objective
            ? `The user's objective is: "${context.objective}"
         Guiding questions: ${context.guiding_questions?.join(", ") || "None provided"}`
            : "";

        const parentChainText = context.parentChain?.length > 0
            ? `The thinking chain so far: ${context.parentChain.join(" → ")}`
            : "";

        const prompt = `${contextText}
${parentChainText}

Generate 6–8 distinct idea nodes for brainstorming about: "${topic}"

Rules:
- Each idea must be a complete thought, not a keyword.
- Maximum 15 words per idea.
- Vary idea types among these categories:
  - problem: Issues or challenges to address
  - method: Approaches or techniques to apply
  - application: Practical uses or implementations
  - assumption: Beliefs or premises to examine
  - opportunity: Potential benefits or openings
- Make ideas concrete and non-generic.
- Each idea should be actionable or thought-provoking.

Return ONLY a valid JSON array of idea nodes following this schema:
[
  {
    "id": "idea_1",
    "type": "problem",
    "content": "A complete thought in 15 words or less",
    "expandable": true
  }
]

Use sequential ids like idea_1, idea_2, etc.`;

        const result = await flashModel.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const validated = parsed.map((node, index) => ({
                id: node.id || `idea_${index + 1}`,
                type: ['problem', 'method', 'application', 'assumption', 'opportunity'].includes(node.type)
                    ? node.type
                    : 'opportunity',
                content: node.content?.slice(0, 100) || 'Explore this concept further',
                expandable: node.expandable !== false
            }));
            res.json(validated);
        } else {
            res.json([
                { id: "idea_1", type: "problem", content: "Define the core challenge", expandable: true },
                { id: "idea_2", type: "method", content: "Research existing solutions", expandable: true },
                { id: "idea_3", type: "application", content: "Identify practical use cases", expandable: true },
                { id: "idea_4", type: "opportunity", content: "Explore market potential", expandable: true },
                { id: "idea_5", type: "assumption", content: "Question key assumptions", expandable: true }
            ]);
        }
    } catch (error) {
        console.error('Error in generate-ideas:', error);
        res.status(500).json({ error: 'Failed to generate ideas' });
    }
});

/**
 * POST /api/cluster-directions
 * Stage 3: Direction Clustering
 */
app.post('/api/cluster-directions', async (req, res) => {
    try {
        const { ideaNodes, objective } = req.body;
        const nodesText = ideaNodes.map(n => `- ${n.id} (${n.type}): ${n.content}`).join("\n");

        const prompt = `Given the thinking objective: "${objective}"

Here are the idea nodes to organize:
${nodesText}

Group these idea nodes into 3–5 coherent directions.

For each direction:
- Provide a concise title (max 5 words)
- Write a brief summary (1-2 sentences explaining the theme)
- List the idea IDs included

Rules:
- Group by conceptual similarity, not just wording.
- Each idea must belong to one direction only.
- Cover all provided ideas - don't leave any out.
- Create meaningful groupings that help organize thinking.

Return ONLY valid JSON in this format:
[
  {
    "direction_id": "D1",
    "title": "Short clear name",
    "summary": "1–2 sentence explanation of this direction's theme",
    "idea_ids": ["idea_1", "idea_3"]
  }
]`;

        const result = await flashModel.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const validated = parsed.map((dir, index) => ({
                direction_id: dir.direction_id || `D${index + 1}`,
                title: dir.title || `Direction ${index + 1}`,
                summary: dir.summary || "Explore this theme further",
                idea_ids: Array.isArray(dir.idea_ids) ? dir.idea_ids : []
            }));
            res.json(validated);
        } else {
            res.json([{
                direction_id: "D1",
                title: "Main Exploration",
                summary: "All ideas grouped together for initial exploration",
                idea_ids: ideaNodes.map(n => n.id)
            }]);
        }
    } catch (error) {
        console.error('Error in cluster-directions:', error);
        res.status(500).json({ error: 'Failed to cluster directions' });
    }
});

/**
 * POST /api/synthesize
 * Stage 4: Synthesis Generation
 */
app.post('/api/synthesize', async (req, res) => {
    try {
        const { objective, directions, ideaNodes } = req.body;

        const directionsText = directions.map(d => {
            const ideas = d.idea_ids
                .map(id => ideaNodes.find(n => n.id === id))
                .filter(Boolean)
                .map(n => `- ${n.content} (${n.type})`)
                .join("\n    ");
            return `Direction ${d.direction_id}: ${d.title}
  Summary: ${d.summary}
  Ideas:
    ${ideas}`;
        }).join("\n\n");

        const prompt = `You are an expert thinking synthesizer.

Using the structured brainstorm directions provided, generate a decision-oriented synthesis report.

Thinking Objective: "${objective}"

Directions:
${directionsText}

Your task is to:
1. Restate the core problem or goal.
2. Analyze each direction in terms of:
   - value: What benefit does this direction offer?
   - risks: What could go wrong?
   - unknowns: What needs more research?
3. Compare all directions.
4. Recommend concrete next actions.

Automatically adapt emphasis based on the nature of the ideas:
- Research → research questions, investigation paths
- Startup → feasibility, validation, execution
- Product → user problems, solution framing
- Exploration → learning goals and hypotheses

Return ONLY valid JSON following this exact schema:
{
  "problem_statement": {
    "interpreted_goal": "Clear statement of what user is trying to achieve",
    "key_assumptions": ["assumption 1", "assumption 2"]
  },
  "directions_analysis": [
    {
      "direction_id": "D1",
      "value": "What this direction offers",
      "risks": ["risk 1", "risk 2"],
      "unknowns": ["unknown 1"],
      "potential": "high"
    }
  ],
  "comparison": {
    "most_promising": "D1",
    "can_be_combined": ["D1", "D2"],
    "should_deprioritize": ["D3"]
  },
  "next_actions": {
    "immediate_steps": ["step 1", "step 2", "step 3"],
    "questions_to_answer": ["question 1", "question 2"],
    "validation_methods": ["method 1", "method 2"]
  },
  "detected_mode": "research"
}

For potential field, use only: "high", "medium", or "low"
For detected_mode, use only: "research", "startup", "product", or "exploration"`;

        const result = await proModel.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            res.json(JSON.parse(jsonMatch[0]));
        } else {
            res.json({
                problem_statement: {
                    interpreted_goal: objective,
                    key_assumptions: ["Standard market conditions apply"]
                },
                directions_analysis: directions.map(d => ({
                    direction_id: d.direction_id,
                    value: d.summary,
                    risks: ["Needs further validation"],
                    unknowns: ["Market size", "Competition"],
                    potential: "medium"
                })),
                comparison: {
                    most_promising: directions[0]?.direction_id || "D1",
                    can_be_combined: [],
                    should_deprioritize: []
                },
                next_actions: {
                    immediate_steps: ["Conduct research", "Validate assumptions", "Create prototype"],
                    questions_to_answer: ["Who is the target audience?", "What makes this unique?"],
                    validation_methods: ["User interviews", "Market analysis"]
                },
                detected_mode: "exploration"
            });
        }
    } catch (error) {
        console.error('Error in synthesize:', error);
        res.status(500).json({ error: 'Failed to generate synthesis' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
    console.log(`✅ Gemini API key loaded (hidden from browser)`);
});
