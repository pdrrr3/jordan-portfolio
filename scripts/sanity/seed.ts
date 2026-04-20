import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import syncFs from 'node:fs';
import path from 'node:path';

import { createClient } from '@sanity/client';

import { logoRegistry } from '../../src/data/logo-registry';
import type { LogoCard, PortfolioContent } from '../../src/lib/portfolio-types';

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!syncFs.existsSync(envPath)) return;

  const source = syncFs.readFileSync(envPath, 'utf8');
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex <= 0) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    const rawValue = trimmed.slice(equalIndex + 1).trim();
    const normalized = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

    if (!process.env[key]) {
      process.env[key] = normalized;
    }
  }
}

loadLocalEnv();

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const token = process.env.SANITY_API_WRITE_TOKEN;
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2026-04-20';

if (!projectId) {
  throw new Error('Missing NEXT_PUBLIC_SANITY_PROJECT_ID');
}

if (!token) {
  throw new Error('Missing SANITY_API_WRITE_TOKEN');
}

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false
});
const TOKEN_REGEX = /\{\{([^}]+)\}\}/g;
const uploadCache = new Map<string, { _type: 'reference'; _ref: string }>();

function normalizeId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeKey(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function extractTemplateTokenIds(paragraphs: string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const paragraph of paragraphs) {
    let match: RegExpExecArray | null = null;
    TOKEN_REGEX.lastIndex = 0;

    while ((match = TOKEN_REGEX.exec(paragraph)) !== null) {
      const tokenId = match[1]?.trim();
      if (!tokenId || seen.has(tokenId)) continue;

      seen.add(tokenId);
      ids.push(tokenId);
    }
  }

  return ids;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePublicAssetPath(rawPath: string): Promise<string | null> {
  const value = rawPath.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return null;

  const withoutQuery = value.split('?')[0].split('#')[0];
  const normalized = withoutQuery.replace(/^\/+/, '');
  const decoded = decodeURI(normalized);
  const candidates = [normalized, decoded];

  for (const candidate of candidates) {
    const absolute = path.join(process.cwd(), 'public', candidate);
    if (await fileExists(absolute)) {
      return absolute;
    }
  }

  return null;
}

async function uploadAssetReference(rawPath: string, kind: 'image' | 'file') {
  const absolutePath = await resolvePublicAssetPath(rawPath);
  if (!absolutePath) return null;

  const cacheKey = `${kind}:${absolutePath}`;
  const cached = uploadCache.get(cacheKey);
  if (cached) return cached;

  const bytes = await fs.readFile(absolutePath);
  const filename = path.basename(absolutePath);
  const asset = await client.assets.upload(kind, bytes, { filename });
  const reference = { _type: 'reference' as const, _ref: asset._id };

  uploadCache.set(cacheKey, reference);
  return reference;
}

function convertTemplateToPortableBlock(
  template: string,
  resolveReferenceId: (tokenId: string) => string | null,
  resolveTokenDisplayText: (tokenId: string) => string
) {
  const children: Array<{ _key: string; _type: 'span'; text: string; marks: string[] }> = [];
  const markDefs: Array<{
    _key: string;
    _type: 'portfolioReference';
    reference: { _type: 'reference'; _ref: string };
  }> = [];

  let cursor = 0;
  let match: RegExpExecArray | null = null;
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(template)) !== null) {
    if (match.index > cursor) {
      children.push({
        _key: makeKey('span'),
        _type: 'span',
        text: template.slice(cursor, match.index),
        marks: []
      });
    }

    const tokenId = match[1];
    const referenceId = resolveReferenceId(tokenId);
    const tokenText = resolveTokenDisplayText(tokenId);
    if (referenceId) {
      const markKey = makeKey('mark');
      markDefs.push({
        _key: markKey,
        _type: 'portfolioReference',
        reference: {
          _type: 'reference',
          _ref: referenceId
        }
      });
      children.push({
        _key: makeKey('span'),
        _type: 'span',
        text: tokenText,
        marks: [markKey]
      });
    } else {
      children.push({
        _key: makeKey('span'),
        _type: 'span',
        text: tokenText,
        marks: []
      });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < template.length) {
    children.push({
      _key: makeKey('span'),
      _type: 'span',
      text: template.slice(cursor),
      marks: []
    });
  }

  if (!children.length) {
    children.push({
      _key: makeKey('span'),
      _type: 'span',
      text: '',
      marks: []
    });
  }

  return {
    _key: makeKey('block'),
    _type: 'block' as const,
    style: 'normal',
    markDefs,
    children
  };
}

