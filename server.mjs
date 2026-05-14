import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const env = loadEnv();
const port = Number(env.PORT || 3000);
const apiKey = env.OPENROUTER_API_KEY;
const model = env.OPENROUTER_MODEL || "deepseek/deepseek-chat";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const systemPrompt = `
你是 EDIMAGE WORLD 的互动小说生成引擎。

EDIMAGE WORLD 是一个从“一句话念头”进入的文本开放世界。它不是普通 AI 写作工具，也不是聊天助手。

语言原则：
1. 梦核、克制、诗性、具体、有画面。
2. 不解释功能，不说“作为 AI”。
3. 不写工具说明，不写产品说明。
4. 选择项要像叙事岔路，不要像游戏任务。
5. 每次推进故事，都要产生新的可感知变化。
6. 保持中文输出。
7. 严格返回合法 JSON，不要 Markdown，不要代码块。
`;

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/generate") {
      await handleGenerate(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "EDIMAGE WORLD 暂时没有回应。" });
  }
});

server.listen(port, () => {
  console.log(`EDIMAGE WORLD running at http://localhost:${port}`);
  if (!apiKey || apiKey.includes("PASTE")) {
    console.log("OPENROUTER_API_KEY is not set yet. Add it to .env before using real generation.");
  }
});

async function handleGenerate(req, res) {
  if (!apiKey || apiKey.includes("PASTE")) {
    sendJson(res, 500, { error: "OPENROUTER_API_KEY is missing" });
    return;
  }

  const body = await readJsonBody(req);
  const { stage, payload } = body;
  const prompt = buildPrompt(stage, payload || {});

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "EDIMAGE WORLD"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.86,
      max_tokens: stage === "finalize" ? 1800 : 1100,
      response_format: { type: "json_object" }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("OpenRouter error:", data);
    sendJson(res, response.status, { error: data.error?.message || "OpenRouter request failed" });
    return;
  }

  const content = data.choices?.[0]?.message?.content;
  const parsed = parseJsonContent(content);
  sendJson(res, 200, parsed);
}

function buildPrompt(stage, payload) {
  if (stage === "cards") {
    return `
根据用户想法，为 EDIMAGE WORLD 生成四张抽卡结果。

用户想法：
${payload.idea}

要求：
1. 类型标签 conceptTags 返回 3 个。
2. 体裁 form 从“互动短篇、梦境档案、伪日记、分岔叙事、调查记录、开放小说”中选择或生成相近表达。
3. 类型 genre 要贴近梦核、都市异闻、魔幻现实、心理奇幻、日常怪谈、废墟浪漫等气质。
4. 文风 style 要短，但有质感。
5. explanations 每项都只写一句，短、轻、有画面。

只返回 JSON：
{
  "conceptTags": ["", "", ""],
  "form": "",
  "genre": "",
  "style": "",
  "explanations": {
    "conceptTags": "",
    "form": "",
    "genre": "",
    "style": ""
  }
}
`;
  }

  if (stage === "story_step") {
    return `
继续生成 EDIMAGE WORLD 的互动小说下一轮。

用户最初想法：
${payload.idea}

抽卡结果：
${JSON.stringify(payload.cards)}

体量：
${JSON.stringify(payload.level)}

当前路径：
${JSON.stringify(payload.path)}

已有正文：
${JSON.stringify(payload.paragraphs)}

用户刚刚选择：
${payload.selectedChoice}

当前轮次：
${payload.turn}

要求：
1. text 写 260 到 520 个中文字。
2. 延续已有正文，不要重启故事。
3. choices 返回 3 个选择。
4. 选择项要文学化，像岔路，不要像任务按钮。
5. 如果故事适合结束，shouldEnd 可以为 true；否则 false。

只返回 JSON：
{
  "text": "",
  "choices": ["", "", ""],
  "shouldEnd": false
}
`;
  }

  if (stage === "finalize") {
    return `
把互动小说过程整理成一篇完整小说。

用户最初想法：
${payload.idea}

抽卡结果：
${JSON.stringify(payload.cards)}

体量：
${JSON.stringify(payload.level)}

路径选择：
${JSON.stringify(payload.path)}

正文片段：
${JSON.stringify(payload.paragraphs)}

要求：
1. body 是连贯小说正文，不要保留“用户选择了”这种日志感。
2. 保留梦核、旧录像、琥珀光、小径、文本开放世界的气质。
3. title 要短，有作品感。
4. openingLine 是一句引言。
5. summary 是 80 字以内摘要。

只返回 JSON：
{
  "title": "",
  "openingLine": "",
  "body": "",
  "summary": ""
}
`;
  }

  return JSON.stringify(payload);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = normalize(join(root, requested));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const content = await readFile(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  res.end(content);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function parseJsonContent(content) {
  if (!content) {
    throw new Error("Empty model response");
  }

  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    return { ...process.env };
  }

  const fileEnv = {};
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    fileEnv[key] = value;
  }

  return { ...process.env, ...fileEnv };
}
