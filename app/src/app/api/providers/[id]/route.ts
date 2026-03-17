import { NextRequest, NextResponse } from "next/server";
import { getDb, getCloudProviderById, updateCloudProvider, deleteCloudProvider } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    const existing = getCloudProviderById(db, params.id);
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    const body = await req.json();
    updateCloudProvider(db, params.id, {
      label: body.label,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      selectedModel: body.selectedModel,
      useForJudging: body.useForJudging,
      useForPlayground: body.useForPlayground,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    deleteCloudProvider(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
