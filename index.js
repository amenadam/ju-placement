process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const cheerio = require("cheerio");

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) =>
  ctx.reply(
    "👋 Welcome to JU Placement Checker!\n\nPlease send your *Admission Number* to check your placement.",
    { parse_mode: "Markdown" }
  )
);

bot.on("text", async (ctx) => {
  const admissionNumber = ctx.message.text.trim();

  // Validate admission number
  if (!/^\d+$/.test(admissionNumber)) {
    return ctx.reply("⚠️ Please send only your numeric admission number.");
  }

  const url = `https://portal.ju.edu.et/freshmanR?AdmissionNumber=${admissionNumber}`;

  try {
    ctx.reply("🔍 Checking your placement, please wait...");

    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const rows = $("table tbody tr");

    let info = {};

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

    if (!info.name) {
      return ctx.reply(
        "❌ Admission number not found. Please check and try again."
      );
    }

    const message = `
🎓 *Jimma University Placement Result*

👤 *Name:* ${info.name}
🆔 *ID:* ${info.id}
📘 *Program:* ${info.program}
🧩 *Section:* ${info.section}
🏫 *Campus:* ${info.campus}
🛏️ *Dormitory:* ${info.dorm}
🍽️ *Cafeteria:* ${info.cafe}

👉 click here to see on portal: ${url}

*Get more information on @JUStudentsNetwork!*
`;
    ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error(error);
    ctx.reply("⚠️ Error fetching data. Please try again later.");
  }
});

bot.launch();
