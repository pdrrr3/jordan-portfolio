import { unstable_cache } from 'next/cache';

import fallbackContentJson from '@/../content.json';
import {
  CaseStudy,
  LogoCard,
  PortfolioContent,
  PortfolioParagraphBlock,
  PortfolioParagraphSpan,
  PortfolioReferenceMarkDef
} from '@/lib/portfolio-types';
import { isSanityConfigured } from '@/sanity/lib/api';
import { PUBLISHED_REVALIDATE_SECONDS, sanityFetch } from '@/sanity/lib/fetch';
import { portfolioPageQuery } from '@/sanity/lib/queries';
import { PortfolioPageQueryResult } from '@/sanity/types';

const fallbackContent = fallbackContentJson as PortfolioContent;
const CACHE_KEY = 'portfolio-content-v1';
const CACHE_TAG = 'portfolio-content';
type ParagraphBlockResult = NonNullable<NonNullable<PortfolioPageQueryResult>['paragraphBlocks']>[number];

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getReferencedLogoIds(result: PortfolioPageQueryResult): Set<string> {
  const ids = new Set<string>();

  for (const block of result?.paragraphBlocks ?? []) {
    for (const markDef of block?.markDefs ?? []) {
      const logoId = asString(markDef?.logoId).trim();
      if (logoId) {
        ids.add(logoId);
      }
    }
  }

  return ids;
}

function sanitizeLogoCards(
  result: PortfolioPageQueryResult,
  referencedLogoIds: Set<string>
): Record<string, LogoCard> {
  const cards: Record<string, LogoCard> = {};
  const shouldFilterByReferences = referencedLogoIds.size > 0;

  for (const card of result?.logoCards ?? []) {
    const logoId = asString(card?.logoId).trim();
    if (!logoId) continue;
    if (shouldFilterByReferences && !referencedLogoIds.has(logoId)) continue;

    const width = typeof card?.logoWidth === 'number' ? card.logoWidth : undefined;
    const height = typeof card?.logoHeight === 'number' ? card.logoHeight : undefined;

    cards[logoId] = {
      caption: asString(card?.caption),
      color: asString(card?.color),
      link: asString(card?.link),
      linkText: asString(card?.linkText),
      logoFile: asString(card?.logoFile),
      ...(width ? { logoWidth: width } : {}),
      ...(height ? { logoHeight: height } : {})
    };
  }

  return cards;
}

function sanitizeCaseStudies(
  result: PortfolioPageQueryResult,
  referencedLogoIds: Set<string>
): Record<string, CaseStudy> {
  const studies: Record<string, CaseStudy> = {};
  const shouldFilterByReferences = referencedLogoIds.size > 0;

  for (const caseStudy of result?.caseStudies ?? []) {
    const logoId = asString(caseStudy?.logoId).trim();
    if (shouldFilterByReferences && logoId && !referencedLogoIds.has(logoId)) continue;

    const slug = asString(caseStudy?.id).trim() || asString(caseStudy?.logoId).trim();
    if (!slug) continue;

    studies[slug] = {
      title: asString(caseStudy?.title),
      role: (caseStudy?.role ?? []).filter((value): value is string => typeof value === 'string'),
      slides: (caseStudy?.slides ?? []).map((slide) => ({
        title: asString(slide?.title),
        text: asString(slide?.text),
        image: asString(slide?.image)
      }))
    };
  }

  return studies;
}

function sanitizeParagraphSpans(block: ParagraphBlockResult): PortfolioParagraphSpan[] {
  const spans: PortfolioParagraphSpan[] = [];

  for (const child of block?.children ?? []) {
    if (child?._type !== 'span') continue;

    spans.push({
      _key: asString(child?._key),
      _type: 'span',
      text: asString(child?.text),
      marks: (child?.marks ?? []).filter((mark): mark is string => typeof mark === 'string')
    });
  }

  return spans;
}

function sanitizeParagraphMarkDefs(block: ParagraphBlockResult): PortfolioReferenceMarkDef[] {
  const markDefs: PortfolioReferenceMarkDef[] = [];

  for (const markDef of block?.markDefs ?? []) {
    markDefs.push({
      _key: asString(markDef?._key),
      _type: asString(markDef?._type),
      logoId: asString(markDef?.logoId),
      referenceType: asString(markDef?.referenceType)
    });
  }

  return markDefs;
}

function sanitizeParagraphBlocks(result: PortfolioPageQueryResult): PortfolioParagraphBlock[] {
  const blocks: PortfolioParagraphBlock[] = [];

  for (const block of result?.paragraphBlocks ?? []) {
    if (block?._type !== 'block') continue;

    blocks.push({
      _key: asString(block?._key),
      _type: 'block',
      style: asString(block?.style),
      children: sanitizeParagraphSpans(block),
      markDefs: sanitizeParagraphMarkDefs(block)
    });
  }

  return blocks;
}

function normalizePortfolioContent(result: PortfolioPageQueryResult): PortfolioContent | null {
  if (!result) return null;

  const referencedLogoIds = getReferencedLogoIds(result);
  const paragraphBlocks = sanitizeParagraphBlocks(result);

  return {
    paragraphs: [],
    paragraphBlocks,
    logoCards: sanitizeLogoCards(result, referencedLogoIds),
    caseStudies: sanitizeCaseStudies(result, referencedLogoIds)
  };
}

const fetchPortfolioContentFromSanity = unstable_cache(
  async (): Promise<PortfolioContent | null> => {
    const result = await sanityFetch({
      query: portfolioPageQuery,
      tags: [CACHE_TAG]
    });

    return normalizePortfolioContent(result);
  },
  [CACHE_KEY],
  {
    revalidate: PUBLISHED_REVALIDATE_SECONDS,
    tags: [CACHE_TAG]
  }
);

export async function getPortfolioContent(): Promise<PortfolioContent> {
  if (!isSanityConfigured) {
    return fallbackContent;
  }

  try {
    const content = await fetchPortfolioContentFromSanity();
    if (!content) {
      return fallbackContent;
    }

    return {
      paragraphs: content.paragraphs.length ? content.paragraphs : fallbackContent.paragraphs,
      paragraphBlocks: content.paragraphBlocks?.length ? content.paragraphBlocks : undefined,
      logoCards: {
        ...fallbackContent.logoCards,
        ...content.logoCards
      },
      caseStudies: {
        ...fallbackContent.caseStudies,
        ...content.caseStudies
      }
    };
  } catch (error) {
    console.error('Failed to load portfolio content from Sanity:', error);
    return fallbackContent;
  }
}
