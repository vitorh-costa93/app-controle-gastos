import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// 1. Verifica exportações obrigatórias em src/lib/ai/models.ts
const modelsSrc = fs.readFileSync(path.join(root, "src/lib/ai/models.ts"), "utf8");
assert.match(modelsSrc, /export function pickLatestFromList/);
assert.match(modelsSrc, /export async function resolveModelFor/);
assert.match(modelsSrc, /export function clearModelDiscoveryCache/);
assert.match(modelsSrc, /https:\/\/api\.openai\.com\/v1\/models/);

// 2. Verifica que nenhum outro arquivo em src/ tem nome de modelo hardcoded
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const srcFiles = walk(path.join(root, "src")).filter(
  (f) => !f.endsWith(path.join("src", "lib", "ai", "models.ts"))
);
for (const f of srcFiles) {
  const code = fs.readFileSync(f, "utf8");
  assert.doesNotMatch(
    code,
    /gpt-\d|gpt-image|dall-e|whisper-1/i,
    `Modelo hardcoded encontrado fora de src/lib/ai/models.ts: ${path.relative(root, f)}`
  );
}

// 3. Verifica que openai.ts e engine.ts usam resolveModelFor
const openaiSrc = fs.readFileSync(path.join(root, "src/lib/ai/openai.ts"), "utf8");
assert.match(openaiSrc, /await resolveModelFor\(/);

const engineSrc = fs.readFileSync(path.join(root, "src/lib/price-tracking/engine.ts"), "utf8");
assert.match(engineSrc, /await resolveModelFor\(/);

console.log("✓ IA auto-atualizável (resolveModelFor + zero modelos hardcoded fora de models.ts) validada com sucesso");
