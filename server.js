const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Enkel CORS om frontend och backend körs separat
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "waitlist.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), "utf-8");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function readEntries() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeEntries(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/waitlist", (req, res) => {
  try {
    const body = req.body || {};

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const season = String(body.season || "").trim();
    const formVersion = String(body.formVersion || "v1");

    if (!name) {
      return res.status(400).json({ ok: false, error: "Name is required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "Valid email is required" });
    }

    const reservedKeys = new Set([
      "name",
      "email",
      "phone",
      "season",
      "formVersion"
    ]);

    const answers = {};

    for (const [key, value] of Object.entries(body)) {
      if (!reservedKeys.has(key)) {
        answers[key] = value;
      }
    }

    const entries = readEntries();

    const duplicate = entries.find(
      (entry) => entry.email.toLowerCase() === email.toLowerCase()
    );

    if (duplicate) {
      return res.status(409).json({
        ok: false,
        error: "This email is already on the waitlist"
      });
    }

    const newEntry = {
      id: crypto.randomUUID(),
      name,
      email,
      phone,
      season,
      formVersion,
      answers,
      createdAt: new Date().toISOString()
    };

    entries.push(newEntry);
    writeEntries(entries);

    return res.status(201).json({
      ok: true,
      message: "Saved to waitlist"
    });
  } catch (error) {
    console.error("Error saving waitlist entry:", error);
    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
