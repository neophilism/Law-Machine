/**
 * Portable, repository-owned roadmap. One authoritative file per repository:
 * registry/roadmap.json.
 *
 * A planned unit is not a GitHub PR number; explicit PR references are evidence.
 * Operational acceptance is separate from whether those references are merged.
 */
export const CANONICAL_ROADMAP_PATH = "registry/roadmap.json";

function readPrReference(value, repoName, aliases) {
  if (Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value !== "string") throw new Error("Canonical roadmap PR reference must be a positive integer or a GitHub pull URL.");
  const found = value.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/([1-9]\d*)\/?$/i);
  if (!found || found[1].toLowerCase() !== "neophilism" ||
    !aliases.has(found[2].toLowerCase())) throw new Error("Roadmap PR URL must refer to the same repository or a declared previous repository slug.");
  const number = Number(found[3]);
  if (!Number.isSafeInteger(number)) throw new Error("Invalid GitHub PR number.");
  return number;
}

export function parseCanonicalRoadmap(body, repoName) {
  if (typeof body !== "string" || Buffer.byteLength(body, "utf8") > 500000)
    throw new Error("Invalid repository roadmap size.");
  const data = JSON.parse(body);
  if (!data || typeof data !== "object" || Array.isArray(data) ||
    !Number.isSafeInteger(data.version) || data.version < 1 ||
    !Array.isArray(data.milestones) || (data.milestones.length < 1 && data.planVerified !== false) ||
    data.milestones.length > 2000)
    throw new Error("Canonical roadmap requires a positive version and 1–2000 milestones.");
  if (data.repository !== undefined && data.repository !== "neophilism/" + repoName)
    throw new Error("Canonical roadmap repository mismatch.");
  if (data.plannedPrCount !== undefined &&
    (!Number.isSafeInteger(data.plannedPrCount) || data.plannedPrCount !== data.milestones.length))
    throw new Error("Declared plannedPrCount must equal the number of explicit roadmap units.");
  if (data.plannedWorkTotal !== undefined &&
    (!Number.isSafeInteger(data.plannedWorkTotal) || data.plannedWorkTotal !== data.milestones.length))
    throw new Error("Declared plannedWorkTotal must equal the number of explicit roadmap units.");

  // GitHub redirects old PR URLs after a repository rename; aliases must be
  // explicitly reviewed and versioned, never inferred from an arbitrary URL.
  const oldSlugs = data.previousRepositoryNames === undefined ? [] : data.previousRepositoryNames;
  if (!Array.isArray(oldSlugs) || oldSlugs.length > 10 ||
    oldSlugs.some(x => typeof x !== "string" || !/^[a-z0-9_.-]{1,100}$/i.test(x)))
    throw new Error("Invalid previous repository name aliases.");
  const aliases = new Set([repoName.toLowerCase(),...oldSlugs.map(x=>x.toLowerCase())]);
  if (data.planVerified === false) {
    if (data.milestones.length !== 0 || data.plannedPrCount !== 0)
      throw new Error("Unverified plan markers cannot contain presumed work units.");
    return [];
  }
  const ids = new Set();
  return data.milestones.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
      typeof row.id !== "string" || !/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/.test(row.id) || !/\d/.test(row.id) ||
      ids.has(row.id) ||
      typeof row.title !== "string" || !row.title.trim() || row.title.length > 240)
      throw new Error("Duplicate or invalid canonical roadmap work item at position " + (index + 1));
    ids.add(row.id);
    const references = [];
    for (const field of ["pullRequests","openPullRequests","github_prs","githubPrNumbers"]) {
      if (row[field] === undefined || row[field] === null) continue;
      if (!Array.isArray(row[field]) || row[field].length > 100)
        throw new Error("Canonical roadmap PR evidence must be an array.");
      references.push(...row[field]);
    }
    for (const field of ["pr","github_pr"]) {
      if (row[field] !== undefined && row[field] !== null)
        references.push(row[field]);
    }
    const numbers = [...new Set(references.map(x=>readPrReference(x,repoName,aliases)))];
    const contributingFields=['contributingPrs','contributingPullRequests'];
    const contributingReferences=contributingFields.flatMap(field=>{
      if(row[field]===undefined||row[field]===null)return [];
      if(!Array.isArray(row[field])||row[field].length>100)
        throw new Error('Invalid contributing PR references');
      return row[field];
    });
    const contributions=[...new Set(contributingReferences.map(x=>readPrReference(x,repoName,aliases)))];
    if(contributions.some(n=>numbers.includes(n)))
      throw new Error('A package PR cannot be both accepted and contribution-only');
    const scope = row.origin === "added" || row.origin === "addition" ||
      row.scope === "addition" ? "addition" : "original";
    return {
      ordinal:index+1,sourceItemId:row.id,title:row.title.trim(),numbers,contributions,
      scope,reason:numbers.length?"Explicit repository-owned canonical GitHub PR references":null
    };
  });
}

export function candidateRoadmapPaths(repoName, configured) {
  const legacy = configured?.[repoName] || [
    ".exechub/project.yml","docs/roadmap.json","docs/development-plan.md",
    "docs/DEVELOPMENT-PLAN.md","docs/roadmap.md"
  ];
  return [CANONICAL_ROADMAP_PATH,...legacy.filter(x=>x!==CANONICAL_ROADMAP_PATH)];
}

/**
 * Only one representation per *repository* contributes to the plan. Projects
 * can still contain several repositories, each with its own authoritative plan.
 */
export function shouldImportPlanDocument(document, canonicalRepositoryIds, configuredPaths) {
  if (canonicalRepositoryIds.has(document.repository_id))
    return document.path === CANONICAL_ROADMAP_PATH;
  const existing = configuredPaths[document.repository_name];
  return !existing || existing.includes(document.path);
}
