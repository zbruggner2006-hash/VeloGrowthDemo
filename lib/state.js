// Simple file-based persistence. Good enough for an MVP with a handful of
// clients. If this grows past a few hundred leads/month, swap this for a
// real database (Postgres on Railway is an easy upgrade later).

const fs = require("fs");
const path = require("path");

const CONVERSATIONS_FILE = path.join(__dirname, "..", "conversations.json");
const LEADS_FILE = path.join(__dirname, "..", "leads.json");

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err.message);
    return {};
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to write ${filePath}:`, err.message);
  }
}

// --- Conversation state (per phone number) ---

function getConversation(phoneNumber) {
  const all = readJsonFile(CONVERSATIONS_FILE);
  return (
    all[phoneNumber] || {
      messages: [], // { role: "user" | "assistant", content: string }
      qualified: false,
      bookingLinkSent: false,
      createdAt: new Date().toISOString(),
    }
  );
}

function saveConversation(phoneNumber, conversation) {
  const all = readJsonFile(CONVERSATIONS_FILE);
  all[phoneNumber] = conversation;
  writeJsonFile(CONVERSATIONS_FILE, all);
}

// --- Leads log (append-only record of every qualified lead) ---

function appendLead(lead) {
  const all = readJsonFile(LEADS_FILE);
  const list = Array.isArray(all.leads) ? all.leads : [];
  list.push({ ...lead, loggedAt: new Date().toISOString() });
  writeJsonFile(LEADS_FILE, { leads: list });
}

module.exports = { getConversation, saveConversation, appendLead };
