import { GoogleGenAI, Type } from '@google/genai';

const IDEA_TYPES = ['problem', 'method', 'application', 'assumption', 'opportunity'];
const IDEA_TYPES_SET = new Set(IDEA_TYPES);
const POTENTIAL_LEVELS_SET = new Set(['high', 'medium', 'low']);
const SYNTHESIS_MODES_SET = new Set(['research', 'startup', 'product', 'exploration']);
const DEFAULT_EXPANSION_LENS = 'directions';
const EXPANSION_LENS_INSTRUCTIONS = {
  directions: 'Generate parallel strategic directions or themes at the same level of abstraction.',
  deeper: 'Go deeper into this idea with mechanisms, details, or root causes at one consistent level.',
  alternatives: 'Generate genuinely different alternatives that pursue the same outcome.',
  risks: 'Identify distinct failure modes, obstacles, or unintended consequences.',
  assumptions: 'Surface distinct assumptions or beliefs that require evidence.',
  applications: 'Generate concrete applications or use cases at the same level of specificity.',
  next_steps: 'Generate concrete next steps, tests, or evidence-gathering actions.'
};

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
];

const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX = 60;
const MAX_BODY_BYTES = 1_000_000; // mirrors express.json({ limit: '1mb' })

/**
 * Best-effort sliding-window rate limiter.
 *
 * This is per-isolate state, so the effective ceiling is (limit x number of
 * live isolates) rather than a hard global cap — Cloudflare spins up isolates
 * per colo and recycles them freely. It still stops the case this is here for:
 * a single client hammering one endpoint on a warm isolate. Swap in a Durable
 * Object or the Workers rate-limiting binding if a strict global cap matters.
 */
const rateLimitBuckets = new Map();

function checkRateLimit(request, env) {
  const windowMs = Number(env.RATE_LIMIT_WINDOW_MS) || DEFAULT_RATE_LIMIT_WINDOW_MS;
  const limit = Number(env.RATE_LIMIT_MAX) || DEFAULT_RATE_LIMIT_MAX;
  if (limit <= 0) return { allowed: true };

  const key = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || 'unknown';
  const now = Date.now();
  const hits = (rateLimitBuckets.get(key) || []).filter((time) => now - time < windowMs);

  if (hits.length >= limit) {
    rateLimitBuckets.set(key, hits);
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }

  hits.push(now);
  rateLimitBuckets.set(key, hits);

  // Opportunistic sweep so an isolate that lives a long time cannot grow
  // an unbounded map of stale keys.
  if (rateLimitBuckets.size > 5000) {
    for (const [bucketKey, times] of rateLimitBuckets) {
      if (!times.length || now - times[times.length - 1] >= windowMs) rateLimitBuckets.delete(bucketKey);
    }
  }

  return { allowed: true };
}

function normalizeSentence(value, maxLength = 180) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeStringArray(value, maxItems = 5, maxLength = 160) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeSentence(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

const stringArraySchema = (maxItems = 5) => ({
  type: Type.ARRAY,
  maxItems,
  items: { type: Type.STRING }
});

const seedResponseSchema = {
  type: Type.OBJECT,
  properties: {
    objective: { type: Type.STRING },
    guiding_questions: stringArraySchema(2)
  },
  required: ['objective', 'guiding_questions'],
  propertyOrdering: ['objective', 'guiding_questions']
};

const ideaNodesResponseSchema = {
  type: Type.ARRAY,
  minItems: 3,
  maxItems: 5,
  items: {
    type: Type.OBJECT,
    properties: {
      type: { type: Type.STRING, enum: IDEA_TYPES },
      content: { type: Type.STRING },
      expandable: { type: Type.BOOLEAN }
    },
    required: ['type', 'content', 'expandable'],
    propertyOrdering: ['type', 'content', 'expandable']
  }
};

const directionsResponseSchema = {
  type: Type.ARRAY,
  maxItems: 5,
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      summary: { type: Type.STRING },
      idea_ids: stringArraySchema(20)
    },
    required: ['title', 'summary', 'idea_ids'],
    propertyOrdering: ['title', 'summary', 'idea_ids']
  }
};

const synthesisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    problem_statement: {
      type: Type.OBJECT,
      properties: {
        interpreted_goal: { type: Type.STRING },
        key_assumptions: stringArraySchema(4)
      },
      required: ['interpreted_goal', 'key_assumptions'],
      propertyOrdering: ['interpreted_goal', 'key_assumptions']
    },
    directions_analysis: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          direction_id: { type: Type.STRING },
          value: { type: Type.STRING },
          risks: stringArraySchema(4),
          unknowns: stringArraySchema(4),
          potential: { type: Type.STRING, enum: ['high', 'medium', 'low'] }
        },
        required: ['direction_id', 'value', 'risks', 'unknowns', 'potential'],
        propertyOrdering: ['direction_id', 'value', 'risks', 'unknowns', 'potential']
      }
    },
    comparison: {
      type: Type.OBJECT,
      properties: {
        most_promising: { type: Type.STRING },
        can_be_combined: stringArraySchema(3),
        should_deprioritize: stringArraySchema(3)
      },
      required: ['most_promising', 'can_be_combined', 'should_deprioritize'],
      propertyOrdering: ['most_promising', 'can_be_combined', 'should_deprioritize']
    },
    next_actions: {
      type: Type.OBJECT,
      properties: {
        immediate_steps: stringArraySchema(4),
        questions_to_answer: stringArraySchema(4),
        validation_methods: stringArraySchema(4)
      },
      required: ['immediate_steps', 'questions_to_answer', 'validation_methods'],
      propertyOrdering: ['immediate_steps', 'questions_to_answer', 'validation_methods']
    },
    detected_mode: { type: Type.STRING, enum: ['research', 'startup', 'product', 'exploration'] }
  },
  required: ['problem_statement', 'directions_analysis', 'comparison', 'next_actions', 'detected_mode'],
  propertyOrdering: ['problem_statement', 'directions_analysis', 'comparison', 'next_actions', 'detected_mode']
};

function getAllowedOrigins(env) {
  const configured = env.ALLOWED_ORIGINS || env.CF_PAGES_URL || '';
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...configured.split(',').map((origin) => origin.trim()).filter(Boolean)
  ]);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-ThinkStorm-Token',
    'Vary': 'Origin'
  };

  if (origin && getAllowedOrigins(env).has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function jsonResponse(request, env, status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json'
    }
  });
}

function buildApiErrorResponse(error, fallbackMessage) {
  const message = normalizeSentence(error?.message, 260);
  const status = Number(error?.status);

  if (status === 413) {
    return { status: 413, payload: { error: 'Request body is too large.' } };
  }

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

/**
 * Read the JSON body, refusing anything over the size cap.
 * Throws a tagged error so the route can answer 413 instead of a generic 500.
 */
async function readJsonBody(request) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    const error = new Error('Request body is too large.');
    error.status = 413;
    throw error;
  }

  // Content-Length can be absent (chunked); measure what actually arrives.
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    const error = new Error('Request body is too large.');
    error.status = 413;
    throw error;
  }

  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}

async function runStructuredPrompt(env, modelName, prompt, responseJsonSchema, temperature = 0.4) {
  if (!env.GEMINI_API_KEY) {
    throw new Error('Gemini model is not initialized. Check GEMINI_API_KEY.');
  }

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature
    }
  });

  try {
    return JSON.parse(response.text || 'null');
  } catch (parseError) {
    throw new Error(`Gemini returned invalid structured JSON: ${parseError.message}`);
  }
}

