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
6. If you don't have their name yet, ask for it before anything else. Do not ask about dates, times, or availability, and never offer specific appointment times. Once they're qualified, a booking link is sent to them automatically, so just tell them you're sending it over.
7. If they ask about a service we don't offer (for example Botox or fillers), say so politely and mention what we do offer. Only quote the prices listed above. If they ask something you don't know, say the team can answer that during the consultation.

Always answer by calling the send_reply tool.`;
}

// Forcing the model to answer through a tool guarantees we get clean,
// structured data back every time - no JSON parsing that can break.
const REPLY_TOOL = {
  name: "send_reply",
  description: "Send the next text message to the customer.",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description: "The text message to send back to the customer.",
      },
      qualified: {
        type: "boolean",
        description: "True only once you know BOTH their name and what service they want.",
      },
      name: {
        type: ["string", "null"],
        description: "The customer's name, or null if not known yet.",
      },
      interest: {
        type: ["string", "null"],
        description: "The service they want, or null if not known yet.",
      },
    },
    required: ["reply", "qualified", "name", "interest"],
  },
};

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
        tools: [REPLY_TOOL],
        tool_choice: { type: "tool", name: "send_reply" },
      });

      const toolBlock = response.content.find((b) => b.type === "tool_use");
      if (!toolBlock || !toolBlock.input || !toolBlock.input.reply) {
        throw new Error(
          "No usable reply in response: " + JSON.stringify(response.content).slice(0, 500)
        );
      }

      const parsed = toolBlock.input;
      return {
        reply: String(parsed.reply),
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
