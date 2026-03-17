import { NextRequest, NextResponse } from "next/server";
import { getDb, getToolDefinitions, createToolDefinition, updateToolDefinition, deleteToolDefinition } from "@/lib/db";
import crypto from "crypto";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const tools = getToolDefinitions(db, id);
  return NextResponse.json({
    tools: tools.map((t) => ({
      ...t,
      parameters: JSON.parse(t.parameters || "[]"),
      mockReturns: JSON.parse(t.mock_returns || "[]"),
      suiteId: t.suite_id,
      order: t.sort_order,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  const toolId = crypto.randomUUID();
  createToolDefinition(db, {
    id: toolId,
    suiteId: id,
    name: body.name ?? "new_tool",
    description: body.description ?? "",
    parameters: body.parameters ?? [],
    mockReturns: body.mockReturns ?? [],
    order: body.order ?? 0,
  });

  return NextResponse.json({ id: toolId });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const body = await req.json();
  const db = getDb();

  if (!body.id) {
    return NextResponse.json({ error: "Missing tool id" }, { status: 400 });
  }

  updateToolDefinition(db, body.id, {
    name: body.name,
    description: body.description,
    parameters: body.parameters,
    mockReturns: body.mockReturns,
    order: body.order,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const body = await req.json();
  const db = getDb();

  if (!body.id) {
    return NextResponse.json({ error: "Missing tool id" }, { status: 400 });
  }

  deleteToolDefinition(db, body.id);
  return NextResponse.json({ ok: true });
}
