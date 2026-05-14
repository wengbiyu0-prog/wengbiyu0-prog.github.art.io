import { createServer } from "node:http";
import { appendFile, readFile } from "node:fs/promises";
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
8. 所有卡片、正文和选项必须围绕用户 idea、知识库和当前正文推进。
9. 禁止生成与用户 idea 无关的泛化模板选项。
10. 如果知识库非空，优先吸收知识库的意象、地点、语言和设定。
`;

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/generate") {
      await handleGenerate(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/knowledge") {
      await handleKnowledge(req, res);
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
      "X-OpenRouter-Title": "EDIMAGE WORLD"
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

async function handleKnowledge(req, res) {
  const entry = await readJsonBody(req);
  const safeTitle = String(entry.title || "未命名碎片").replace(/\n/g, " ").trim();
  const safeTags = String(entry.tags || "").replace(/\n/g, " ").trim();
  const safeText = String(entry.text || "").trim();

  if (!safeText) {
    sendJson(res, 400, { error: "Knowledge text is empty" });
    return;
  }

  const block = [
    "",
    `## ${safeTitle}`,
    "",
    "作者：本地用户",
    "权限：个人可用",
    "类型：创意文本",
    `标签：${safeTags}`,
    "",
    "正文：",
    safeText,
    ""
  ].join("\n");

  await appendFile(join(root, "KNOWLEDGE-BASE.md"), block, "utf8");
  sendJson(res, 200, { ok: true });
}

function buildPrompt(stage, payload) {
  const knowledge = buildKnowledgePrompt(payload);
  const easter = buildEasterPrompt(payload);

  if (stage === "cards") {
    return `
根据用户想法，为 EDIMAGE WORLD 生成四张抽卡结果。

用户想法：
${payload.idea}

${knowledge}

要求：
1. 必须根据用户想法推理，不允许返回泛化模板。
2. conceptTags 是最终选中的 3 个类型标签。
3. candidates.conceptTags 返回 3 组候选，每组 3 个标签。
4. candidates.form / genre / style 各返回 3 个候选。
5. 每个候选都必须能解释它与用户 idea 的关系。
6. 体裁 form 可从“互动短篇、梦境档案、伪日记、分岔叙事、调查记录、开放小说”中选择，也可生成更贴切表达。
7. 类型 genre 要贴近用户 idea 的世界倾向。
8. 文风 style 要短，但有质感。
9. explanations 每项都只写一句，短、轻、有画面。

只返回 JSON：
{
  "conceptTags": ["", "", ""],
  "form": "",
  "genre": "",
  "style": "",
  "candidates": {
    "conceptTags": [["", "", ""], ["", "", ""], ["", "", ""]],
    "form": ["", "", ""],
    "genre": ["", "", ""],
    "style": ["", "", ""]
  },
  "explanations": {
    "conceptTags": "",
    "form": "",
    "genre": "",
    "style": ""
  }
}
`;
  }

  if (stage === "story_opening") {
    return `
为 EDIMAGE WORLD 生成互动小说开场。

用户最初想法：
${payload.idea}

抽卡结果：
${JSON.stringify(payload.cards)}

体量：
${JSON.stringify(payload.level)}

${knowledge}

${easter}

要求：
1. text 写 260 到 520 个中文字。
2. 开场必须直接吸收用户 idea 中的具体对象、情境或矛盾。
3. 不要写泛用的“黑暗、光、小径”模板，除非这些意象能和用户 idea 发生具体关系。
4. choices 返回 1 到 4 个选择，数量根据情节点决定。
5. 每个选择必须与开场正文里的具体对象、地点、人物、异常或用户 idea 相关。
6. customInput 根据情节点判断是否开放；不需要时 enabled 为 false。
7. 如果用户 idea 命中彩蛋词，只记录“稍后可插入”，不要在开场暴露彩蛋。

只返回 JSON：
{
  "text": "",
  "choices": ["", "", ""],
  "customInput": {
    "enabled": false,
    "prompt": ""
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

${knowledge}

${easter}

要求：
1. text 写 260 到 520 个中文字。
2. 延续已有正文，不要重启故事。
3. 必须承接用户刚刚选择，尤其是“自定义：”开头的自由输入。
4. choices 返回 1 到 4 个选择，数量由当前情节点决定。
5. 每个选择必须引用或转化当前正文、用户 idea 或知识库中的具体元素。
6. 禁止输出与用户 idea 无关的模板选项。
7. customInput 根据情节点判断是否开放；不是每轮都开放。
8. 如果故事适合结束，shouldEnd 可以为 true；否则 false。
9. 如果彩蛋已在前端插入，本轮必须回到原主线叙事。

只返回 JSON：
{
  "text": "",
  "choices": ["", "", ""],
  "customInput": {
    "enabled": false,
    "prompt": ""
  },
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

${knowledge}

要求：
1. body 是连贯小说正文，不要保留“用户选择了”这种日志感。
2. 优先保留用户 idea 和知识库中真正出现过的意象，不要强行套固定风格。
3. title 要短，有作品感。
4. openingLine 是一句引言。
5. summary 是 80 字以内摘要。
6. 如果路径中出现彩蛋，正文可以用一句极短的异物感痕迹带过，但不要让彩蛋吞掉主线。

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

function buildKnowledgePrompt(payload) {
  const browserKnowledge = String(payload.knowledgeBase || "").trim();
  const fileKnowledge = readOptionalFile("KNOWLEDGE-BASE.md")
    .replace("# EDIMAGE WORLD 知识库", "")
    .trim();
  const combined = [fileKnowledge, browserKnowledge].filter(Boolean).join("\n\n---\n\n").slice(-9000);

  if (!combined || /当前暂无正式知识库条目/.test(combined) && !browserKnowledge) {
    return "知识库状态：当前知识库为空，文本生成完全依赖智能体推理。";
  }

  return `
知识库召回内容：
${combined}

知识库规则：
1. 优先吸收知识库里的意象、地点、语言质地和设定。
2. 不要生硬照抄整段知识库文本。
3. 知识库内容必须服务用户本次 idea，不得抢走主线。
`;
}

function buildEasterPrompt(payload) {
  const library = readOptionalFile("EASTER-EGG-LIBRARY.md").slice(0, 6000);
  if (!payload.easterEgg && !payload.easterEggUsed) {
    return `
彩蛋库：
${library}

彩蛋状态：本次请求未要求插入彩蛋。即使命中彩蛋词，也不要在抽卡或开场阶段提前暴露。
`;
  }

  return `
彩蛋库：
${library}

彩蛋状态：${payload.easterEgg || (payload.easterEggUsed ? "already_used" : "none")}
规则：彩蛋只作为短暂非常规插入，结束后必须回到用户原本的文本主线。
`;
}

function readOptionalFile(name) {
  const filePath = join(root, name);
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf8");
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
