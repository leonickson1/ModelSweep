import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const servers = db.prepare("SELECT * FROM mcp_servers ORDER BY created_at DESC").all();
  return NextResponse.json({ servers });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, transport, command, args, url, env } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const db = getDb();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO mcp_servers (id, name, transport, command, args, url, env, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id,
    name,
    transport || "stdio",
    command || null,
    JSON.stringify(args || []),
    url || null,
    JSON.stringify(env || {}),
    new Date().toISOString()
  );

  return NextResponse.json({ id, success: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
