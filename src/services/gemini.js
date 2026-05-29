/**
 * Gemini API Service (Frontend)
 * All API calls now go through our backend proxy to keep the API key secure
 */

const API_BASE = '/api';
const API_REQUEST_TOKEN = import.meta.env.VITE_API_REQUEST_TOKEN || '';

async function readApiError(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Ignore parse errors and fall back to status text.
  }

  const errorText = typeof payload?.error === "string" ? payload.error : "";
  const detailsText = typeof payload?.details === "string" ? payload.details : "";

  if (errorText && detailsText) return `${errorText} (${detailsText})`;
  if (errorText) return errorText;
  return `API error: ${response.status}`;
}

async function postJson(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_REQUEST_TOKEN) {
    headers['X-ThinkStorm-Token'] = API_REQUEST_TOKEN;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return await response.json();
}

/**
 * Stage 1 — Seed Interpretation
 * Converts user input into clear thinking objective and guiding questions
 */
export async function interpretSeed(userInput) {
  return await postJson('/interpret-seed', { userInput });
}

/**
 * Stage 2 — Idea Node Generation
 * Generates meaningful thinking units (Idea Nodes)
 */
export async function generateIdeaNodes(topic, context = {}) {
  return await postJson('/generate-ideas', { topic, context });
}

/**
 * Stage 3 — Direction Clustering
 * Groups idea nodes into coherent directions
 */
export async function clusterIntoDirections(ideaNodes, objective) {
  return await postJson('/cluster-directions', { ideaNodes, objective });
}

/**
 * Stage 4 — Synthesis Engine
 * Generates decision-oriented synthesis report
 */
export async function generateSynthesis(objective, directions, ideaNodes) {
  return await postJson('/synthesize', { objective, directions, ideaNodes });
}

/**
 * Legacy function - Generate subtopics (for backward compatibility)
 */
export async function generateSubtopics(topic, parentChain = []) {
  try {
    const ideaNodes = await generateIdeaNodes(topic, { parentChain });
    return ideaNodes.map(node => node.content);
  } catch (error) {
    console.error("Error generating subtopics:", error);
    throw error;
  }
}

/**
 * Legacy function - Generate final content (for backward compatibility)
 */
export async function generateFinalContent(thinkingChain) {
  // This uses synthesis internally now
  const objective = thinkingChain[0] || "General exploration";
  const synthesis = await generateSynthesis(objective, [], []);

  // Format as markdown for backward compatibility
  return `# ${synthesis.problem_statement?.interpreted_goal || objective}

## Key Assumptions
${synthesis.problem_statement?.key_assumptions?.map(a => `- ${a}`).join('\n') || '- None identified'}

## Next Actions
${synthesis.next_actions?.immediate_steps?.map(s => `- ${s}`).join('\n') || '- Continue exploration'}

## Questions to Answer
${synthesis.next_actions?.questions_to_answer?.map(q => `- ${q}`).join('\n') || '- What are the next steps?'}
`;
}
