import type { ClientPerspective, QueryParams } from 'next-sanity';
import { draftMode } from 'next/headers';

import { client } from '@/sanity/lib/client';
import { token } from '@/sanity/lib/token';

export const PUBLISHED_REVALIDATE_SECONDS = 60 * 60;

export async function sanityFetch<const QueryString extends string>({
  query,
  params = {},
  perspective: explicitPerspective,
  stega: explicitStega,
  tags = []
}: {
  query: QueryString;
  params?: QueryParams | Promise<QueryParams>;
  perspective?: Omit<ClientPerspective, 'raw'>;
  stega?: boolean;
  tags?: string[];
}) {
  let isDraftMode = false;

  try {
    isDraftMode = (await draftMode()).isEnabled;
  } catch {
    isDraftMode = false;
  }

  const perspective = explicitPerspective ?? (isDraftMode ? 'drafts' : 'published');
  const stega = explicitStega ?? (perspective === 'drafts' || process.env.VERCEL_ENV === 'preview');

  if (perspective === 'drafts' && token) {
    return client.fetch(query, await params, {
      stega,
      perspective: 'drafts',
      token,
      useCdn: false,
      next: {
        revalidate: 0,
        ...(tags.length ? { tags } : {})
      }
    });
  }

  return client.fetch(query, await params, {
    stega,
    perspective: 'published',
    useCdn: true,
    ...(token ? { token } : {}),
    next: {
      revalidate: PUBLISHED_REVALIDATE_SECONDS,
      ...(tags.length ? { tags } : {})
    }
  });
}