function buildIdeaFallbacks(shortTopic, expansionLens) {
  const fallbacks = {
    directions: [
      { type: 'opportunity', content: `Pursue customer value through ${shortTopic}` },
      { type: 'opportunity', content: `Pursue operational efficiency through ${shortTopic}` },
      { type: 'opportunity', content: `Pursue strategic differentiation through ${shortTopic}` }
    ],
    deeper: [
      { type: 'method', content: `Examine the user behavior driving ${shortTopic}` },
      { type: 'method', content: `Examine the process dynamics driving ${shortTopic}` },
      { type: 'method', content: `Examine the resource constraints shaping ${shortTopic}` }
    ],
    alternatives: [
      { type: 'method', content: `Replace ${shortTopic} with a lower-cost approach` },
      { type: 'method', content: `Replace ${shortTopic} with a human-led approach` },
      { type: 'method', content: `Replace ${shortTopic} with an incremental approach` }
    ],
    risks: [
      { type: 'problem', content: `Adoption could stall around ${shortTopic}` },
      { type: 'problem', content: `Execution bottlenecks could weaken ${shortTopic}` },
      { type: 'problem', content: `${shortTopic} could create unintended consequences` }
    ],
    assumptions: [
      { type: 'assumption', content: `Users genuinely want ${shortTopic}` },
      { type: 'assumption', content: `${shortTopic} is feasible with available resources` },
      { type: 'assumption', content: `Stakeholders will support ${shortTopic}` }
    ],
    applications: [
      { type: 'application', content: `Apply ${shortTopic} in a focused pilot` },
      { type: 'application', content: `Apply ${shortTopic} in an adjacent workflow` },
      { type: 'application', content: `Apply ${shortTopic} where impact is measurable` }
    ],
    next_steps: [
      { type: 'method', content: `Run the smallest useful test of ${shortTopic}` },
      { type: 'method', content: `Gather evidence from affected users of ${shortTopic}` },
      { type: 'method', content: `Define a decision checkpoint for ${shortTopic}` }
    ]
  };
  return (fallbacks[expansionLens] || fallbacks[DEFAULT_EXPANSION_LENS])
    .map((node) => ({ ...node, expandable: true }));
}

function normalizeIdeaNodes(rawNodes, topic, expansionLens = DEFAULT_EXPANSION_LENS) {
  const shortTopic = normalizeSentence(topic, 40) || 'this topic';
  const fallback = buildIdeaFallbacks(shortTopic, expansionLens);

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
    if (unique.length >= 3) return;
    const dedupeKey = node.content.toLowerCase();
    if (seenContent.has(dedupeKey)) return;
    seenContent.add(dedupeKey);
    unique.push({
      id: `idea_${unique.length + 1}`,
      ...node
    });
  });

  return unique.slice(0, 5);
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

function normalizeSynthesis(rawSynthesis, directions, objective, evaluation = null) {
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
  const filterDirectionList = (value) => (
    Array.isArray(value) ? value.filter((id) => directionIdSet.has(id)).slice(0, 3) : []
  );
  const fallbackMostPromising = directionsAnalysis.find((item) => item.potential === 'high')?.direction_id
    || directionIds[0]
    || 'D1';
  const selectedDirectionId = directionIdSet.has(evaluation?.selected_direction_id)
    ? evaluation.selected_direction_id
    : null;
  const mostPromising = selectedDirectionId
    || (directionIdSet.has(rawSynthesis?.comparison?.most_promising)
    ? rawSynthesis.comparison.most_promising
    : fallbackMostPromising);

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
    detected_mode: SYNTHESIS_MODES_SET.has(rawSynthesis?.detected_mode)
      ? rawSynthesis.detected_mode
      : 'exploration'
  };
}

async function interpretSeed(request, env) {
  const body = await readJsonBody(request);
  const userInput = normalizeSentence(body?.userInput, 220);
  if (!userInput) return { status: 400, payload: { error: 'userInput is required' } };

  const prompt = `You are a precision problem-framing assistant.

User topic:
${JSON.stringify(userInput)}

Do two things:
1. Rewrite the topic into ONE concrete thinking objective — what the user is really trying to decide or understand.
2. Write exactly 2 sharp, decision-oriented guiding questions.

Rules:
- Do not propose solutions or action plans.
- Objective under 20 words; each question under 18 words.
- Questions must be specific to this topic, never generic filler.

Return JSON only:
{
  "objective": "string",
  "guiding_questions": ["string", "string"]
}`;

  const parsed = await runStructuredPrompt(
    env,
    env.GEMINI_FLASH_MODEL || env.GEMINI_MODEL || 'gemini-3-flash-preview',
    prompt,
    seedResponseSchema,
    0.2
  );
  const objective = normalizeSentence(parsed?.objective, 220) || `Clarify the best path for ${userInput}`;
  const guidingQuestions = normalizeStringArray(parsed?.guiding_questions, 2, 160);

  while (guidingQuestions.length < 2) {
    guidingQuestions.push(
      guidingQuestions.length === 0
        ? `What outcome should define success for ${normalizeSentence(userInput, 50)}?`
        : 'What constraints matter most before choosing a direction?'
    );
  }

  return { status: 200, payload: { objective, guiding_questions: guidingQuestions } };
}

