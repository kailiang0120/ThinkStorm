import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = "AIzaSyBsJJnKEEthTHff70kx3Npq7nR_UYwdbrg";
const genAI = new GoogleGenerativeAI(API_KEY);

// Flash model for quick subtopic generation
const flashModel = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
// Pro model for final content generation
const proModel = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

// Generate subtopics for a given topic (max 5 words each)
export async function generateSubtopics(topic, parentChain = []) {
  const context = parentChain.length > 0 
    ? `Context: The user started with "${parentChain[0]}" and has explored: ${parentChain.join(" → ")}.`
    : "";

  const prompt = `${context}
Generate exactly 5 creative and diverse subtopics for "${topic}" in brainstorming context.

CRITICAL RULES:
- Each subtopic MUST be 5 words or less
- Make them concise but meaningful
- No quotes, no explanations

Return ONLY a JSON array of short strings. Example:
["AI Healthcare", "Green Energy Tech", "Remote Work Tools", "Fintech Solutions", "Smart Agriculture"]`;

  try {
    const result = await flashModel.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Enforce 5 word limit on client side as well
      return parsed.map(item => {
        const words = item.trim().split(/\s+/);
        return words.slice(0, 5).join(" ");
      });
    }
    return ["Innovation", "Technology", "Strategy", "Growth", "Optimization"];
  } catch (error) {
    console.error("Error generating subtopics:", error);
    throw error;
  }
}

// Generate final proposal content
export async function generateFinalContent(thinkingChain) {
  const chainText = thinkingChain.join(" → ");
  
  const prompt = `Based on this brainstorming thinking chain: "${chainText}"

Generate a comprehensive idea proposal that includes:
1. **Executive Summary** - Brief overview of the concept
2. **Problem Statement** - What problem does this solve?
3. **Proposed Solution** - Detailed explanation of the idea
4. **Key Features** - Main features or components
5. **Target Audience** - Who would benefit from this?
6. **Implementation Steps** - How to get started
7. **Potential Challenges** - Risks and mitigation strategies
8. **Success Metrics** - How to measure success
9. **Next Steps** - Immediate action items

Make it detailed, practical, and actionable. Use markdown formatting.`;

  try {
    const result = await proModel.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Error generating content:", error);
    throw error;
  }
}
