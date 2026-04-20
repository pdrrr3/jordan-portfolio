'use client';

import { useEffect, useMemo, useState } from 'react';

import { logoRegistry } from '@/data/logo-registry';
import { PortfolioContent } from '@/lib/portfolio-types';
import { isVideoAsset, richTextToHtml, toPublicPath } from '@/lib/portfolio-utils';

interface CaseStudyModalProps {
  slug: string | null;
  content: PortfolioContent;
  onClose: () => void;
}

function getFallbackTitle(slug: string): string {
  const registryItem = logoRegistry[slug];
  if (registryItem?.alt) return registryItem.alt;
  if (registryItem?.text) return registryItem.text;
  return slug;
}

function resolveSlideMedia(slides: Array<{ image?: string }>, currentIndex: number): string {
  for (let idx = currentIndex; idx >= 0; idx -= 1) {
    const media = slides[idx]?.image?.trim();
    if (media) return media;
  }

  return '';
}

export function CaseStudyModal({ slug, content, onClose }: CaseStudyModalProps) {
  const [slideIndex, setSlideIndex] = useState(0);

  const caseStudy = slug ? content.caseStudies[slug] : null;
  const slides = useMemo(() => {
    const candidateSlides = caseStudy?.slides ?? [];
    if (!candidateSlides.length) {
      return [{ image: '', text: '', title: '' }];
    }

    return candidateSlides;
  }, [caseStudy?.slides]);

  useEffect(() => {
    setSlideIndex(0);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [slug]);

  useEffect(() => {
    if (!slug) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }

      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        if (slideIndex < slides.length - 1) {
          setSlideIndex((prev) => prev + 1);
        } else {
          onClose();
        }
      }

      if (event.key === 'ArrowLeft' && slideIndex > 0) {
        setSlideIndex((prev) => prev - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, slideIndex, slides.length, slug]);

  const isOpen = Boolean(slug && caseStudy);
  const title = slug ? caseStudy?.title || getFallbackTitle(slug) : '';
  const roles = Array.isArray(caseStudy?.role) ? caseStudy.role : [];
  const activeSlide = slides[slideIndex] ?? { image: '', text: '', title: '' };
  const resolvedMedia = resolveSlideMedia(slides, slideIndex);
  const publicMediaPath = resolvedMedia ? encodeURI(toPublicPath(resolvedMedia)) : '';
  const mediaIsVideo = publicMediaPath ? isVideoAsset(publicMediaPath) : false;
  const slideHtml = richTextToHtml(activeSlide.text ?? '');

  const advanceSlide = () => {
    if (slideIndex < slides.length - 1) {
      setSlideIndex((prev) => prev + 1);
      return;
    }

    onClose();
  };

  if (!isOpen) {
    return (
      <div className="casestudy-modal" aria-hidden="true">
        <div className="casestudy-backdrop" />
      </div>
    );
  }

  return (
    <div className="casestudy-modal open" role="dialog" aria-modal="true" aria-label={title}>
      <div className="casestudy-backdrop" onClick={advanceSlide} />

      {slides.length > 1 ? (
        <div className="casestudy-progress" style={{ display: 'flex' }}>
          {slides.map((_, index) => (
            <span key={`dot-${index}`} className={`cs-dot ${index === slideIndex ? 'active' : ''}`} />
          ))}
        </div>
      ) : null}

      <button className="casestudy-close" type="button" style={{ display: 'block' }} onClick={onClose}>
        ×
      </button>

      <div className="casestudy-content" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%) scale(1)' }}>
        <div className={`casestudy-slide ${slideIndex === slides.length - 1 ? 'is-last' : ''}`} onClick={advanceSlide}>
          {publicMediaPath ? (
            <div className="casestudy-slide-image">
              {mediaIsVideo ? (
                <video src={publicMediaPath} autoPlay muted loop playsInline />
              ) : (
                <img src={publicMediaPath} alt="" />
              )}
            </div>
          ) : (
            <div className="casestudy-slide-image" style={{ display: 'none' }} />
          )}

          <div className={`casestudy-slide-right ${publicMediaPath ? '' : 'no-media'}`}>
            {slideIndex === 0 ? (
              <div className="casestudy-meta">
                <span className="casestudy-title">{title}</span>
                <span className="casestudy-role">
                  {roles.map((service) => (
                    <span key={service} className="cs-service">
                      {service}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}

            <div className="casestudy-slide-text">
              {activeSlide.title ? <p className="cs-slide-title">{activeSlide.title}</p> : null}
              {slideHtml ? <div dangerouslySetInnerHTML={{ __html: slideHtml }} /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