async function main() {
  const contentPath = path.join(process.cwd(), 'content.json');
  const rawContent = await fs.readFile(contentPath, 'utf8');
  const content = JSON.parse(rawContent) as PortfolioContent;
  const paragraphTemplates = (content.paragraphs ?? []).filter(
    (paragraph): paragraph is string => typeof paragraph === 'string'
  );
  const caseStudyIds = new Set(Object.keys(content.caseStudies));
  const logoCardEntries = new Map<string, LogoCard>(Object.entries(content.logoCards));

  for (const tokenId of extractTemplateTokenIds(paragraphTemplates)) {
    if (logoCardEntries.has(tokenId) || caseStudyIds.has(tokenId)) continue;

    const definition = logoRegistry[tokenId];
    logoCardEntries.set(tokenId, {
      caption: definition?.defaultCaption ?? '',
      color: definition?.defaultColor ?? '#1a1a1a',
      link: '',
      linkText: '',
      logoFile: definition?.imageSrc ?? ''
    });
  }

  const logoCardDocs = [];
  for (const [index, [logoId, card]] of [...logoCardEntries.entries()].entries()) {
    const normalizedLogoId = normalizeId(logoId);
    const definition = logoRegistry[logoId];
    const fallbackLogoPath = card.logoFile || definition?.imageSrc || '';
    const logoAssetRef = await uploadAssetReference(fallbackLogoPath, 'image');
    const logoCardDoc: Record<string, unknown> = {
      _id: `logoCard.${normalizedLogoId}`,
      _type: 'logoCard',
      title: definition?.alt || definition?.text || logoId,
      logoId,
      orderRank: index + 1,
      caption: card.caption || '',
      color: card.color || '#1a1a1a',
      link: card.link || undefined,
      linkText: card.linkText || '',
      logoFilePath: card.logoFile || fallbackLogoPath || ''
    };

    if (logoAssetRef) {
      logoCardDoc.logoAsset = {
        _type: 'image',
        asset: logoAssetRef
      };
    }

    logoCardDocs.push(logoCardDoc);
  }

  const caseStudyDocs = [];
  for (const [index, [logoId, caseStudy]] of Object.entries(content.caseStudies).entries()) {
    const normalizedLogoId = normalizeId(logoId);
    const slides = [];

    for (const slide of caseStudy.slides || []) {
      const mediaFileRef = await uploadAssetReference(slide.image || '', 'file');
      const slideDoc: Record<string, unknown> = {
        _key: makeKey('slide'),
        _type: 'caseStudySlide',
        title: slide.title || '',
        text: slide.text || '',
        mediaPath: slide.image || ''
      };

      if (mediaFileRef) {
        slideDoc.mediaFile = {
          _type: 'file',
          asset: mediaFileRef
        };
      }

      slides.push(slideDoc);
    }

    caseStudyDocs.push({
      _id: `caseStudy.${normalizedLogoId}`,
      _type: 'caseStudy',
      title: caseStudy.title || logoId,
      logoId,
      slug: {
        _type: 'slug',
        current: logoId
      },
      orderRank: index + 1,
      role: Array.isArray(caseStudy.role) ? caseStudy.role : [],
      slides
    });
  }

  for (const doc of [...logoCardDocs, ...caseStudyDocs]) {
    await client.createOrReplace(doc);
  }

  const logoCardByLogoId = new Map(
    logoCardDocs.map((doc) => [String(doc.logoId || ''), String(doc._id || '')])
  );
  const caseStudyByLogoId = new Map(
    caseStudyDocs.map((doc) => [String(doc.logoId || ''), String(doc._id || '')])
  );

  const resolveReferenceId = (tokenId: string): string | null => {
    const caseStudyRef = caseStudyByLogoId.get(tokenId);
    if (caseStudyRef) return caseStudyRef;

    const logoCardRef = logoCardByLogoId.get(tokenId);
    if (logoCardRef) return logoCardRef;

    return null;
  };

  const resolveTokenDisplayText = (tokenId: string): string => {
    const caseStudy = content.caseStudies[tokenId];
    if (caseStudy?.title?.trim()) return caseStudy.title.trim();

    const logoDefinition = logoRegistry[tokenId];
    if (logoDefinition?.text?.trim()) return logoDefinition.text.trim();
    if (logoDefinition?.alt?.trim()) return logoDefinition.alt.trim();

    const logoCard = content.logoCards[tokenId];
    if (logoCard?.linkText?.trim()) return logoCard.linkText.trim();

    return tokenId;
  };

  const sanitizedParagraphBlocks = paragraphTemplates.map((template) =>
    convertTemplateToPortableBlock(template, resolveReferenceId, resolveTokenDisplayText)
  );

  await client.createOrReplace({
    _id: 'portfolioPage',
    _type: 'portfolioPage',
    title: 'Jordan Portfolio',
    navLabelPrimary: 'BRAND STRATEGY',
    navLabelSecondary: 'NEW YORK',
    contactEmail: 'hello@jordansowunmi.com',
    paragraphBlocks: sanitizedParagraphBlocks
  });

  console.log(
    `Seed complete: ${logoCardDocs.length} logo cards, ${caseStudyDocs.length} case studies, ${sanitizedParagraphBlocks.length} rich-text paragraphs.`
  );
}

void main();
