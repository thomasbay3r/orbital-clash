# NanoBanana MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone MCP server that wraps nanobananaapi.ai for image generation/editing, registered globally in Claude Code.

**Architecture:** TypeScript MCP server using `@modelcontextprotocol/sdk` with StdioServerTransport. Three tools: generate_image, edit_image, get_credits. Async API calls with automatic polling until image is ready, then download and save locally.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, `zod`

**Design Doc:** `docs/plans/2026-02-23-nanobanana-mcp-server-design.md`

---

## Task 1: Initialize Project

**Files:**
- Create: `C:\Users\thoma\OneDrive\Dokumente\GitHub\nanobanana-mcp\package.json`
- Create: `C:\Users\thoma\OneDrive\Dokumente\GitHub\nanobanana-mcp\tsconfig.json`

**Step 1: Create project directory and init**

```bash
mkdir -p "C:\Users\thoma\OneDrive\Dokumente\GitHub\nanobanana-mcp"
cd "C:\Users\thoma\OneDrive\Dokumente\GitHub\nanobanana-mcp"
git init
```

**Step 2: Create package.json**

```json
{
  "name": "nanobanana-mcp",
  "version": "1.0.0",
  "description": "MCP server for NanoBanana image generation API",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch"
  }
}
```

**Step 3: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

**Step 5: Commit**

```bash
git add package.json tsconfig.json package-lock.json
git commit -m "chore: init nanobanana-mcp project"
```

---

## Task 2: Build API Client

**Files:**
- Create: `C:\Users\thoma\OneDrive\Dokumente\GitHub\nanobanana-mcp\src\api.ts`

**Step 1: Write the API client**

```typescript
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const BASE_URL = "https://api.nanobananaapi.ai/api/v1";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120000;

function getApiKey(): string {
  const key = process.env.NANOBANANA_API_KEY;
  if (!key) throw new Error("NANOBANANA_API_KEY environment variable is not set");
  return key;
}

function headers(): Record<string, string> {
  return {
    "Authorization": `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

interface GenerateRequest {
  prompt: string;
  type: "TEXTTOIAMGE" | "IMAGETOIAMGE";
  numImages?: number;
  imageUrls?: string[];
  image_size?: string;
  callBackUrl: string;
}

interface GenerateResponse {
  code: number;
  msg: string;
  data: { taskId: string };
}

interface TaskRecord {
  taskId: string;
  response: {
    originImageUrl?: string;
    resultImageUrl?: string;
  };
  successFlag: number;
  errorCode: number;
  errorMessage: string;
}

interface TaskResponse {
  code: number;
  msg: string;
  data: TaskRecord;
}

interface CreditResponse {
  code: number;
  msg: string;
  data: number;
}

