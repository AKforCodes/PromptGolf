/**
 * Offline target-prompt generator.
 *
 * Uses Vertex AI Gemini (ADC) to generate FLUX-ready image prompts for each
 * game category and writes them to src/data/categories.json. Run once at
 * build/seed time, then again whenever you want to refresh the prompt pool.
 *
 *   GCP_PROJECT_ID=... npm run gen:targets
 *
 * Auth: relies on Application Default Credentials. Run `gcloud auth
 * application-default login` once locally, or set GOOGLE_APPLICATION_CREDENTIALS
 * to a service-account key path.
 *
 * NOTE: under src/app/_scripts/ — the underscore prefix marks it as a private
 * folder so Next.js does not turn it into a /_scripts route.
 */
import { VertexAI } from "@google-cloud/vertexai";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION ?? "europe-west2";
const MODEL = process.env.GCP_GEMINI_MODEL ?? "gemini-2.0-flash-001";
const PROMPTS_PER_CATEGORY = Number(process.env.PROMPTS_PER_CATEGORY ?? 5);
const MAX_CHARS = 200;
const MAX_ATTEMPTS_PER_CATEGORY = 4;
const OUTPUT_PATH = resolve(process.cwd(), "src/data/categories.json");

if (!PROJECT_ID) {
  console.error("GCP_PROJECT_ID env var is required.");
  process.exit(1);
}

type CategoryDef = {
  label: string;
  emoji: string;
  guidance: string;
  seedRange: [number, number];
};

const CATEGORIES: Record<string, CategoryDef> = {
  animals: {
    label: "Animals",
    emoji: "🐾",
    guidance:
      "a single real-world animal as the subject. Vary species, environment, lighting, and time of day across prompts.",
    seedRange: [1, 1_000_000],
  },
  landmarks: {
    label: "Landmarks",
    emoji: "🏛️",
    guidance:
      "a globally recognizable man-made or natural landmark (Eiffel Tower, Pyramids, Grand Canyon, etc). Vary location and lighting.",
    seedRange: [1, 1_000_000],
  },
  foods: {
    label: "Foods",
    emoji: "🍔",
    guidance:
      "a single dish or food item, food-photography framing. Vary cuisine, plating, and lighting. Close-up, appetizing.",
    seedRange: [1, 1_000_000],
  },
  nature: {
    label: "Nature",
    emoji: "🌲",
    guidance:
      "a natural landscape with no people and no man-made structures. Vary biome, weather, and time of day.",
    seedRange: [1, 1_000_000],
  },
  characters: {
    label: "Fictional Characters",
    emoji: "🧙",
    guidance:
      "an archetypal fictional character — wizard, pirate, space marine, robot knight, alien explorer, samurai, witch, etc. Generic archetypes only — DO NOT use named IP (no Mickey, Pikachu, Mario, Spider-Man, Harry Potter, etc).",
    seedRange: [1, 1_000_000],
  },
};

type CategoryRecord = {
  label: string;
  emoji: string;
  prompts: string[];
  seedRange: [number, number];
};

function buildInstruction(def: CategoryDef, count: number): string {
  return [
    "You are an expert image-prompt engineer for the FLUX schnell text-to-image model.",
    `Write ${count} distinct prompts to generate images of: ${def.guidance}`,
    "",
    "Hard rules:",
    `- Each prompt MUST be under ${MAX_CHARS} characters.`,
    "- Visual content only: subject, setting, lighting, style, composition.",
    "- No instructions, no commentary, no preambles, no markdown.",
    "- No text-in-image, no real people's faces, no named IP.",
    "- Concrete and renderable. Avoid abstract concepts.",
    `- Output exactly ${count} prompts, one per line. No numbering, bullets, or surrounding quotes.`,
  ].join("\n");
}

function clean(line: string): string {
  return line
    .trim()
    .replace(/^[-*\d.)\s]+/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function extractText(result: Awaited<ReturnType<ReturnType<VertexAI["getGenerativeModel"]>["generateContent"]>>): string {
  const candidate = result.response.candidates?.[0];
  if (!candidate) return "";
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    console.warn(`  finish reason: ${candidate.finishReason}`);
  }
  const parts = candidate.content?.parts ?? [];
  return parts.map((p) => ("text" in p && typeof p.text === "string" ? p.text : "")).join("");
}

async function generateForCategory(
  vertex: VertexAI,
  id: string,
  def: CategoryDef,
): Promise<string[]> {
  const model = vertex.getGenerativeModel({ model: MODEL });
  const accepted: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CATEGORY; attempt++) {
    const need = PROMPTS_PER_CATEGORY - accepted.length;
    if (need <= 0) break;

    // ask for a couple extra to absorb dropped lines
    const ask = need + 2;
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: buildInstruction(def, ask) }] }],
      generationConfig: { temperature: 0.9, topP: 0.95 },
    });

    const lines = extractText(result).split("\n").map(clean).filter(Boolean);

    for (const line of lines) {
      if (accepted.length >= PROMPTS_PER_CATEGORY) break;
      if (line.length > MAX_CHARS) {
        console.warn(`  drop (${line.length} chars): ${line.slice(0, 60)}…`);
        continue;
      }
      if (accepted.includes(line)) continue;
      accepted.push(line);
    }
  }

  if (accepted.length < PROMPTS_PER_CATEGORY) {
    throw new Error(
      `[${id}] only got ${accepted.length}/${PROMPTS_PER_CATEGORY} valid prompts after ${MAX_ATTEMPTS_PER_CATEGORY} attempts`,
    );
  }
  return accepted;
}

async function main() {
  const vertex = new VertexAI({ project: PROJECT_ID!, location: LOCATION });
  const out: Record<string, CategoryRecord> = {};

  for (const [id, def] of Object.entries(CATEGORIES)) {
    console.log(`\n→ ${id} (${def.label})`);
    const prompts = await generateForCategory(vertex, id, def);
    prompts.forEach((p, i) => console.log(`  ${i + 1}. (${String(p.length).padStart(3)}) ${p}`));
    out[id] = {
      label: def.label,
      emoji: def.emoji,
      prompts,
      seedRange: def.seedRange,
    };
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n✓ wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
