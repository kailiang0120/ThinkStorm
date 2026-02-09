/* global process */

import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const API_KEY = process.env.GEMINI_API_KEY;
const FLASH_MODEL_NAME = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
const PRO_MODEL_NAME = process.env.GEMINI_PRO_MODEL || 'gemini-3-pro-preview';
let flashModel = null;
let proModel = null;

if (!API_KEY) {
  console.error('Missing GEMINI_API_KEY in environment variables');
} else {
  const genAI = new GoogleGenerativeAI(API_KEY);
  flashModel = genAI.getGenerativeModel({ model: FLASH_MODEL_NAME });
  proModel = genAI.getGenerativeModel({ model: PRO_MODEL_NAME });
}

const IDEA_TYPES = ['problem', 'method', 'application', 'assumption', 'opportunity'];
const IDEA_TYPES_SET = new Set(IDEA_TYPES);
const POTENTIAL_LEVELS_SET = new Set(['high', 'medium', 'low']);
const SYNTHESIS_MODES_SET = new Set(['research', 'startup', 'product', 'exploration']);

function normalizeSentence(value, maxLength = 180) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeStringArray(value, maxItems = 5, maxLength = 160) {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => normalizeSentence(item, maxLength))
    .filter(Boolean);
  return normalized.slice(0, maxItems);
}

function extractBalancedJson(text, openChar, closeChar) {
  const start = text.indexOf(openChar);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === openChar) {
      depth += 1;
    } else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseModelJson(text, expectedType = 'object') {
  if (typeof text !== 'string') return null;
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const candidates = [cleaned];
  const objectCandidate = extractBalancedJson(cleaned, '{', '}');
  const arrayCandidate = extractBalancedJson(cleaned, '[', ']');

  if (expectedType === 'array') {
    if (arrayCandidate) candidates.push(arrayCandidate);
    if (objectCandidate) candidates.push(objectCandidate);
  } else {
    if (objectCandidate) candidates.push(objectCandidate);
    if (arrayCandidate) candidates.push(arrayCandidate);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (expectedType === 'array' && Array.isArray(parsed)) return parsed;
      if (expectedType === 'object' && parsed && !Array.isArray(parsed)) return parsed;
    } catch {
      // Keep trying the next candidate
    }
  }

  return null;
}

async function runStructuredPrompt(model, prompt, expectedType = 'object', temperature = 0.4) {
  if (!model) {
    throw new Error('Gemini model is not initialized. Check GEMINI_API_KEY.');
  }

  let text = '';

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature
      }
    });
    text = result.response.text();
  } catch (structuredError) {
    console.warn('Structured response failed; retrying plain generation:', structuredError.message);
    const fallbackResult = await model.generateContent(prompt);
    text = fallbackResult.response.text();
  }

  const parsed = parseModelJson(text, expectedType);
  if (!parsed) {
    throw new Error(`Failed to parse ${expectedType} JSON from model response`);
  }
  return parsed;
}

function buildApiErrorResponse(error, fallbackMessage) {
  const message = normalizeSentence(error?.message, 260);
  const status = Number(error?.status);

  if (/api key was reported as leaked/i.test(message)) {
    return {
      status: 401,
      payload: {
        error: 'Gemini API key is revoked (reported leaked). Create a new key and update GEMINI_API_KEY.'
      }
    };
  }

  if (/api key (is not valid|invalid)|permission denied|unauthenticated/i.test(message)) {
    return {
      status: 401,
      payload: {
        error: 'Gemini API key is invalid or unauthorized. Check GEMINI_API_KEY and key permissions.'
      }
    };
  }

  if (status === 429 || /quota|rate limit|resource exhausted/i.test(message)) {
    return {
      status: 429,
      payload: {
        error: 'Gemini quota or rate limit reached. Retry later or use a key with available quota.'
      }
    };
  }

  if (status >= 400 && status <= 599) {
    return {
      status,
      payload: {
        error: fallbackMessage,
        details: message || `Gemini request failed with status ${status}.`
      }
    };
  }

  return {
    status: 500,
    payload: {
      error: fallbackMessage,
      details: message || 'Unexpected server error.'
    }
  };
}

