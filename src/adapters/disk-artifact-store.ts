import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ArtifactStore } from "../ports/artifact-store.ts";

export class DiskArtifactStore implements ArtifactStore {
  readonly #root: string;

  constructor(runDir: string) {
    this.#root = resolve(runDir);
  }

  async writeJson(path: string, data: unknown): Promise<string> {
    return this.#write(path, `${JSON.stringify(data, null, 2)}\n`);
  }

  async writeBinary(path: string, data: Uint8Array): Promise<string> {
    return this.#write(path, data);
  }

  async #write(path: string, content: string | Uint8Array): Promise<string> {
    const target = resolve(this.#root, path);
    const rel = relative(this.#root, target);
    // Evidence names come from step code; never let one write outside the run folder.
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`Refusing to write outside the run directory: ${path}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    return rel;
  }
}
