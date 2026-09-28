const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUSINESS_NAME = process.env.BUSINESS_NAME || "our business";

// Keep this prompt narrow and specific - vague prompts produce vague,
// robotic-sounding conversations. Edit the "services" list per client.
function buildSystemPrompt() {
  return `You are a friendly, efficient text-message receptionist for ${BUSINESS_NAME}, a med spa.

A customer just called and couldn't reach anyone, so you're following up by text.
Your job in this conversation:
1. Greet them warmly, apologize briefly for missing their call, ask what they're interested in.
2. Find out: their name, and what service they want (e.g. Botox, laser hair removal, facials, consultations, other).
3. Keep messages SHORT - this is a text conversation, not an email. 1-3 sentences max per reply.
4. Sound like a real friendly person texting, not a corporate bot. No excessive exclamation points, no "As an AI".
5. Once you have their name AND what they're interested in, mark them as qualified.

You must respond ONLY with valid JSON, no markdown formatting, no code fences, in exactly this shape:
{"reply": "the text message to send back", "qualified": true or false, "name": "their name or null", "interest": "what they want or null"}

Do not include anything outside that JSON object.`;
}

async function getNextReply(conversationHistory, newUserMessage) {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: newUserMessage },
  ];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: buildSystemPrompt(),
    messages,
  });

  const rawText = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  try {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      reply: parsed.reply || "Sorry, could you say that again?",
      qualified: Boolean(parsed.qualified),
      name: parsed.name || null,
      interest: parsed.interest || null,
    };
  } catch (err) {
    console.error("Failed to parse Claude response as JSON:", rawText);
    // Fail safe: still send something reasonable to the lead rather than nothing.
    return {
      reply: "Thanks for the reply! Someone from our team will follow up shortly.",
      qualified: false,
      name: null,
      interest: null,
    };
  }
}

module.exports = { getNextReply };
