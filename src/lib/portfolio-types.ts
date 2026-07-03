export interface LogoCard {
  caption?: string;
  color?: string;
  link?: string;
  linkText?: string;
  logoFile?: string;
  logoWidth?: number;
  logoHeight?: number;
}

export interface CaseStudySlide {
  image?: string;
  text?: string;
  title?: string;
}

export interface CaseStudy {
  title?: string;
  role?: string[];
  slides?: CaseStudySlide[];
}

export interface PortfolioContent {
  logoCards: Record<string, LogoCard>;
  caseStudies: Record<string, CaseStudy>;
  paragraphs: string[];
  paragraphBlocks?: PortfolioParagraphBlock[];
}

export interface PortfolioReferenceMarkDef {
  _key: string;
  _type: string;
  logoId?: string;
  referenceType?: string;
}

export interface PortfolioParagraphSpan {
  _key: string;
  _type: 'span';
  text: string;
  marks?: string[];
}

export interface PortfolioParagraphBlock {
  _key: string;
  _type: 'block';
  style?: string;
  children: PortfolioParagraphSpan[];
  markDefs?: PortfolioReferenceMarkDef[];
}

export interface LogoDefinition {
  id: string;
  variant: 'name' | 'logo';
  className: string;
  imageSrc?: string;
  text?: string;
  alt?: string;
  hoverImage?: string;
  defaultCaption?: string;
  defaultColor?: string;
  captionPosition?: 'top' | 'bottom';
}

export interface ParagraphToken {
  id: string;
  raw: string;
}
