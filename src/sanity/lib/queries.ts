import { defineQuery } from 'next-sanity';

const logoCardFields = `
  "logoId": logoId,
  caption,
  color,
  link,
  linkText,
  "logoFile": coalesce(logoAsset.asset->url, logoFilePath),
  "logoWidth": logoAsset.asset->metadata.dimensions.width,
  "logoHeight": logoAsset.asset->metadata.dimensions.height
`;

const caseStudySlideFields = `
  _key,
  title,
  text,
  "image": coalesce(mediaFile.asset->url, mediaPath)
`;

const caseStudyFields = `
  "id": coalesce(slug.current, logoId),
  logoId,
  title,
  role,
  slides[] {${caseStudySlideFields}}
`;

export const portfolioPageQuery = defineQuery(`
  *[_type == "portfolioPage"][0]{
    navLabelPrimary,
    navLabelSecondary,
    contactEmail,
    paragraphBlocks[]{
      _key,
      _type,
      style,
      children[]{
        _key,
        _type,
        text,
        marks
      },
      markDefs[]{
        ...,
        _type == "portfolioReference" => {
          _key,
          _type,
          "referenceType": reference->_type,
          "logoId": reference->logoId
        }
      }
    },
    "logoCards": *[_type == "logoCard"] | order(coalesce(orderRank, 9999) asc, _updatedAt desc) {
      ${logoCardFields}
    },
    "caseStudies": *[_type == "caseStudy"] | order(coalesce(orderRank, 9999) asc, _updatedAt desc) {
      ${caseStudyFields}
    }
  }
`);
