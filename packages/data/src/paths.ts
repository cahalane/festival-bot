import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// packages/data/src -> repo root -> data/
export const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");
