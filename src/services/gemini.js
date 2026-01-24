/**
 * Gemini API Service (Frontend)
 * All API calls now go through our backend proxy to keep the API key secure
 */

const API_BASE = '/api';

/**
 * Stage 1 — Seed Interpretation
 * Converts user input into clear thinking objective and guiding questions
 */
export async function interpretSeed(userInput) {
  try {
    const response = await fetch(`${API_BASE}/interpret-seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userInput })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error interpreting seed:", error);
    throw error;
  }
}

/**
 * Stage 2 — Idea Node Generation
 * Generates meaningful thinking units (Idea Nodes)
 */
export async function generateIdeaNodes(topic, context = {}) {
  try {
    const response = await fetch(`${API_BASE}/generate-ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, context })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error generating idea nodes:", error);
    throw error;
  }
}

/**
 * Stage 3 — Direction Clustering
 * Groups idea nodes into coherent directions
 */
export async function clusterIntoDirections(ideaNodes, objective) {
  try {
    const response = await fetch(`${API_BASE}/cluster-directions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaNodes, objective })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error clustering directions:", error);
    throw error;
  }
}

/**
 * Stage 4 — Synthesis Engine
 * Generates decision-oriented synthesis report
 */
export async function generateSynthesis(objective, directions, ideaNodes) {
  try {
    const response = await fetch(`${API_BASE}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objective, directions, ideaNodes })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error generating synthesis:", error);
    throw error;
  }
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