export async function submitGeneration(req: GenerateRequest): Promise<string> {
  const res = await fetch(`${BASE_URL}/nanobanana/generate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Generate API error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as GenerateResponse;
  if (json.code !== 200) {
    throw new Error(`Generate API error: ${json.msg}`);
  }
  return json.data.taskId;
}

export async function pollTask(taskId: string): Promise<TaskRecord> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await fetch(`${BASE_URL}/nanobanana/record-info?taskId=${taskId}`, {
      headers: headers(),
    });
    if (!res.ok) {
      throw new Error(`Poll API error ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as TaskResponse;
    const record = json.data;

    if (record.successFlag === 1) return record;
    if (record.successFlag === 2) throw new Error("Task creation failed");
    if (record.successFlag === 3) throw new Error(`Generation failed: ${record.errorMessage}`);

    // successFlag === 0 means still processing
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Polling timed out after ${POLL_TIMEOUT_MS / 1000}s for task ${taskId}`);
}

export async function downloadImage(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
}

export async function getCredits(): Promise<number> {
  const res = await fetch(`${BASE_URL}/common/credit`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Credits API error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as CreditResponse;
  if (json.code !== 200) throw new Error(`Credits API error: ${json.msg}`);
  return json.data;
}
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: No errors

**Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat: add NanoBanana API client"
```

---

## Task 3: Build MCP Server with Tools

**Files:**
- Create: `C:\Users\thoma\OneDrive\Dokumente\GitHub\nanobanana-mcp\src\index.ts`

**Step 1: Write the MCP server with all tools**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve, isAbsolute } from "node:path";
import { submitGeneration, pollTask, downloadImage, getCredits } from "./api.js";

const server = new McpServer({
  name: "nanobanana",
  version: "1.0.0",
});

server.tool(
  "generate_image",
  "Generate an image from a text prompt using NanoBanana AI. Returns the local file path of the saved image.",
  {
    prompt: z.string().describe("Text description of the image to generate"),
    output_path: z.string().describe("File path to save the image (relative to CWD or absolute), e.g. 'public/images/hero.png'"),
    num_images: z.number().min(1).max(4).default(1).describe("Number of images to generate (1-4)").optional(),
    image_size: z.enum(["1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9"]).describe("Aspect ratio").optional(),
  },
  async ({ prompt, output_path, num_images, image_size }) => {
    try {
      const taskId = await submitGeneration({
        prompt,
        type: "TEXTTOIAMGE",
        numImages: num_images ?? 1,
        image_size,
        callBackUrl: "https://none.invalid",
      });

      const record = await pollTask(taskId);
      const imageUrl = record.response.resultImageUrl;
      if (!imageUrl) throw new Error("No result image URL in response");

      const absPath = isAbsolute(output_path) ? output_path : resolve(process.cwd(), output_path);
      await downloadImage(imageUrl, absPath);

      return {
        content: [
          { type: "text", text: `Image saved to: ${absPath}\nSource URL: ${imageUrl}\nTask ID: ${taskId}` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "edit_image",
  "Edit an existing image using a text prompt via NanoBanana AI. Provide the URL of the source image.",
  {
    prompt: z.string().describe("Text description of the edits to make"),
    image_url: z.string().url().describe("URL of the image to edit"),
    output_path: z.string().describe("File path to save the result (relative to CWD or absolute)"),
  },
  async ({ prompt, image_url, output_path }) => {
    try {
      const taskId = await submitGeneration({
        prompt,
        type: "IMAGETOIAMGE",
        imageUrls: [image_url],
        callBackUrl: "https://none.invalid",
      });

      const record = await pollTask(taskId);
      const resultUrl = record.response.resultImageUrl;
      if (!resultUrl) throw new Error("No result image URL in response");

      const absPath = isAbsolute(output_path) ? output_path : resolve(process.cwd(), output_path);
      await downloadImage(resultUrl, absPath);

      return {
        content: [
          { type: "text", text: `Edited image saved to: ${absPath}\nSource URL: ${resultUrl}\nTask ID: ${taskId}` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_credits",
  "Check the remaining NanoBanana API credit balance.",
  {},
  async () => {
    try {
      const credits = await getCredits();
      return {
        content: [{ type: "text", text: `Remaining credits: ${credits}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

**Step 2: Build the project**

```bash
npm run build
```
Expected: Compiles successfully, creates `dist/index.js` and `dist/api.js`

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add MCP server with generate_image, edit_image, get_credits tools"
```

---

## Task 4: Build, Register Globally, and Test

**Step 1: Build final**

```bash
cd "C:\Users\thoma\OneDrive\Dokumente\GitHub\nanobanana-mcp"
npm run build
```

**Step 2: Register in Claude global settings**

Add to `C:\Users\thoma\.claude\settings.json` under `mcpServers`:

```json
{
  "nanobanana": {
    "command": "node",
    "args": ["C:\\Users\\thoma\\OneDrive\\Dokumente\\GitHub\\nanobanana-mcp\\dist\\index.js"],
    "env": { "NANOBANANA_API_KEY": "<USER_PROVIDES_KEY>" }
  }
}
```

**Important:** Ask the user for their API key before writing it to the config file.

**Step 3: Test manually**

After restarting Claude Code, test:
1. `get_credits` — should return remaining credits
2. `generate_image` with a simple prompt — should save image to specified path

**Step 4: Commit everything**

```bash
git add .
git commit -m "feat: nanobanana-mcp server ready for use"
```

---

## Task 5: Add .gitignore and README

**Files:**
- Create: `C:\Users\thoma\OneDrive\Dokumente\GitHub\nanobanana-mcp\.gitignore`

**Step 1: Create .gitignore**

```
node_modules/
dist/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add gitignore"
```
