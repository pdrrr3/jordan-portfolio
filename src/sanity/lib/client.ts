import { createClient } from 'next-sanity';

import { apiVersion, dataset, projectId, studioUrl } from '@/sanity/lib/api';

export const client = createClient({
  projectId: projectId || 'missing-project-id',
  dataset,
  apiVersion,
  useCdn: true,
  perspective: 'published',
  stega: {
    studioUrl,
    logger: console,
    filter: (props) => props.filterDefault(props)
  }
});
