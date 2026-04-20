import { NextResponse } from 'next/server';

import { getCmsProvider } from '@/server/cms/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const assets = await getCmsProvider().listAssets();
    return NextResponse.json({ assets });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to list assets'
      },
      { status: 500 }
    );
  }
}
