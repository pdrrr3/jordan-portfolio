import { NextResponse } from 'next/server';

import { getCmsProvider } from '@/server/cms/provider';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const state = await getCmsProvider().resetStageFromLive();
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to reset stage from live'
      },
      { status: 500 }
    );
  }
}
