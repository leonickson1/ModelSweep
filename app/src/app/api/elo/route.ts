import { NextResponse } from "next/server";
import { getDb, getEloRatings } from "@/lib/db";
import { computeConfidence, getEloRange } from "@/lib/elo";

export async function GET() {
    try {
        const db = getDb();
        const rows = getEloRatings(db);

        const ratings = rows.map((r) => {
            const confidence = computeConfidence(r.match_count);
            const range = getEloRange(r.rating, confidence);
            return {
                modelName: r.model_name,
                rating: Math.round(r.rating),
                matchCount: r.match_count,
                confidence,
                range,
                lastUpdated: r.last_updated,
            };
        });

        return NextResponse.json({ ratings });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