function addApiRoute(method, path, handler) {
  app[method]([`/api${path}`, path], handler);
}

function normalizeIdeaNodes(rawNodes, topic) {
  const shortTopic = normalizeSentence(topic, 40) || 'this topic';
  const fallback = [
    { type: 'problem', content: `What blocks progress on ${shortTopic}?`, expandable: true },
    { type: 'method', content: `How can we test assumptions about ${shortTopic} quickly?`, expandable: true },
    { type: 'application', content: `Which concrete use case of ${shortTopic} should be validated first?`, expandable: true },
    { type: 'assumption', content: `Which hidden constraint about ${shortTopic} could make this fail?`, expandable: true },
    { type: 'opportunity', content: `Where could ${shortTopic} create disproportionate value?`, expandable: true },
    { type: 'method', content: `What experiment would de-risk ${shortTopic} in one week?`, expandable: true }
  ];

  const unique = [];
  const seenContent = new Set();
  const source = Array.isArray(rawNodes) ? rawNodes : [];

  source.forEach((node) => {
    const content = normalizeSentence(node?.content, 100);
    if (!content) return;
    const dedupeKey = content.toLowerCase();
    if (seenContent.has(dedupeKey)) return;
    seenContent.add(dedupeKey);
    unique.push({
      id: `idea_${unique.length + 1}`,
      type: IDEA_TYPES_SET.has(node?.type) ? node.type : 'opportunity',
      content,
      expandable: node?.expandable !== false
    });
  });

  fallback.forEach((node) => {
    if (unique.length >= 7) return;
    const dedupeKey = node.content.toLowerCase();
    if (seenContent.has(dedupeKey)) return;
    seenContent.add(dedupeKey);
    unique.push({
      id: `idea_${unique.length + 1}`,
      ...node
    });
  });

  return unique.slice(0, 8);
}

function normalizeInputIdeas(rawIdeaNodes) {
  const source = Array.isArray(rawIdeaNodes) ? rawIdeaNodes : [];
  const seenIds = new Set();
  const normalized = [];

  source.forEach((node) => {
    const id = normalizeSentence(node?.id, 80);
    const content = normalizeSentence(node?.content, 100);
    if (!id || !content || seenIds.has(id)) return;
    seenIds.add(id);
    normalized.push({
      id,
      type: IDEA_TYPES_SET.has(node?.type) ? node.type : 'opportunity',
      content
    });
  });

  return normalized;
}

function normalizeDirections(rawDirections, ideaNodes) {
  const validIdeaIds = ideaNodes.map((node) => node.id);
  const validIdeaIdSet = new Set(validIdeaIds);
  const usedIdeaIds = new Set();
  const directions = [];

  const source = Array.isArray(rawDirections) ? rawDirections : [];
  source.forEach((direction) => {
    const title = normalizeSentence(direction?.title, 48);
    const summary = normalizeSentence(direction?.summary, 220);
    const rawIds = normalizeStringArray(direction?.idea_ids, validIdeaIds.length, 80);

    const dedupedIds = [];
    rawIds.forEach((id) => {
      if (!validIdeaIdSet.has(id) || usedIdeaIds.has(id)) return;
      usedIdeaIds.add(id);
      dedupedIds.push(id);
    });

    if (!title || !summary || dedupedIds.length === 0) return;

    directions.push({
      direction_id: `D${directions.length + 1}`,
      title,
      summary,
      idea_ids: dedupedIds
    });
  });

  const unassigned = validIdeaIds.filter((id) => !usedIdeaIds.has(id));
  if (unassigned.length > 0) {
    directions.push({
      direction_id: `D${directions.length + 1}`,
      title: 'Unsorted Insights',
      summary: 'Ideas that did not fit the dominant direction patterns.',
      idea_ids: unassigned
    });
  }

  if (!directions.length && validIdeaIds.length > 0) {
    directions.push({
      direction_id: 'D1',
      title: 'Main Direction',
      summary: 'Initial grouping of explored ideas.',
      idea_ids: validIdeaIds
    });
  }

  if (directions.length > 5) {
    const overflow = directions.slice(5).flatMap((direction) => direction.idea_ids);
    directions[4].idea_ids = Array.from(new Set([...directions[4].idea_ids, ...overflow]));
    directions.length = 5;
  }

  return directions.map((direction, index) => ({
    ...direction,
    direction_id: `D${index + 1}`
  }));
}

