import { NextResponse } from 'next/server';

import { getCmsProvider } from '@/server/cms/provider';
import { assertPortfolioContent } from '@/server/cms/validate';

export const runtime = 'nodejs';

export async function PUT(request: Request) {
  try {
    const payload = await request.json();
    const content = payload?.content ?? payload;
    assertPortfolioContent(content);

    const state = await getCmsProvider().saveStage(content);
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to save staged content'
      },
      { status: 400 }
    );
  }
}
