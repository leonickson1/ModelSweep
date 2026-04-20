import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { parseDocument, chunkText } from "@/lib/rag-engine";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const suiteId = formData.get("suiteId") as string | null;

    if (!file || !suiteId) {
      return NextResponse.json(
        { error: "file and suiteId are required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "text/plain";

    // Parse document
    const content = await parseDocument(buffer, mimeType);
    if (!content.trim()) {
      return NextResponse.json(
        { error: "Document appears to be empty or could not be parsed" },
        { status: 400 }
      );
    }

    const db = getDb();
    const docId = randomUUID();

    // Save document
    db.prepare(`
      INSERT INTO rag_documents (id, suite_id, filename, mime_type, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(docId, suiteId, file.name, mimeType, content, new Date().toISOString());

    // Chunk document
    const chunks = chunkText(content, 500, 64);

    const insertChunk = db.prepare(`
      INSERT INTO rag_chunks (id, document_id, text, source, token_count, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const chunkIds: string[] = [];
    const insertAll = db.transaction(() => {
      chunks.forEach((chunk, i) => {
        const chunkId = randomUUID();
        chunkIds.push(chunkId);
        insertChunk.run(chunkId, docId, chunk.text, chunk.source, chunk.tokenCount, i);
      });
    });
    insertAll();

    return NextResponse.json({
      documentId: docId,
      filename: file.name,
      contentLength: content.length,
      chunkCount: chunks.length,
      chunkIds,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to process document: ${err}` },
      { status: 500 }
    );
  }
}
