import { NextResponse } from 'next/server';

import { getCmsProvider } from '@/server/cms/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await getCmsProvider().getState();
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load CMS state'
      },
      { status: 500 }
    );
  }
}