function normalizeSynthesis(rawSynthesis, directions, objective) {
  const directionIds = directions.map((direction) => direction.direction_id);
  const directionIdSet = new Set(directionIds);

  const analysisMap = new Map();
  const rawAnalysis = Array.isArray(rawSynthesis?.directions_analysis)
    ? rawSynthesis.directions_analysis
    : [];

  rawAnalysis.forEach((item) => {
    const directionId = normalizeSentence(item?.direction_id, 12);
    if (!directionIdSet.has(directionId) || analysisMap.has(directionId)) return;
    analysisMap.set(directionId, {
      direction_id: directionId,
      value: normalizeSentence(item?.value, 260) || 'Needs deeper evaluation.',
      risks: normalizeStringArray(item?.risks, 4, 120),
      unknowns: normalizeStringArray(item?.unknowns, 4, 120),
      potential: POTENTIAL_LEVELS_SET.has(item?.potential) ? item.potential : 'medium'
    });
  });

  directionIds.forEach((directionId) => {
    if (analysisMap.has(directionId)) return;
    analysisMap.set(directionId, {
      direction_id: directionId,
      value: 'No detailed analysis was returned for this direction.',
      risks: ['Evidence is currently limited.'],
      unknowns: ['Needs additional validation data.'],
      potential: 'medium'
    });
  });

  const directionsAnalysis = directionIds.map((directionId) => analysisMap.get(directionId));

  const filterDirectionList = (value) => {
    if (!Array.isArray(value)) return [];
    return value.filter((id) => directionIdSet.has(id)).slice(0, 3);
  };

  const fallbackMostPromising = directionsAnalysis.find((item) => item.potential === 'high')?.direction_id
    || directionIds[0]
    || 'D1';
  const mostPromising = directionIdSet.has(rawSynthesis?.comparison?.most_promising)
    ? rawSynthesis.comparison.most_promising
    : fallbackMostPromising;

  const mode = SYNTHESIS_MODES_SET.has(rawSynthesis?.detected_mode)
    ? rawSynthesis.detected_mode
    : 'exploration';

  return {
    problem_statement: {
      interpreted_goal: normalizeSentence(rawSynthesis?.problem_statement?.interpreted_goal, 260)
        || normalizeSentence(objective, 260)
        || 'Clarify objective and evaluate alternatives.',
      key_assumptions: normalizeStringArray(rawSynthesis?.problem_statement?.key_assumptions, 4, 140)
    },
    directions_analysis: directionsAnalysis,
    comparison: {
      most_promising: mostPromising,
      can_be_combined: filterDirectionList(rawSynthesis?.comparison?.can_be_combined),
      should_deprioritize: filterDirectionList(rawSynthesis?.comparison?.should_deprioritize)
        .filter((directionId) => directionId !== mostPromising)
    },
    next_actions: {
      immediate_steps: normalizeStringArray(rawSynthesis?.next_actions?.immediate_steps, 4, 180),
      questions_to_answer: normalizeStringArray(rawSynthesis?.next_actions?.questions_to_answer, 4, 180),
      validation_methods: normalizeStringArray(rawSynthesis?.next_actions?.validation_methods, 4, 180)
    },
    detected_mode: mode
  };
}

addApiRoute('get', '/health', (_req, res) => {
  res.json({ ok: true, flash_model: FLASH_MODEL_NAME, pro_model: PRO_MODEL_NAME });
});