async function generateIdeas(request, env) {
  const body = await readJsonBody(request);
  const topic = normalizeSentence(body?.topic, 180);
  const context = body?.context || {};
  if (!topic) return { status: 400, payload: { error: 'topic is required' } };

  const objective = normalizeSentence(context.objective, 220);
  const guidingQuestions = normalizeStringArray(context.guiding_questions, 3, 160);
  const parentChain = normalizeStringArray(context.parentChain, 8, 100);
  const requestedLens = normalizeSentence(context.expansion_lens, 40);
  const expansionLens = Object.prototype.hasOwnProperty.call(EXPANSION_LENS_INSTRUCTIONS, requestedLens)
    ? requestedLens
    : DEFAULT_EXPANSION_LENS;
  const lensInstruction = EXPANSION_LENS_INSTRUCTIONS[expansionLens];
  const contextSection = [
    objective ? `Objective: ${objective}` : null,
    guidingQuestions.length ? `Guiding questions: ${guidingQuestions.join(' | ')}` : null,
    parentChain.length ? `Current path: ${parentChain.join(' -> ')}` : null
  ].filter(Boolean).join('\n');

  const prompt = `You are an elite brainstorming partner. You expand one idea into sharp, surprising, decision-ready branches.

${contextSection}

Focus node:
${JSON.stringify(topic)}

Expansion lens: ${expansionLens}
${lensInstruction}

Generate 3 to 5 idea nodes that branch from the focus node. Stop when additional ideas would be repetitive or weaker.

Rules:
- Each idea is ONE crisp, self-contained thought, under 14 words.
- Every child must answer the selected expansion lens.
- Keep all children parallel: the same abstraction level and the same kind of relationship to the parent.
- Do not mix causes, solutions, risks, applications, and next steps in one sibling set unless the selected lens asks for that kind.
- Make the ideas meaningfully different from each other, with no overlap.
- Be concrete and specific; never vague or generic.
- Favor ideas that are testable, provocative, or directly decision-relevant.
- Do not echo wording already used in the current path.
- Assign the most accurate type to each idea as metadata only. There is no required type mix.

Allowed types: problem, method, application, assumption, opportunity.

Return a JSON array of 3 to 5 objects, each:
{ "type": "problem | method | application | assumption | opportunity", "content": "string", "expandable": true }`;

  const parsed = await runStructuredPrompt(
    env,
    env.GEMINI_FLASH_MODEL || env.GEMINI_MODEL || 'gemini-3-flash-preview',
    prompt,
    ideaNodesResponseSchema,
    0.7
  );
  return { status: 200, payload: normalizeIdeaNodes(parsed, topic, expansionLens) };
}

