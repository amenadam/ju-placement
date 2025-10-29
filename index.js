process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
if (typeof File === "undefined") {
  global.File = class File {}; // temporary polyfill for Node 18
}

require("dotenv").config();

const { Telegraf } = require("telegraf");
const https = require("https");
const cheerio = require("cheerio");
const express = require("express");

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Add middleware to log messages and prevent duplicates
let lastMessageId = null;
let lastProcessingTime = 0;

bot.use(async (ctx, next) => {
  const now = Date.now();
  const messageId = ctx.update?.message?.message_id;

  // Prevent processing the same message twice
  if (
    messageId &&
    messageId === lastMessageId &&
    now - lastProcessingTime < 1000
  ) {
    console.log("🔄 Skipping duplicate message");
    return;
  }

  lastMessageId = messageId;
  lastProcessingTime = now;

  await next();
});

// Error handling for bot
bot.catch((err, ctx) => {
  console.error("Bot Error:", err);
  return ctx.reply("❌ An error occurred. Please try again later.");
});

// Start command
bot.start((ctx) => {
  return ctx.reply(
    "👋 Welcome to JU Placement Checker!\n\nPlease send your *Admission Number* or *ID* to check your placement.",
    { parse_mode: "Markdown" }
  );
});

bot.command("about", (ctx) => {
  ctx.reply(`About
This bot is developed by JU Students Network 🚀

Features:
• Fast & simple access to placement results
• Official data directly fetched from JU portal
• Privacy-first: We do not store your personal info
• 24/7 bot availability

Our mission:
Help JU students receive important updates faster, easier, and stress-free.

For announcements and support, join our community:
📢 JU Students Network Channel
@JUStudentsNetwork
`);
});
// Handle text messages
bot.on("text", async (ctx) => {
  const admissionNumber = ctx.message.text.trim();

  // Validate admission number format
  // if (!/^\d+$/.test(admissionNumber)) {
  // return ctx.reply(
  // "⚠️ Please send only your numeric admission number (digits only)."
  //);
  //}

  // Validate admission number length
  if (admissionNumber.length < 3 || admissionNumber.length > 20) {
    return ctx.reply(
      "⚠️ Please check your admission number format. It should be between 3-20 digits."
    );
  }

  const url = `https://portal.ju.edu.et/freshmanR?AdmissionNumber=${admissionNumber}`;

  try {
    // Send initial message and wait for it to complete
    const processingMsg = await ctx.reply(
      "🔍 Checking your placement, please wait..."
    );

    // HTTPS request with timeout
    const data = await new Promise((resolve, reject) => {
      const req = https.get(url, (response) => {
        // Check if response is successful
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP Error: ${response.statusCode}`));
          return;
        }

        let data = "";
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => resolve(data));
      });

      // Set timeout
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error("Request timeout after 30 seconds"));
      });

      req.on("error", (error) => {
        reject(error);
      });
    });

    // Parse HTML response
    const $ = cheerio.load(data);
    const rows = $("table tbody tr");

    let info = {
      admission: "",
      id: "",
      name: "",
      program: "",
      section: "",
      campus: "",
      dorm: "",
      cafe: "",
    };

    // Extract data from table rows
    rows.each((i, el) => {
      const key = $(el).find("td").eq(0).text().trim();
      const value = $(el).find("td").eq(1).text().trim();

      if (key.includes("Admission Number")) info.admission = value;
      if (key.includes("ID No.")) info.id = value;
      if (key.includes("Full Name")) info.name = value;
      if (key.includes("Program")) info.program = value;
      if (key.includes("Section")) info.section = value;
      if (key.includes("Campus Assigned")) info.campus = value;
      if (key.includes("Dormitory")) info.dorm = value.replace(/\s+/g, " ");
      if (key.includes("Cafeteria")) info.cafe = value;
    });

    // Check if admission number was found
    if (!info.name || !info.admission) {
      // Delete the processing message first
      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        console.log("Could not delete processing message");
      }
      return ctx.reply(
        "❌ Admission number not found or invalid. Please check your admission number and try again."
      );
    }

    // Format response message
    const message = `
🎓 *Jimma University Placement Result*

👤 *Name:* ${info.name || "N/A"}
🆔 *ID:* ${info.id || "N/A"}
📘 *Program:* ${info.program || "N/A"}
🧩 *Section:* ${info.section || "N/A"}
🏫 *Campus:* ${info.campus || "N/A"}
🛏️ *Dormitory:* ${info.dorm || "N/A"}
🍽️ *Cafeteria:* ${info.cafe || "N/A"}

*Check more on the portal:* ${url}

*Get more information on @JUStudentsNetwork!*
    `.trim();

    // Delete the processing message first
    try {
      await ctx.deleteMessage(processingMsg.message_id);
    } catch (e) {
      console.log("Could not delete processing message");
    }

    // Send the final result
    return ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Fetch Error:", error.message);

    let errorMessage = "⚠️ Error fetching data. Please try again later.";

    if (error.message.includes("timeout")) {
      errorMessage =
        "⏰ Request timeout. The portal is taking too long to respond. Please try again later.";
    } else if (
      error.message.includes("ENOTFOUND") ||
      error.message.includes("ECONNREFUSED")
    ) {
      errorMessage =
        "🌐 Cannot connect to JU portal. Please check your internet connection and try again.";
    } else if (error.message.includes("404") || error.message.includes("500")) {
      errorMessage =
        "🔧 JU portal is currently unavailable. Please try again later.";
    }

    return ctx.reply(errorMessage);
  }
});

// Health check endpoint for Railway
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "JU Placement Bot is running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "ju-placement-bot",
    timestamp: new Date().toISOString(),
  });
});

// Start server and bot
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🤖 Starting JU Placement Bot...`);

  // Start bot with error handling
  bot
    .launch()
    .then(() => {
      console.log("✅ JU Placement Bot is now running!");
    })
    .catch((error) => {
      console.error("❌ Failed to start bot:", error);
      process.exit(1);
    });
});

// Graceful shutdown
process.once("SIGINT", () => {
  console.log("🛑 Shutting down gracefully...");
  bot.stop("SIGINT");
  process.exit(0);
});

process.once("SIGTERM", () => {
  console.log("🛑 Shutting down gracefully...");
  bot.stop("SIGTERM");
  process.exit(0);
});
