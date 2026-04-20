import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateReportHTML } from "@/lib/report-template";
import { generateVerdict } from "@/lib/scoring";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const runId = params.id;

    // Fetch run data
    const run = db.prepare("SELECT * FROM test_runs WHERE id = ?").get(runId) as Record<string, unknown> | undefined;
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const modelRows = db.prepare("SELECT * FROM model_results WHERE run_id = ? ORDER BY overall_score DESC").all(runId) as Array<Record<string, unknown>>;

    const models = modelRows.map(m => {
      const promptResults = db.prepare(`
        SELECT pr.*, p.text as prompt_text, p.category
        FROM prompt_results pr
        JOIN prompts p ON pr.prompt_id = p.id
        WHERE pr.model_result_id = ?
      `).all(m.id as string) as Array<Record<string, unknown>>;

      const catScores = m.category_scores
        ? (typeof m.category_scores === "string" ? JSON.parse(m.category_scores as string) : m.category_scores) as Record<string, number>
        : {};

      return {
        name: m.model_name as string,
        overallScore: (m.overall_score as number) ?? 0,
        categoryScores: catScores,
        avgTokensPerSec: (m.avg_tokens_per_sec as number) ?? 0,
        promptResults: promptResults.map(pr => ({
          promptText: (pr.prompt_text as string) ?? "",
          response: (pr.response as string) ?? "",
          score: (() => {
            try {
              const auto = typeof pr.auto_scores === "string"
                ? JSON.parse(pr.auto_scores as string)
                : pr.auto_scores;
              return (auto?.rubricScore as number) ?? 0;
            } catch { return 0; }
          })(),
          category: (pr.category as string) ?? "custom",
        })),
      };
    });

    const verdict = generateVerdict(
      models.map(m => ({
        name: m.name,
        overallScore: m.overallScore,
        avgTokensPerSec: m.avgTokensPerSec,
      }))
    );

    let hardware: { class?: string; gpu?: string; ram?: string } | undefined;
    try {
      hardware = typeof run.hardware === "string"
        ? JSON.parse(run.hardware as string)
        : (run.hardware as { class?: string; gpu?: string; ram?: string } | undefined);
    } catch { /* ignore */ }

    const html = generateReportHTML({
      runId,
      suiteName: (run.suite_name as string) ?? "Untitled",
      suiteType: (run.suite_type as string) ?? "standard",
      startedAt: (run.started_at as string) ?? new Date().toISOString(),
      completedAt: (run.completed_at as string) ?? null,
      models,
      judgeModel: (run.judge_model as string) ?? null,
      verdict,
      hardware,
    });

    // Try to use Puppeteer for PDF generation
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const puppeteer = require("puppeteer");
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdf = await page.pdf({
        format: "Letter",
        printBackground: true,
        margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
      });

      await browser.close();

      return new Response(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="modelsweep-report-${runId.slice(0, 8)}.pdf"`,
        },
      });
    } catch {
      // Fallback: return HTML if Puppeteer is not available
      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
          "Content-Disposition": `attachment; filename="modelsweep-report-${runId.slice(0, 8)}.html"`,
        },
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to generate report: ${err}` },
      { status: 500 }
    );
  }
}
