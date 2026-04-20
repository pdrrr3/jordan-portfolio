'use client';

import { visionTool } from '@sanity/vision';
import { PluginOptions, defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';

import { apiVersion, dataset, projectId, studioUrl } from './src/sanity/lib/api';
import { pageStructure, singletonPlugin } from './src/sanity/plugins/settings';
import { schemaTypes } from './src/sanity/schemas';
import portfolioPage from './src/sanity/schemas/singletons/portfolioPage';

export default defineConfig({
  basePath: studioUrl,
  projectId: projectId || 'missing-project-id',
  dataset,
  title: 'Jordan Portfolio Studio',
  schema: {
    types: schemaTypes
  },
  plugins: [
    structureTool({ structure: pageStructure([portfolioPage]) }),
    singletonPlugin([portfolioPage.name]),
    process.env.NODE_ENV === 'development' && visionTool({ defaultApiVersion: apiVersion })
  ].filter(Boolean) as PluginOptions[]
});
