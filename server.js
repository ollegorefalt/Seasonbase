const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

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

function csvEscape(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

function flattenEntry(entry) {
  return {
    id: entry.id || "",
    createdAt: entry.createdAt || "",
    name: entry.name || "",
    email: entry.email || "",
    phone: entry.phone || "",
    season: entry.season || "",
    destinations: (entry.answers?.destinations || []).join("; "),
    otherDestination: entry.answers?.otherDestination || "",
    interests: (entry.answers?.interests || []).join("; "),
    otherInterest: entry.answers?.otherInterest || "",
    jobTypes: (entry.answers?.jobTypes || []).join("; "),
    otherJobType: entry.answers?.otherJobType || "",
    experience: entry.answers?.experience || "",
    housingStatus: entry.answers?.housingStatus || "",
    challenge: entry.answers?.challenge || "",
    formVersion: entry.formVersion || ""
  };
}

function writeCsv(entries) {
  const csvFile = path.join(DATA_DIR, "waitlist.csv");

  const headers = [
    "id",
    "createdAt",
    "name",
    "email",
    "phone",
    "season",
    "destinations",
    "otherDestination",
    "interests",
    "otherInterest",
    "jobTypes",
    "otherJobType",
    "experience",
    "housingStatus",
    "challenge",
    "formVersion"
  ];

  const rows = entries.map(flattenEntry);

  const csvLines = [
    headers.join(","),
    ...rows.map(row =>
      headers.map(header => csvEscape(row[header])).join(",")
    )
  ];

  fs.writeFileSync(csvFile, csvLines.join("\n"), "utf-8");
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "seasonbase-api" });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/waitlist", async (req, res) => {
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

    const payload = {
      name,
      email,
      form_version: formVersion,
      answers: {
        phone,
        season,
        ...answers
      }
    };

    const { data: existingRow, error: selectError } = await supabase
      .from("waitlist_entries")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();

    if (selectError) {
      console.error("Supabase select error:", selectError);
      return res.status(500).json({
        ok: false,
        error: "Could not save waitlist entry"
      });
    }

    if (existingRow) {
      const { error: updateError } = await supabase
        .from("waitlist_entries")
        .update(payload)
        .eq("email", email);

      if (updateError) {
        console.error("Supabase update error:", updateError);
        return res.status(500).json({
          ok: false,
          error: "Could not save waitlist entry"
        });
      }

      return res.status(200).json({
        ok: true,
        message: "Updated existing waitlist entry"
      });
    }

    const { error: insertError } = await supabase
      .from("waitlist_entries")
      .insert([
        {
          id: crypto.randomUUID(),
          ...payload
        }
      ]);

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return res.status(500).json({
        ok: false,
        error: "Could not save waitlist entry"
      });
    }

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

app.get("/api/debug-supabase", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("waitlist_entries")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Debug select error:", error);
      return res.status(500).json({ ok: false, error });
    }

    return res.json({
      ok: true,
      supabaseUrl: process.env.SUPABASE_URL,
      count: data.length,
      rows: data
    });
  } catch (err) {
    console.error("Debug route crash:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
