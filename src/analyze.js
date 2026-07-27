require("dotenv").config();

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function buildPrompt({ ticker, quote, news }) {
  const newsLines = (news || [])
    .slice(0, 10)
    .map((n) => `- ${n.title}${n.source ? ` (${n.source})` : ""}`)
    .join("\n");

  return `Ticker: ${ticker}
Name: ${quote?.name || "unknown"}
Price: ${quote?.price ?? "n/a"} ${quote?.currency || ""}
Previous close: ${quote?.previousClose ?? "n/a"}
52-week range: ${quote?.fiftyTwoWeekLow ?? "n/a"} - ${quote?.fiftyTwoWeekHigh ?? "n/a"}
Market cap: ${quote?.marketCap ?? "n/a"}
Trailing P/E: ${quote?.trailingPE ?? "n/a"}
Forward P/E: ${quote?.forwardPE ?? "n/a"}
Revenue growth: ${quote?.revenueGrowth ?? "n/a"}
Profit margins: ${quote?.profitMargins ?? "n/a"}
Sector / industry: ${quote?.sector ?? "n/a"} / ${quote?.industry ?? "n/a"}

Recent headlines:
${newsLines || "(no recent headlines found)"}

Write a short, neutral analysis (200-300 words) covering: what the company/index does, what the current financial snapshot suggests, and what themes the recent news points to. Do not give a buy/sell/hold recommendation or personalized investment advice — describe what the data shows and note key uncertainties or risks instead.`;
}

async function analyze({ ticker, quote, news }) {
  if (!isConfigured()) {
    return {
      available: false,
      message:
        "AI summary isn't configured yet. Add ANTHROPIC_API_KEY to the .env file in this project and restart the server to enable it.",
    };
  }

  let Anthropic;
  try {
    Anthropic = require("@anthropic-ai/sdk");
  } catch {
    return { available: false, message: "@anthropic-ai/sdk is not installed." };
  }

  const client = new (Anthropic.default || Anthropic)({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system:
      "You are a neutral financial analysis assistant. You summarize publicly available data and news. You never give personalized investment advice or explicit buy/sell/hold recommendations.",
    messages: [{ role: "user", content: buildPrompt({ ticker, quote, news }) }],
  });

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return { available: true, summary: text };
}

module.exports = { analyze, isConfigured };
