import { describe, expect, it } from "vitest";
import { ciEvidenceLink } from "../../src/cli/ci-evidence-link.ts";

const bitbucket = {
  BITBUCKET_BUILD_NUMBER: "42",
  BITBUCKET_REPO_FULL_NAME: "acme/sentinel",
  BITBUCKET_WORKSPACE: "acme",
};

describe("ciEvidenceLink", () => {
  it("links to the Bitbucket pipeline run page, where the artifacts live", () => {
    expect(ciEvidenceLink(bitbucket)).toEqual({
      url: "https://bitbucket.org/acme/sentinel/pipelines/results/42",
      label: "Bitbucket pipeline #42 (artifacts)",
    });
  });

  it("returns nothing outside CI", () => {
    expect(ciEvidenceLink({})).toBeUndefined();
    expect(ciEvidenceLink({ HOME: "/home/someone" })).toBeUndefined();
  });

  it("returns nothing when a Bitbucket variable is missing or blank", () => {
    expect(ciEvidenceLink({ ...bitbucket, BITBUCKET_BUILD_NUMBER: undefined })).toBeUndefined();
    expect(ciEvidenceLink({ ...bitbucket, BITBUCKET_REPO_FULL_NAME: "  " })).toBeUndefined();
  });

  it("rejects malformed values instead of building a misleading link", () => {
    expect(ciEvidenceLink({ ...bitbucket, BITBUCKET_BUILD_NUMBER: "42; rm" })).toBeUndefined();
    expect(ciEvidenceLink({ ...bitbucket, BITBUCKET_REPO_FULL_NAME: "acme" })).toBeUndefined();
    expect(ciEvidenceLink({ ...bitbucket, BITBUCKET_REPO_FULL_NAME: "acme/sentinel/extra" })).toBeUndefined();
    expect(ciEvidenceLink({ ...bitbucket, BITBUCKET_REPO_FULL_NAME: "evil.com/x|y" })).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(ciEvidenceLink({ BITBUCKET_BUILD_NUMBER: " 7 ", BITBUCKET_REPO_FULL_NAME: " acme/sentinel.web " })?.url).toBe(
      "https://bitbucket.org/acme/sentinel.web/pipelines/results/7",
    );
  });
});
