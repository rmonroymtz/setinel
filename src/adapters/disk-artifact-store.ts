import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ArtifactStore } from "../ports/artifact-store.ts";

export class DiskArtifactStore implements ArtifactStore {
  readonly #root: string;

  constructor(runDir: string) {
    this.#root = resolve(runDir);
  }

  async writeJson(path: string, data: unknown): Promise<string> {
    // JSON.stringify returns undefined (not a string) for undefined, functions and
    // symbols; writing that would produce the text "undefined", an invalid JSON file.
    const json: string | undefined = JSON.stringify(data, null, 2);
    if (json === undefined) throw new TypeError(`Refusing to write ${path}: the data is not JSON-serializable (${typeof data})`);
    return this.#write(path, `${json}\n`);
  }

  async writeBinary(path: string, data: Uint8Array): Promise<string> {
    return this.#write(path, data);
  }

  async #write(path: string, content: string | Uint8Array): Promise<string> {
    const target = resolve(this.#root, path);
    const rel = relative(this.#root, target);
    // Evidence names come from step code; never let one write outside the run folder.
    // Only a leading ".." segment escapes; a name such as "..notes.json" stays inside.
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`Refusing to write outside the run directory: ${path}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    return rel;
  }
}
