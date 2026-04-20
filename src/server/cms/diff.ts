import { PortfolioContent } from '@/lib/portfolio-types';

import { CmsDiffSummary } from '@/server/cms/types';

function areEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function collectChangedPaths(a: unknown, b: unknown, basePath = '', acc: string[] = [], limit = 80): string[] {
  if (acc.length >= limit) return acc;

  if (areEqual(a, b)) return acc;

  const aIsObject = Boolean(a) && typeof a === 'object';
  const bIsObject = Boolean(b) && typeof b === 'object';

  if (!aIsObject || !bIsObject) {
    acc.push(basePath || '$');
    return acc;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    acc.push(basePath || '$');
    return acc;
  }

  const keys = new Set<string>([
    ...Object.keys(a as Record<string, unknown>),
    ...Object.keys(b as Record<string, unknown>)
  ]);

  for (const key of Array.from(keys).sort()) {
    const nextPath = basePath ? `${basePath}.${key}` : key;
    collectChangedPaths(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      nextPath,
      acc,
      limit
    );

    if (acc.length >= limit) break;
  }

  return acc;
}

export function summarizeDiff(live: PortfolioContent, stage: PortfolioContent): CmsDiffSummary {
  const liveParagraphs = live.paragraphs ?? [];
  const stageParagraphs = stage.paragraphs ?? [];
  const paragraphLen = Math.max(liveParagraphs.length, stageParagraphs.length);

  let paragraphsChanged = 0;
  for (let idx = 0; idx < paragraphLen; idx += 1) {
    if ((liveParagraphs[idx] ?? '') !== (stageParagraphs[idx] ?? '')) {
      paragraphsChanged += 1;
    }
  }

  const liveLogoIds = Object.keys(live.logoCards ?? {});
  const stageLogoIds = Object.keys(stage.logoCards ?? {});
  const logoIds = new Set([...liveLogoIds, ...stageLogoIds]);

  let logosAdded = 0;
  let logosRemoved = 0;
  let logosChanged = 0;

  for (const id of logoIds) {
    const left = live.logoCards[id];
    const right = stage.logoCards[id];

    if (!left && right) {
      logosAdded += 1;
      continue;
    }

    if (left && !right) {
      logosRemoved += 1;
      continue;
    }

    if (!areEqual(left, right)) {
      logosChanged += 1;
    }
  }

  const liveCaseIds = Object.keys(live.caseStudies ?? {});
  const stageCaseIds = Object.keys(stage.caseStudies ?? {});
  const caseIds = new Set([...liveCaseIds, ...stageCaseIds]);

  let caseStudiesAdded = 0;
  let caseStudiesRemoved = 0;
  let caseStudiesChanged = 0;

  for (const id of caseIds) {
    const left = live.caseStudies[id];
    const right = stage.caseStudies[id];

    if (!left && right) {
      caseStudiesAdded += 1;
      continue;
    }

    if (left && !right) {
      caseStudiesRemoved += 1;
      continue;
    }

    if (!areEqual(left, right)) {
      caseStudiesChanged += 1;
    }
  }

  const changedPaths = collectChangedPaths(live, stage);
  const hasChanges =
    paragraphsChanged > 0 ||
    logosAdded > 0 ||
    logosRemoved > 0 ||
    logosChanged > 0 ||
    caseStudiesAdded > 0 ||
    caseStudiesRemoved > 0 ||
    caseStudiesChanged > 0;

  return {
    hasChanges,
    paragraphsChanged,
    logosAdded,
    logosRemoved,
    logosChanged,
    caseStudiesAdded,
    caseStudiesRemoved,
    caseStudiesChanged,
    changedPaths
  };
}
