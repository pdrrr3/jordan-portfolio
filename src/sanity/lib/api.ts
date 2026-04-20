export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '';
export const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2026-04-20';
export const studioUrl = '/studio';
export const isSanityConfigured = Boolean(projectId);
