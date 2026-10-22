// Reads the starting knowledge base from docs/ai-knowledge (F20). Used by the seed script and
// the tests; the app itself reads the knowledge files from the database.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_KNOWLEDGE } from "./knowledge";

export function readSeedKnowledge(dir = "docs/ai-knowledge") {
  return SEED_KNOWLEDGE.map(({ slug }) => ({
    slug,
    content: readFileSync(join(dir, `${slug}.md`), "utf8"),
  }));
}
