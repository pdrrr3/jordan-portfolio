import { NextResponse } from 'next/server';

import { getCmsProvider } from '@/server/cms/provider';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const filePart = formData.get('file');
    const folderPart = formData.get('folder');

    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Missing file upload' }, { status: 400 });
    }

    const bytes = Buffer.from(await filePart.arrayBuffer());
    const provider = getCmsProvider();
    const asset = await provider.uploadAsset({
      filename: filePart.name,
      mimeType: filePart.type || 'application/octet-stream',
      bytes,
      folder: typeof folderPart === 'string' ? folderPart : undefined
    });

    const assets = await provider.listAssets();

    return NextResponse.json({
      asset,
      assets
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to upload asset'
      },
      { status: 500 }
    );
  }
}
