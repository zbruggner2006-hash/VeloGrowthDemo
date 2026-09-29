require("dotenv").config();

const express = require("express");
const twilio = require("twilio");
const { getNextReply } = require("./lib/claude");
const { getConversation, saveConversation, appendLead } = require("./lib/state");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OWNER_PHONE_NUMBER = process.env.OWNER_PHONE_NUMBER;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const CAL_COM_BOOKING_LINK = process.env.CAL_COM_BOOKING_LINK;
const BUSINESS_NAME = process.env.BUSINESS_NAME || "our business";

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Health check - useful for confirming Railway deployed correctly
app.get("/", (req, res) => {
  res.send(`${BUSINESS_NAME} automated receptionist is running.`);
});

// STEP 1: Someone calls the Twilio number.
// Forward the call to the owner's real phone. If they don't pick up in time,
// Twilio moves on to the <Dial> action callback below.
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  if (!OWNER_PHONE_NUMBER) {
    twiml.say("Thanks for calling. We will text you back shortly.");
    res.type("text/xml").send(twiml.toString());
    return;
  }

  const dial = twiml.dial({
    timeout: 8, // seconds before it counts as "missed"
    action: "/voice/status",
    callerId: TWILIO_PHONE_NUMBER,
  });
  dial.number(OWNER_PHONE_NUMBER);

  res.type("text/xml").send(twiml.toString());
});

// STEP 2: Did the owner actually pick up? If not, text the caller immediately.
app.post("/voice/status", async (req, res) => {
  const dialCallStatus = req.body.DialCallStatus; // "completed" | "no-answer" | "busy" | "failed"
  const callerNumber = req.body.From;
console.log(`[/voice/status] DialCallStatus=${dialCallStatus} From=${callerNumber} To=${req.body.To}`);

  const twiml = new twilio.twiml.VoiceResponse();

  const missed = ["no-answer", "busy", "failed"].includes(dialCallStatus);

  if (missed && callerNumber) {
    try {
      await twilioClient.messages.create({
        to: callerNumber,
        from: TWILIO_PHONE_NUMBER,
        body: `Hey! Sorry we missed your call at ${BUSINESS_NAME}. What can we help you with today?`,
      });

      // Seed the conversation so the SMS webhook knows this thread already started
      const conversation = getConversation(callerNumber);
      conversation.messages.push({
        role: "assistant",
        content: `Hey! Sorry we missed your call at ${BUSINESS_NAME}. What can we help you with today?`,
      });
      saveConversation(callerNumber, conversation);
    } catch (err) {
      console.error("Failed to send missed-call text:", err.message);
    }
    twiml.hangup();
  } else {
    // Call connected fine - nothing to do.
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

// STEP 3: Handle the back-and-forth text conversation with the lead.
app.post("/sms", async (req, res) => {
  const fromNumber = req.body.From;
  const incomingText = req.body.Body || "";

  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const conversation = getConversation(fromNumber);

    const result = await getNextReply(conversation.messages, incomingText);

    conversation.messages.push({ role: "user", content: incomingText });
    conversation.messages.push({ role: "assistant", content: result.reply });

    let replyText = result.reply;

    // If just qualified and we haven't sent the booking link yet, attach it now.
    if (result.qualified && !conversation.bookingLinkSent && CAL_COM_BOOKING_LINK) {
      replyText += ` You can grab a time that works here: ${CAL_COM_BOOKING_LINK}`;
      conversation.bookingLinkSent = true;

      appendLead({
        phoneNumber: fromNumber,
        name: result.name,
        interest: result.interest,
      });

      await logLeadToSheet({
        phoneNumber: fromNumber,
        name: result.name,
        interest: result.interest,
      });
    }

    conversation.qualified = conversation.qualified || result.qualified;
    saveConversation(fromNumber, conversation);

    twiml.message(replyText);
  } catch (err) {
    console.error("Error handling incoming SMS:", err.message);
    twiml.message(
      "Thanks for the message! Someone from our team will follow up with you shortly."
    );
  }

  res.type("text/xml").send(twiml.toString());
});

// Optional: log qualified leads to a Google Sheet via a Google Apps Script
// Web App URL, if one is configured. Otherwise leads.json is the record.
async function logLeadToSheet(lead) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
    });
  } catch (err) {
    console.error("Failed to log lead to Google Sheet:", err.message);
  }
}

app.listen(PORT, () => {
  console.log(`${BUSINESS_NAME} receptionist server running on port ${PORT}`);
});
