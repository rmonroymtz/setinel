import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiskArtifactStore } from "../../src/adapters/disk-artifact-store.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sentinel-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("DiskArtifactStore", () => {
  it("writes JSON under the run directory and returns the relative path", async () => {
    const store = new DiskArtifactStore(join(dir, "run-1"));

    const path = await store.writeJson("reporte.json", { ok: true });

    expect(path).toBe("reporte.json");
    expect(JSON.parse(await readFile(join(dir, "run-1", "reporte.json"), "utf8"))).toEqual({ ok: true });
  });

  it("writes binary evidence, creating nested folders", async () => {
    const store = new DiskArtifactStore(join(dir, "run-1"));
    const bytes = new Uint8Array([0, 1, 2, 255]);

    const path = await store.writeBinary("evidence/home.png", bytes);

    expect(path).toBe("evidence/home.png");
    expect(new Uint8Array(await readFile(join(dir, "run-1", "evidence", "home.png")))).toEqual(bytes);
  });

  it("rejects paths that escape the run directory", async () => {
    const store = new DiskArtifactStore(join(dir, "run-1"));

    await expect(store.writeJson("../escape.json", {})).rejects.toThrow(/outside/i);
    await expect(store.writeBinary("/etc/x", new Uint8Array())).rejects.toThrow(/outside/i);
  });

  it("accepts names that only start with two dots and stay inside the run directory", async () => {
    const store = new DiskArtifactStore(join(dir, "run-1"));

    expect(await store.writeJson("..notes.json", { ok: true })).toBe("..notes.json");
    expect(await store.writeBinary("evidence/..trace.bin", new Uint8Array([1]))).toBe(join("evidence", "..trace.bin"));
    expect(JSON.parse(await readFile(join(dir, "run-1", "..notes.json"), "utf8"))).toEqual({ ok: true });
  });

  it("still rejects the run directory itself and parent-relative paths", async () => {
    const store = new DiskArtifactStore(join(dir, "run-1"));

    await expect(store.writeJson(".", {})).rejects.toThrow(/outside/i);
    await expect(store.writeJson("..", {})).rejects.toThrow(/outside/i);
    await expect(store.writeJson("evidence/../../x.json", {})).rejects.toThrow(/outside/i);
  });

  it("rejects data JSON cannot represent instead of writing an invalid file", async () => {
    const store = new DiskArtifactStore(join(dir, "run-1"));

    await expect(store.writeJson("reporte.json", undefined)).rejects.toThrow(/not JSON-serializable/i);
    await expect(store.writeJson("fn.json", () => 1)).rejects.toThrow(/not JSON-serializable/i);
    await expect(readFile(join(dir, "run-1", "reporte.json"), "utf8")).rejects.toThrow();
  });
});