addApiRoute('post', '/interpret-seed', async (req, res) => {
  try {
    const userInput = normalizeSentence(req.body?.userInput, 220);
    if (!userInput) {
      return res.status(400).json({ error: 'userInput is required' });
    }

    const prompt = `Role: You are a precision problem-framing assistant.

User topic:
${JSON.stringify(userInput)}

Task:
1. Rewrite the topic into one concrete thinking objective.
2. Provide exactly 2 guiding questions that clarify what decision or understanding is needed.

Constraints:
- Do not generate solutions or action plans.
- Keep objective under 20 words.
- Keep each guiding question under 18 words.
- Questions must be decision-oriented, not generic.

Return JSON only in this schema:
{
  "objective": "string",
  "guiding_questions": ["string", "string"]
}`;

    const parsed = await runStructuredPrompt(flashModel, prompt, 'object', 0.2);
    const objective = normalizeSentence(parsed?.objective, 220) || `Clarify the best path for ${userInput}`;
    const guidingQuestions = normalizeStringArray(parsed?.guiding_questions, 2, 160);

    while (guidingQuestions.length < 2) {
      const fallbackIndex = guidingQuestions.length + 1;
      guidingQuestions.push(
        fallbackIndex === 1
          ? `What outcome should define success for ${normalizeSentence(userInput, 50)}?`
          : `What constraints matter most before choosing a direction?`
      );
    }

    return res.json({
      objective,
      guiding_questions: guidingQuestions
    });
  } catch (error) {
    console.error('Error in interpret-seed:', error);
    const response = buildApiErrorResponse(error, 'Failed to interpret seed');
    return res.status(response.status).json(response.payload);
  }
});

addApiRoute('post', '/generate-ideas', async (req, res) => {
  try {
    const topic = normalizeSentence(req.body?.topic, 180);
    const context = req.body?.context || {};

    if (!topic) {
      return res.status(400).json({ error: 'topic is required' });
    }

    const objective = normalizeSentence(context.objective, 220);
    const guidingQuestions = normalizeStringArray(context.guiding_questions, 3, 160);
    const parentChain = normalizeStringArray(context.parentChain, 8, 100);

    const contextSection = [
      objective ? `Objective: ${objective}` : null,
      guidingQuestions.length ? `Guiding questions: ${guidingQuestions.join(' | ')}` : null,
      parentChain.length ? `Current path: ${parentChain.join(' -> ')}` : null
    ].filter(Boolean).join('\n');

    const prompt = `Role: You are generating high-quality next-step brainstorm nodes.

${contextSection}

Focus node:
${JSON.stringify(topic)}

Task:
Generate 7 distinct idea nodes that expand the focus node.

Hard constraints:
- Each idea must be one complete thought and under 15 words.
- Avoid repeating wording from the current path.
- Prioritize concrete, testable, or decision-relevant ideas.
- Mix categories. Include at least one: problem, method, application.

Allowed types:
- problem
- method
- application
- assumption
- opportunity

Return JSON array only:
[
  {
    "type": "problem | method | application | assumption | opportunity",
    "content": "string",
    "expandable": true
  }
]`;

    const parsed = await runStructuredPrompt(flashModel, prompt, 'array', 0.7);
    const ideaNodes = normalizeIdeaNodes(parsed, topic);

    return res.json(ideaNodes);
  } catch (error) {
    console.error('Error in generate-ideas:', error);
    const response = buildApiErrorResponse(error, 'Failed to generate ideas');
    return res.status(response.status).json(response.payload);
  }
});

addApiRoute('post', '/cluster-directions', async (req, res) => {
  try {
    const objective = normalizeSentence(req.body?.objective, 220);
    const ideaNodes = normalizeInputIdeas(req.body?.ideaNodes);

    if (ideaNodes.length === 0) {
      return res.json([]);
    }

    if (ideaNodes.length === 1) {
      return res.json([
        {
          direction_id: 'D1',
          title: 'Single Direction',
          summary: 'Only one explored idea is currently available.',
          idea_ids: [ideaNodes[0].id]
        }
      ]);
    }

    const nodesText = ideaNodes.map((node) => `- ${node.id} (${node.type}): ${node.content}`).join('\n');
    const prompt = `Role: You are organizing brainstorm nodes into strategic directions.

Objective:
${JSON.stringify(objective || 'Clarify best direction from explored ideas')}

Idea nodes:
${nodesText}

Task:
Group the nodes into 3 to 5 coherent directions.

Hard constraints:
- Every idea id must appear exactly once.
- Group by strategy/theme, not by literal wording.
- Direction title: maximum 5 words.
- Direction summary: 1-2 sentences.

Return JSON array only:
[
  {
    "title": "string",
    "summary": "string",
    "idea_ids": ["idea_id_1", "idea_id_2"]
  }
]`;

    const parsed = await runStructuredPrompt(flashModel, prompt, 'array', 0.3);
    const directions = normalizeDirections(parsed, ideaNodes);

    return res.json(directions);
  } catch (error) {
    console.error('Error in cluster-directions:', error);
    const response = buildApiErrorResponse(error, 'Failed to cluster directions');
    return res.status(response.status).json(response.payload);
  }
});

