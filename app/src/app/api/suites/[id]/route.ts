import { NextRequest, NextResponse } from "next/server";
import { getDb, getSuiteById, updateSuite, deleteSuite } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    const suite = getSuiteById(db, params.id);
    if (!suite) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ suite });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await req.json();
    const db = getDb();
    updateSuite(db, params.id, data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    deleteSuite(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
