import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "drumkit");

rmSync(join(root, "public"), { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const file of ["index.html", "main.js", "styles.css"]) {
  cpSync(join(root, file), join(out, file));
}

cpSync(join(root, "audio"), join(out, "audio"), { recursive: true });