addApiRoute('post', '/synthesize', async (req, res) => {
  try {
    const objective = normalizeSentence(req.body?.objective, 240) || 'Clarify the best strategic direction.';
    const directions = Array.isArray(req.body?.directions)
      ? req.body.directions
        .map((direction) => ({
          direction_id: normalizeSentence(direction?.direction_id, 12),
          title: normalizeSentence(direction?.title, 60),
          summary: normalizeSentence(direction?.summary, 220),
          idea_ids: normalizeStringArray(direction?.idea_ids, 20, 80)
        }))
        .filter((direction) => direction.direction_id && direction.title)
      : [];
    const ideaNodes = normalizeInputIdeas(req.body?.ideaNodes);

    if (!directions.length) {
      return res.status(400).json({ error: 'directions are required before synthesis' });
    }

    const ideaMap = new Map(ideaNodes.map((node) => [node.id, node]));
    const directionsText = directions.map((direction) => {
      const lines = direction.idea_ids
        .map((ideaId) => ideaMap.get(ideaId))
        .filter(Boolean)
        .map((node) => `- ${node.content} (${node.type})`)
        .join('\n');
      return `${direction.direction_id} | ${direction.title}
Summary: ${direction.summary || 'No summary provided.'}
Ideas:
${lines || '- No matched ideas'}`;
    }).join('\n\n');

    const prompt = `Role: You are a decision-focused synthesis analyst.

Objective:
${JSON.stringify(objective)}

Directions:
${directionsText}

Task:
1. Restate the core goal.
2. Analyze every direction with value, risks, unknowns, and potential.
3. Compare directions and select most promising.
4. Propose concrete next actions.

Potential must be one of: high, medium, low.
Detected mode must be one of: research, startup, product, exploration.

Return JSON only:
{
  "problem_statement": {
    "interpreted_goal": "string",
    "key_assumptions": ["string"]
  },
  "directions_analysis": [
    {
      "direction_id": "D1",
      "value": "string",
      "risks": ["string"],
      "unknowns": ["string"],
      "potential": "high | medium | low"
    }
  ],
  "comparison": {
    "most_promising": "D1",
    "can_be_combined": ["D1", "D2"],
    "should_deprioritize": ["D3"]
  },
  "next_actions": {
    "immediate_steps": ["string"],
    "questions_to_answer": ["string"],
    "validation_methods": ["string"]
  },
  "detected_mode": "research | startup | product | exploration"
}`;

    let parsed;
    try {
      parsed = await runStructuredPrompt(proModel, prompt, 'object', 0.4);
    } catch (proError) {
      console.warn('Pro model synthesis failed; retrying with flash model:', proError.message);
      parsed = await runStructuredPrompt(flashModel, prompt, 'object', 0.4);
    }

    const normalized = normalizeSynthesis(parsed, directions, objective);
    return res.json(normalized);
  } catch (error) {
    console.error('Error in synthesize:', error);
    const response = buildApiErrorResponse(error, 'Failed to generate synthesis');
    return res.status(response.status).json(response.payload);
  }
});

const isDirectRun = process.argv[1]?.endsWith('server.js');
if (isDirectRun) {
  app.listen(PORT, () => {
    console.log(`API server running at http://localhost:${PORT}`);
    console.log(`Gemini models loaded: flash=${FLASH_MODEL_NAME}, pro=${PRO_MODEL_NAME}`);
  });
}

export default app;
