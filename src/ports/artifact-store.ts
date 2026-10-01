/** Paths are relative to the run directory; the returned path is what reports reference. */
export interface ArtifactStore {
  writeJson(path: string, data: unknown): Promise<string>;
  writeBinary(path: string, data: Uint8Array): Promise<string>;
}
