const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUSINESS_NAME = process.env.BUSINESS_NAME || "our business";

// Keep this prompt narrow and specific - vague prompts produce vague,
// robotic-sounding conversations. Edit the "services" list per client.
function buildSystemPrompt() {
  return `You are a friendly, efficient text-message receptionist for ${BUSINESS_NAME}, a laser and wellness spa.

A customer just called and couldn't reach anyone, so you're following up by text.
Your job in this conversation:
1. Greet them warmly, apologize briefly for missing their call, ask what they're interested in.
2. Find out: their name, and what service they want. Our services are: laser tattoo removal, laser for acne scars and wrinkles, laser removal of benign vascular lesions (all start with a free consultation), and facials and massage ($40-$120). If they're unsure, offer to book a free consultation.
3. Keep messages SHORT - this is a text conversation, not an email. 1-3 sentences max per reply.
4. Sound like a real friendly person texting, not a corporate bot. No excessive exclamation points, no "As an AI".
5. Once you have their name AND what they're interested in, mark them as qualified.

You must respond ONLY with valid JSON, no markdown formatting, no code fences, in exactly this shape:
{"reply": "the text message to send back", "qualified": true or false, "name": "their name or null", "interest": "what they want or null"}

Do not include anything outside that JSON object.`;
}

// Pull the JSON object out of the model's text even if it added extra words
// or code fences around it.
function extractJson(rawText) {
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No JSON object found");
  }
  return JSON.parse(cleaned.slice(first, last + 1));
}

async function getNextReply(conversationHistory, newUserMessage) {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: newUserMessage },
  ];

  // Try up to 3 times so one bad response or a brief API hiccup doesn't
  // send the customer a generic "someone will follow up" message.
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system: buildSystemPrompt(),
        messages,
      });

      const rawText = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      const parsed = extractJson(rawText);
      return {
        reply: parsed.reply || "Sorry, could you say that again?",
        qualified: Boolean(parsed.qualified),
        name: parsed.name || null,
        interest: parsed.interest || null,
        failed: false,
      };
    } catch (err) {
      lastError = err;
      console.error(`getNextReply attempt ${attempt} failed:`, err.message);
    }
  }

  console.error("All attempts failed:", lastError && lastError.message);
  return {
    reply: "Thanks for the reply! Someone from our team will follow up shortly.",
    qualified: false,
    name: null,
    interest: null,
    failed: true,
  };
}

module.exports = { getNextReply };
