import { NextResponse } from 'next/server';

import { getCmsProvider } from '@/server/cms/provider';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const provider = getCmsProvider();
    const publish = await provider.publish({
      reason: payload?.reason,
      triggerDeployHook: payload?.triggerDeployHook !== false
    });
    const state = await provider.getState();

    return NextResponse.json({
      publish,
      state
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to publish staged content'
      },
      { status: 500 }
    );
  }
}
