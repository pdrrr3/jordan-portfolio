'use client';

import { Fragment, MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { CaseStudyModal } from '@/components/case-study-modal';
import { LogoCard, PortfolioContent, PortfolioParagraphBlock } from '@/lib/portfolio-types';
import {
  getCaseStudySlugs,
  isVideoAsset,
  normalizeLinkUrl,
  resolveLogo,
  seededRandom,
  tokenizeParagraph,
  toPublicPath
} from '@/lib/portfolio-utils';

interface PortfolioPageProps {
  content: PortfolioContent;
}

interface HoverPreviewState {
  kind: 'preview';
  media: string;
  isVideo: boolean;
  isProject: boolean;
  hasMedia: boolean;
  x: number;
  y: number;
}

interface HoverTooltipState {
  kind: 'tooltip';
  caption: string;
  hasLink: boolean;
  x: number;
  y: number;
}

type HoverState = HoverPreviewState | HoverTooltipState | null;
type ParagraphPiece = ParagraphTextPiece | ParagraphLogoPiece;

interface ParagraphTextPiece {
  kind: 'text';
  key: string;
  text: string;
}

interface ParagraphLogoPiece {
  kind: 'logo';
  key: string;
  logoId: string;
}

function supportsHover(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: hover)').matches;
}

function computePreviewPosition(seed: number) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const previewWidth = 260;
  const contentWidth = 760;
  const contentLeft = viewportWidth / 2 - contentWidth / 2;
  const contentRight = contentLeft + contentWidth;
  const edgeMargin = 20;

  const leftMin = edgeMargin;
  const leftMax = Math.max(leftMin, contentLeft - previewWidth - 10);
  const rightMin = contentRight + 10;
  const rightMax = Math.max(rightMin, viewportWidth - previewWidth - edgeMargin);

  const leftAvailable = leftMax - leftMin;
  const rightAvailable = rightMax - rightMin;

  let x = leftMin;
  const goRight = seededRandom(seed * 2) > 0.5;

  if ((goRight && rightAvailable > 0) || leftAvailable <= 0) {
    x = rightMin + Math.max(0, rightAvailable) * seededRandom(seed * 3);
  } else {
    x = leftMin + Math.max(0, leftAvailable) * seededRandom(seed * 3);
  }

  const yMin = 80;
  const yMax = Math.max(yMin, viewportHeight * 0.55);
  const y = yMin + (yMax - yMin) * seededRandom(seed * 5);

  return { x, y };
}

function buildUnknownLogo(id: string, card?: LogoCard) {
  const hasImage = Boolean(card?.logoFile);
  const classSlug = id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  return {
    id,
    definition: {
      id,
      variant: 'logo' as const,
      className: `logo logo-${classSlug}`,
      imageSrc: hasImage ? toPublicPath(card?.logoFile ?? '') : undefined,
      alt: id
    },
    card: {
      caption: card?.caption ?? '',
      color: card?.color ?? '#1a1a1a',
      link: normalizeLinkUrl(card?.link ?? ''),
      linkText: card?.linkText ?? ''
    },
    isProject: false,
    hoverMedia: ''
  };
}

function legacyParagraphToPieces(template: string, paragraphIndex: number): ParagraphPiece[] {
  const pieces: ParagraphPiece[] = [];

  tokenizeParagraph(template).forEach((part, partIndex) => {
    if (typeof part === 'string') {
      pieces.push({
        kind: 'text',
        key: `legacy-text-${paragraphIndex}-${partIndex}`,
        text: part
      });
      return;
    }

    pieces.push({
      kind: 'logo',
      key: `legacy-logo-${paragraphIndex}-${partIndex}-${part.id}`,
      logoId: part.id
    });
  });

  return pieces;
}

function portableParagraphToPieces(block: PortfolioParagraphBlock, paragraphIndex: number): ParagraphPiece[] {
  const pieces: ParagraphPiece[] = [];
  const markDefByKey = new Map((block.markDefs ?? []).map((markDef) => [markDef._key, markDef]));
  let lastReferenceMarkKey: string | null = null;

  (block.children ?? []).forEach((child, childIndex) => {
    const marks = child.marks ?? [];
    const referenceMarkKey =
      marks.find((mark) => {
        const markDef = markDefByKey.get(mark);
        return markDef?._type === 'portfolioReference' && Boolean(markDef.logoId?.trim());
      }) ?? null;

    if (referenceMarkKey) {
      const markDef = markDefByKey.get(referenceMarkKey);
      const logoId = markDef?.logoId?.trim() ?? '';

      if (!logoId) {
        if (child.text) {
          pieces.push({
            kind: 'text',
            key: `portable-text-${paragraphIndex}-${childIndex}`,
            text: child.text
          });
        }

        lastReferenceMarkKey = null;
        return;
      }

      if (referenceMarkKey !== lastReferenceMarkKey) {
        pieces.push({
          kind: 'logo',
          key: `portable-logo-${paragraphIndex}-${childIndex}-${referenceMarkKey}`,
          logoId
        });
      }

      lastReferenceMarkKey = referenceMarkKey;
      return;
    }

    if (child.text) {
      pieces.push({
        kind: 'text',
        key: `portable-text-${paragraphIndex}-${childIndex}`,
        text: child.text
      });
    }

    lastReferenceMarkKey = null;
  });

  return pieces;
}

