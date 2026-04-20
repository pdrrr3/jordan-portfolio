import { PortfolioContent } from '@/lib/portfolio-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isPortfolioContent(value: unknown): value is PortfolioContent {
  if (!isRecord(value)) return false;

  if (!isRecord(value.logoCards)) return false;
  if (!isRecord(value.caseStudies)) return false;
  if (!isStringArray(value.paragraphs)) return false;

  for (const card of Object.values(value.logoCards)) {
    if (!isRecord(card)) return false;
  }

  for (const caseStudy of Object.values(value.caseStudies)) {
    if (!isRecord(caseStudy)) return false;
    if (caseStudy.role !== undefined && !isStringArray(caseStudy.role)) return false;
    if (caseStudy.slides !== undefined) {
      if (!Array.isArray(caseStudy.slides)) return false;
      for (const slide of caseStudy.slides) {
        if (!isRecord(slide)) return false;
      }
    }
  }

  return true;
}

export function assertPortfolioContent(value: unknown): asserts value is PortfolioContent {
  if (!isPortfolioContent(value)) {
    throw new Error('Invalid portfolio content payload');
  }
}