async function clusterDirections(request, env) {
  const body = await readJsonBody(request);
  const objective = normalizeSentence(body?.objective, 220);
  const ideaNodes = normalizeInputIdeas(body?.ideaNodes);

  if (ideaNodes.length === 0) return { status: 200, payload: [] };
  if (ideaNodes.length === 1) {
    return {
      status: 200,
      payload: [{
        direction_id: 'D1',
        title: 'Single Direction',
        summary: 'Only one explored idea is currently available.',
        idea_ids: [ideaNodes[0].id]
      }]
    };
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

  const parsed = await runStructuredPrompt(
    env,
    env.GEMINI_FLASH_MODEL || env.GEMINI_MODEL || 'gemini-3-flash-preview',
    prompt,
    directionsResponseSchema,
    0.3
  );
  return { status: 200, payload: normalizeDirections(parsed, ideaNodes) };
}

async function synthesize(request, env) {
  const body = await readJsonBody(request);
  const objective = normalizeSentence(body?.objective, 240) || 'Clarify the best strategic direction.';
  const directions = Array.isArray(body?.directions)
    ? body.directions
      .map((direction) => ({
        direction_id: normalizeSentence(direction?.direction_id, 12),
        title: normalizeSentence(direction?.title, 60),
        summary: normalizeSentence(direction?.summary, 220),
        idea_ids: normalizeStringArray(direction?.idea_ids, 80, 80)
      }))
      .filter((direction) => direction.direction_id && direction.title)
    : [];
  const ideaNodes = normalizeInputIdeas(body?.ideaNodes);
  const rawEvaluation = body?.evaluation && typeof body.evaluation === 'object' ? body.evaluation : {};
  const evaluation = {
    selected_direction_id: normalizeSentence(rawEvaluation.selected_direction_id, 12),
    criteria: Array.isArray(rawEvaluation.criteria)
      ? rawEvaluation.criteria
        .map((criterion) => ({
          label: normalizeSentence(criterion?.label, 80),
          weight: Math.min(5, Math.max(1, Number(criterion?.weight) || 1))
        }))
        .filter((criterion) => criterion.label)
        .slice(0, 8)
      : [],
    scores: rawEvaluation.scores && typeof rawEvaluation.scores === 'object'
      ? Object.fromEntries(Object.entries(rawEvaluation.scores).slice(0, 12).map(([directionId, values]) => [
        normalizeSentence(directionId, 12),
        values && typeof values === 'object'
          ? Object.fromEntries(Object.entries(values).slice(0, 12).map(([criterionId, score]) => [
            normalizeSentence(criterionId, 40),
            Math.min(5, Math.max(1, Number(score) || 1))
          ]))
          : {}
      ]))
      : {}
  };

  if (!directions.length) {
    return { status: 400, payload: { error: 'directions are required before synthesis' } };
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

User evaluation:
${JSON.stringify(evaluation)}

Task:
1. Restate the core goal.
2. Analyze every direction with value, risks, unknowns, and potential.
3. Compare directions and select most promising.
4. Propose concrete next actions.
5. Treat the user's selected direction and weighted criteria as the decision context. Analyze alternatives honestly, but keep the selected direction as the recommended direction unless the user selection is clearly unsupported.

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
    parsed = await runStructuredPrompt(
      env,
      env.GEMINI_PRO_MODEL || env.GEMINI_MODEL || 'gemini-3-flash-preview',
      prompt,
      synthesisResponseSchema,
      0.4
    );
  } catch {
    parsed = await runStructuredPrompt(
      env,
      env.GEMINI_FLASH_MODEL || env.GEMINI_MODEL || 'gemini-3-flash-preview',
      prompt,
      synthesisResponseSchema,
      0.4
    );
  }

  return { status: 200, payload: normalizeSynthesis(parsed, directions, objective, evaluation) };
}

/** Length-independent, constant-time string comparison. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function validateRequestToken(request, env, path) {
  // Parenthesised: the health check is exempt, and so is an unset token.
  if (!env.API_REQUEST_TOKEN) return true;
  if (request.method === 'GET' && path === '/health') return true;

  const authHeader = request.headers.get('Authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return safeEqual(request.headers.get('X-ThinkStorm-Token') || bearerToken, env.API_REQUEST_TOKEN);
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '/') || '/';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (!validateRequestToken(request, env, path)) {
    return jsonResponse(request, env, 401, { error: 'Missing or invalid request token.' });
  }

  // Every Gemini-backed route costs quota, so meter them. /health stays free.
  if (path !== '/health') {
    const { allowed, retryAfter } = checkRateLimit(request, env);
    if (!allowed) {
      const response = jsonResponse(request, env, 429, {
        error: 'Too many requests. Please wait before asking Gemini for more output.'
      });
      response.headers.set('Retry-After', String(retryAfter));
      return response;
    }
  }

  try {
    if (request.method === 'GET' && path === '/health') {
      return jsonResponse(request, env, 200, {
        ok: true,
        flash_model: env.GEMINI_FLASH_MODEL || env.GEMINI_MODEL || 'gemini-3-flash-preview',
        pro_model: env.GEMINI_PRO_MODEL || env.GEMINI_MODEL || 'gemini-3-flash-preview'
      });
    }

    const routes = {
      '/interpret-seed': interpretSeed,
      '/generate-ideas': generateIdeas,
      '/cluster-directions': clusterDirections,
      '/synthesize': synthesize
    };

    const handler = routes[path];
    if (request.method !== 'POST' || !handler) {
      return jsonResponse(request, env, 404, { error: 'API route not found' });
    }

    const result = await handler(request, env);
    return jsonResponse(request, env, result.status, result.payload);
  } catch (error) {
    const fallback = path === '/interpret-seed'
      ? 'Failed to interpret seed'
      : path === '/generate-ideas'
        ? 'Failed to generate ideas'
        : path === '/cluster-directions'
          ? 'Failed to cluster directions'
          : 'Failed to generate synthesis';
    const response = buildApiErrorResponse(error, fallback);
    return jsonResponse(request, env, response.status, response.payload);
  }
}