function EmailCopy({ email, className = '' }: { email: string; className?: string }) {
  const [isCopied, setIsCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 900);
    } catch {
      setIsCopied(false);
    }
  };

  return (
    <span className={`email-copy ${className} ${isCopied ? 'copied' : ''}`} data-email={email} onClick={onCopy}>
      <span className="email-copy-text">{email}</span>
      <svg className="email-copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </span>
  );
}

export function PortfolioPage({ content }: PortfolioPageProps) {
  const [hoverState, setHoverState] = useState<HoverState>(null);
  const [activeCaseStudy, setActiveCaseStudy] = useState<string | null>(null);

  const caseStudySlugs = useMemo(() => new Set(getCaseStudySlugs(content)), [content]);
  const paragraphPieces = useMemo(() => {
    if (content.paragraphBlocks?.length) {
      return content.paragraphBlocks.map((block, index) => portableParagraphToPieces(block, index));
    }

    return content.paragraphs.map((template, index) => legacyParagraphToPieces(template, index));
  }, [content]);

  const openCaseStudy = useCallback(
    (slug: string, pushHistory = true) => {
      if (!caseStudySlugs.has(slug)) return;

      setActiveCaseStudy(slug);
      setHoverState(null);

      if (pushHistory) {
        const safeSlug = encodeURIComponent(slug);
        window.history.pushState({ project: slug }, '', `#${safeSlug}`);
      }
    },
    [caseStudySlugs]
  );

  const closeCaseStudy = useCallback((clearHash = true) => {
    setActiveCaseStudy(null);

    if (clearHash) {
      window.history.pushState({}, '', `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const rawHash = window.location.hash.replace(/^#/, '');
      const slug = decodeURIComponent(rawHash);

      if (slug && caseStudySlugs.has(slug)) {
        setActiveCaseStudy(slug);
      } else {
        setActiveCaseStudy(null);
      }
    };

    syncFromHash();
    window.addEventListener('popstate', syncFromHash);
    window.addEventListener('hashchange', syncFromHash);

    return () => {
      window.removeEventListener('popstate', syncFromHash);
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [caseStudySlugs]);

  const onLogoMouseEnter = useCallback(
    (event: MouseEvent<HTMLElement>, logoId: string, instanceSeed: number) => {
      if (!supportsHover()) return;

      const resolved = resolveLogo(logoId, content) ?? buildUnknownLogo(logoId, content.logoCards[logoId]);
      const media = resolved.hoverMedia ? encodeURI(toPublicPath(resolved.hoverMedia)) : '';

      if (resolved.isProject || media) {
        const pos = computePreviewPosition(instanceSeed);
        setHoverState({
          kind: 'preview',
          media,
          isVideo: Boolean(media && isVideoAsset(media)),
          isProject: resolved.isProject,
          hasMedia: Boolean(media),
          x: pos.x,
          y: pos.y
        });
        return;
      }

      const caption = resolved.card.link && resolved.card.linkText ? resolved.card.linkText : resolved.card.caption;
      if (!caption) {
        setHoverState(null);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      setHoverState({
        kind: 'tooltip',
        caption,
        hasLink: Boolean(resolved.card.link),
        x: rect.left + rect.width / 2,
        y: rect.top - 12
      });
    },
    [content]
  );

  const onLogoMouseLeave = useCallback(() => {
    if (!supportsHover()) return;
    setHoverState(null);
  }, []);

  const onLogoClick = useCallback(
    (event: MouseEvent<HTMLElement>, logoId: string) => {
      const resolved = resolveLogo(logoId, content) ?? buildUnknownLogo(logoId, content.logoCards[logoId]);

      if (resolved.isProject) {
        event.preventDefault();
        openCaseStudy(logoId, true);
        return;
      }

      if (resolved.card.link) {
        event.preventDefault();
        window.open(resolved.card.link, '_blank', 'noopener,noreferrer');
      }
    },
    [content, openCaseStudy]
  );

  let logoSeed = 0;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="gradient-top" />
      <div className="gradient-bottom" />

      <nav className="top-nav">
        <div className="top-nav-inner">
          <span>BRAND STRATEGY</span>
          <span className="separator" style={{ marginLeft: '-2px' }} />
          <span>NEW YORK</span>
          <span className="separator desktop-only" />
          <EmailCopy email="HELLO@JORDANSOWUNMI.COM" className="desktop-only" />
        </div>
      </nav>

      <main className="content">
        {paragraphPieces.map((pieces, paragraphIndex) => (
          <p key={`paragraph-${paragraphIndex}`} data-para={paragraphIndex}>
            {pieces.map((piece, partIndex) => {
              if (piece.kind === 'text') {
                return (
                  <Fragment key={piece.key}>
                    <span className="fade-item">{piece.text}</span>
                  </Fragment>
                );
              }

              logoSeed += 1;
              const seedForToken = logoSeed;
              const logoId = piece.logoId;
              const resolved = resolveLogo(logoId, content) ?? buildUnknownLogo(logoId, content.logoCards[logoId]);
              const className = `${resolved.definition.className}${resolved.isProject ? ' logo-project' : ''} fade-item`;
              const tokenKey = piece.key || `token-${paragraphIndex}-${partIndex}-${logoId}`;

              const commonProps = {
                className,
                'data-logo-id': logoId,
                'data-hover-img': resolved.hoverMedia,
                'data-card-caption': resolved.card.caption,
                'data-card-color': resolved.card.color,
                onMouseEnter: (event: MouseEvent<HTMLElement>) => onLogoMouseEnter(event, logoId, seedForToken),
                onMouseLeave: onLogoMouseLeave,
                onClick: (event: MouseEvent<HTMLElement>) => onLogoClick(event, logoId)
              };

              if (resolved.definition.variant === 'name') {
                return (
                  <span key={tokenKey} {...commonProps}>
                    {resolved.definition.text ?? logoId}
                  </span>
                );
              }

              const card = content.logoCards[logoId];
              const overrideImage = card?.logoFile;
              const imageSource = overrideImage
                ? toPublicPath(overrideImage)
                : resolved.definition.imageSrc ?? '';
              if (imageSource) {
                const w = card?.logoWidth;
                const h = card?.logoHeight;
                return (
                  <span key={tokenKey} {...commonProps}>
                    <img
                      src={encodeURI(imageSource)}
                      alt={resolved.definition.alt ?? logoId}
                      loading="lazy"
                      {...(w && h ? { width: w, height: h, style: { aspectRatio: `${w} / ${h}` } } : {})}
                    />
                  </span>
                );
              }

              return (
                <span key={tokenKey} {...commonProps}>
                  {logoId}
                </span>
              );
            })}
          </p>
        ))}

        <p>
          <span className="desktop-only">To discuss a project or just say hi, email me at: </span>
          <span className="mobile-only">To discuss a project or just say hi: </span>
          <EmailCopy email="hello@jordansowunmi.com" />
        </p>
      </main>

      {hoverState?.kind === 'preview' ? (
        <div
          className={`hover-preview visible ${hoverState.isProject ? 'is-project' : ''} ${
            hoverState.isProject && !hoverState.hasMedia ? 'no-media' : ''
          }`}
          style={{ left: hoverState.x, top: hoverState.y }}
        >
          {hoverState.hasMedia ? (
            hoverState.isVideo ? (
              <video src={hoverState.media} autoPlay muted loop playsInline />
            ) : (
              <img src={hoverState.media} alt="" />
            )
          ) : null}
        </div>
      ) : null}

      {hoverState?.kind === 'tooltip' ? (
        <div
          className="logo-tooltip visible"
          style={{ left: hoverState.x, top: hoverState.y, transform: 'translate(-50%, -100%)' }}
        >
          {hoverState.caption}
          {hoverState.hasLink ? (
            <span className="tooltip-arrow" aria-hidden="true">
              <svg viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M2.2 7.8 L7.8 2.2 M3.6 2.2 L7.8 2.2 L7.8 6.4"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          ) : null}
        </div>
      ) : null}

      <CaseStudyModal slug={activeCaseStudy} content={content} onClose={() => closeCaseStudy(true)} />

      <footer className="mobile-footer">
        <EmailCopy email="HELLO@JORDANSOWUNMI.COM" />
      </footer>
    </div>
  );
}
