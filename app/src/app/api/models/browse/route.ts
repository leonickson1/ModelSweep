import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export interface LibraryModel {
  name: string;
  description: string;
  pulls: string;
  tags: string[];
  updated: string;
}

let cache: { models: LibraryModel[]; fetchedAt: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function GET() {
  try {
    // Return cache if fresh
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
      return NextResponse.json({ models: cache.models, cached: true });
    }

    const res = await fetch("https://ollama.com/library", {
      headers: { "User-Agent": "ModelSweep/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`ollama.com returned ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const models: LibraryModel[] = [];

    // Parse model cards from the library page
    $("[id='repo'] li").each((_, el) => {
      const $el = $(el);
      const name = $el.find("h2").first().text().trim();
      const description = $el.find("p").first().text().trim();
      const spans = $el.find("span");
      let pulls = "";
      let updated = "";

      spans.each((_, span) => {
        const text = $(span).text().trim();
        if (text.includes("Pull") || text.includes("K") || text.includes("M")) {
          if (!pulls) pulls = text;
        }
        if (text.includes("ago") || text.includes("Updated")) {
          updated = text;
        }
      });

      if (name) {
        models.push({
          name,
          description: description.slice(0, 200),
          pulls,
          tags: [],
          updated,
        });
      }
    });

    // Fallback: try alternate selectors if the above didn't match
    if (models.length === 0) {
      $("a[href^='/library/']").each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href") || "";
        const name = href.replace("/library/", "").split("/")[0];
        const text = $el.text().trim();

        if (name && !models.find(m => m.name === name)) {
          models.push({
            name,
            description: text.slice(0, 200),
            pulls: "",
            tags: [],
            updated: "",
          });
        }
      });
    }

    cache = { models, fetchedAt: Date.now() };
    return NextResponse.json({ models, cached: false });
  } catch (err) {
    // Return cache even if stale on error
    if (cache) {
      return NextResponse.json({ models: cache.models, cached: true, stale: true });
    }
    return NextResponse.json(
      { error: `Failed to fetch model library: ${err}`, models: [] },
      { status: 502 }
    );
  }
}
