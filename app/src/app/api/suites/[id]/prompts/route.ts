import { NextRequest, NextResponse } from "next/server";
import { getDb, createPrompt, updatePrompt, deletePrompt } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = randomUUID();
    createPrompt(db, {
      id,
      suiteId: params.id,
      text: body.text || "",
      category: body.category || "custom",
      difficulty: body.difficulty || "medium",
      expectedBehavior: body.expectedBehavior || "general",
      rubric: body.rubric || "",
      variables: body.variables || {},
      maxTokens: body.maxTokens || 1024,
      order: body.order ?? 0,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ...data } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const db = getDb();
    updatePrompt(db, id, data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const db = getDb();
    deletePrompt(db, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
