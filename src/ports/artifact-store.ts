/** Paths are relative to the run directory; the returned path is what reports reference. */
export interface ArtifactStore {
  /** Rejects data JSON cannot represent (e.g. `undefined`) instead of writing an invalid file. */
  writeJson(path: string, data: unknown): Promise<string>;
  writeBinary(path: string, data: Uint8Array): Promise<string>;
}
