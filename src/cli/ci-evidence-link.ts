import type { EvidenceLink } from "../adapters/slack-message.ts";

const REPO_FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BUILD_NUMBER = /^\d+$/;

/**
 * Pure: the page of the CI run that holds this run's artifacts, read from the
 * environment Bitbucket Pipelines sets. Outside CI (or with values that do not
 * look like Bitbucket's) there is no link and the local paths are enough.
 */
export function ciEvidenceLink(env: Record<string, string | undefined>): EvidenceLink | undefined {
  const build = env.BITBUCKET_BUILD_NUMBER?.trim();
  const repo = env.BITBUCKET_REPO_FULL_NAME?.trim();
  if (!build || !repo || !BUILD_NUMBER.test(build) || !REPO_FULL_NAME.test(repo)) return undefined;
  return {
    url: `https://bitbucket.org/${repo}/pipelines/results/${build}`,
    label: `Bitbucket pipeline #${build} (artifacts)`,
  };
}
