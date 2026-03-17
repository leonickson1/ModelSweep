import { NextRequest, NextResponse } from "next/server";
import { getDb, getRunById, getSuiteById } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    const run = getRunById(db, params.id);
    if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

    const format = req.nextUrl.searchParams.get("format") || "json";

    if (format === "json") {
      return new NextResponse(JSON.stringify(run, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="modelsweep-run-${params.id.slice(0, 8)}.json"`,
        },
      });
    }

    if (format === "csv") {
      const rows: string[] = [];
      rows.push("model,prompt_index,auto_score,judge_score,human_vote,tokens_per_sec,timed_out");

      const runData = run as Record<string, unknown>;
      const models = runData.models as Record<string, unknown>[];

      for (const model of models) {
        const promptResults = model.promptResults as Record<string, unknown>[];
        for (let i = 0; i < promptResults.length; i++) {
          const pr = promptResults[i];
          const autoScores = pr.autoScores as Record<string, unknown>;
          const judgeScores = pr.judgeScores as Record<string, number> | null;

          // Compute auto score from checks
          let autoScore = 100;
          if (!autoScores.formatCompliance) autoScore -= 20;
          if (!autoScores.lengthCompliance) autoScore -= 10;
          if (autoScores.codeValidity === false) autoScore -= 25;
          if (autoScores.refusalDetected) autoScore -= 50;
          if ((autoScores.repetitionScore as number) > 0.5) autoScore -= 30;
          autoScore = Math.max(0, autoScore);

          const judgeScore = judgeScores
            ? Math.round(((judgeScores.score as number) ?? 0))
            : "";

          rows.push([
            `"${model.model_name}"`,
            i,
            autoScore,
            judgeScore,
            pr.manual_vote || "",
            pr.tokens_per_sec,
            pr.timed_out ? 1 : 0,
          ].join(","));
        }
      }

      return new NextResponse(rows.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="modelsweep-run-${params.id.slice(0, 8)}.csv"`,
        },
      });
    }

    if (format === "md") {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const runData = run as Record<string, any>;
      const models = (runData.models || []) as Record<string, any>[];
      const suiteType = (runData.suite_type || "standard") as string;

      // Fetch suite for prompt texts
      const suite = runData.suite_id ? getSuiteById(db, runData.suite_id) : null;

      const prompts = (suite as any)?.prompts || [];

      // Fetch suite-type-specific results

      let toolCallResults: Record<string, any>[] = [];

      let conversationResults: Record<string, any>[] = [];

      let adversarialResults: Record<string, any>[] = [];

      if (suiteType === "tool_calling") {
        toolCallResults = db.prepare("SELECT * FROM tool_call_results WHERE run_id = ?").all(params.id) as Record<string, any>[];
        toolCallResults = toolCallResults.map(r => ({
          ...r,
          actual_tool_calls: JSON.parse(r.actual_tool_calls || "[]"),
          score: JSON.parse(r.score || "{}"),
        }));
      } else if (suiteType === "conversation") {
        conversationResults = db.prepare("SELECT * FROM conversation_results WHERE run_id = ?").all(params.id) as Record<string, any>[];
        conversationResults = conversationResults.map(r => ({
          ...r,
          history: JSON.parse(r.history || "[]"),
          score: JSON.parse(r.score || "{}"),
        }));
      } else if (suiteType === "adversarial") {
        adversarialResults = db.prepare("SELECT * FROM adversarial_results WHERE run_id = ?").all(params.id) as Record<string, any>[];
        adversarialResults = adversarialResults.map(r => ({
          ...r,
          history: JSON.parse(r.history || "[]"),
          breaches: JSON.parse(r.breaches || "[]"),
          score: JSON.parse(r.score || "{}"),
        }));
      }

      // Helper functions
      const formatDate = (iso: string) => {
        try {
          return new Date(iso).toLocaleString("en-US", {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit",
          });
        } catch { return iso; }
      };

      const formatDuration = (ms: number) => {
        if (!ms || ms <= 0) return "N/A";
        const totalSec = Math.round(ms / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
      };

      const truncate = (text: string, max = 500) => {
        if (!text) return "(no response)";
        return text.length > max ? text.slice(0, max) + "..." : text;
      };

      const num = (v: unknown, decimals = 1) => {
        const n = Number(v);
        return isNaN(n) ? "N/A" : n.toFixed(decimals);
      };

      const pct = (v: unknown) => {
        const n = Number(v);
        return isNaN(n) ? "N/A" : `${Math.round(n)}%`;
      };

      // Find winner
      const nonSkipped = models.filter(m => !m.skipped);
      const winner = nonSkipped.length > 0
        ? nonSkipped.reduce((best, m) => (Number(m.overall_score) > Number(best.overall_score) ? m : best), nonSkipped[0])
        : null;

      // Compute total duration
      const started = runData.started_at ? new Date(runData.started_at).getTime() : 0;
      const completed = runData.completed_at ? new Date(runData.completed_at).getTime() : 0;
      const totalRunDuration = started && completed ? completed - started : 0;

      // Build markdown
      const lines: string[] = [];

      // Header
      lines.push("# ModelSweep Evaluation Report");
      lines.push(`**Suite:** ${runData.suite_name || "Unknown"} | **Type:** ${suiteType} | **Date:** ${formatDate(runData.started_at)}`);
      lines.push("");

      // Summary
      lines.push("## Summary");
      lines.push(`- Models tested: ${models.length}`);
      lines.push(`- Duration: ${formatDuration(totalRunDuration)}`);
      lines.push(`- Judge: ${runData.judge_enabled && runData.judge_model ? runData.judge_model : "None"}`);
      if (winner) {
        lines.push(`- Winner: ${winner.model_name} (${pct(winner.overall_score)})`);
      }
      if (runData.temperature != null) lines.push(`- Temperature: ${runData.temperature}`);
      if (runData.top_p != null) lines.push(`- Top-P: ${runData.top_p}`);
      if (runData.max_tokens != null) lines.push(`- Max tokens: ${runData.max_tokens}`);
      lines.push("");

      // Model Rankings
      lines.push("## Model Rankings");
      lines.push("| Rank | Model | Score | Speed | Params |");
      lines.push("|------|-------|-------|-------|--------|");
      const sorted = [...models].sort((a, b) => Number(b.overall_score) - Number(a.overall_score));
      sorted.forEach((m, i) => {
        const score = m.skipped ? "Skipped" : pct(m.overall_score);
        const speed = m.skipped ? "N/A" : `${num(m.avg_tokens_per_sec)} t/s`;
        lines.push(`| ${i + 1} | ${m.model_name} | ${score} | ${speed} | ${m.parameter_size || "N/A"} |`);
      });
      lines.push("");

      // Category Breakdown (standard suites)
      if (suiteType === "standard") {
        const cats = new Set<string>();
        for (const m of models) {
          if (m.categoryScores) {
            for (const k of Object.keys(m.categoryScores)) cats.add(k);
          }
        }
        const catList = Array.from(cats).sort();
        if (catList.length > 0) {
          lines.push("## Category Breakdown");
          lines.push(`| Model | ${catList.join(" | ")} |`);
          lines.push(`|-------|${catList.map(() => "------").join("|")}|`);
          for (const m of sorted) {
            const scores = m.categoryScores || {};
            const vals = catList.map(c => scores[c] != null ? pct(scores[c]) : "N/A");
            lines.push(`| ${m.model_name} | ${vals.join(" | ")} |`);
          }
          lines.push("");
        }
      }

      // Speed Metrics
      lines.push("## Speed Metrics");
      lines.push("| Model | Tokens/sec | Avg TTFT | Duration |");
      lines.push("|-------|-----------|----------|----------|");
      for (const m of sorted) {
        if (m.skipped) {
          lines.push(`| ${m.model_name} | Skipped | ${m.skip_reason || "N/A"} | N/A |`);
        } else {
          lines.push(`| ${m.model_name} | ${num(m.avg_tokens_per_sec)} | ${num(m.avg_ttft)}ms | ${formatDuration(Number(m.total_duration))} |`);
        }
      }
      lines.push("");

      // Detailed Results (standard/prompts)
      if ((suiteType === "standard" || !suiteType) && prompts.length > 0) {
        lines.push("## Detailed Results");
        lines.push("");

        // Build prompt lookup by id
        const promptMap = new Map<string, Record<string, any>>();
        for (const p of prompts) {
          promptMap.set(p.id, p);
        }

        // Collect unique prompt_ids from results in order
        const seenPrompts: string[] = [];
        for (const m of sorted) {
          for (const pr of (m.promptResults || [])) {
            if (!seenPrompts.includes(pr.prompt_id)) seenPrompts.push(pr.prompt_id);
          }
        }

        for (let pi = 0; pi < seenPrompts.length; pi++) {
          const promptId = seenPrompts[pi];
          const prompt = promptMap.get(promptId);
          const promptText = prompt?.text || `Prompt ${pi + 1}`;
          const category = prompt?.category || "general";
          const difficulty = prompt?.difficulty || "medium";

          lines.push(`### Prompt ${pi + 1}: "${truncate(promptText, 100)}"`);
          lines.push(`**Category:** ${category} | **Difficulty:** ${difficulty}`);
          lines.push("");

          for (const m of sorted) {
            const pr = (m.promptResults || []).find((r: any) => r.prompt_id === promptId);
            if (!pr) continue;

            const autoScores = pr.autoScores || {};
            const judgeScores = pr.judgeScores;

            // Compute auto score
            let autoScore = 100;
            if (!autoScores.formatCompliance) autoScore -= 20;
            if (!autoScores.lengthCompliance) autoScore -= 10;
            if (autoScores.codeValidity === false) autoScore -= 25;
            if (autoScores.refusalDetected) autoScore -= 50;
            if ((autoScores.repetitionScore as number) > 0.5) autoScore -= 30;
            autoScore = Math.max(0, autoScore);

            const rubricStr = autoScores.rubricScore != null ? `Rubric: ${num(autoScores.rubricScore, 0)}/5` : "";
            const gateStr = autoScores.gatePass ? "Pass" : autoScores.gateFlag ? "Flagged" : "N/A";

            lines.push(`#### ${m.model_name} (Score: ${pct(autoScore)})`);
            lines.push(`> ${truncate(pr.response || "")}`);
            lines.push("");

            const checks: string[] = [];
            checks.push(`Auto Checks: ${gateStr}`);
            if (rubricStr) checks.push(rubricStr);
            if (judgeScores) {
              const jParts = [];
              if (judgeScores.accuracy != null) jParts.push(`${num(judgeScores.accuracy, 0)}/5 ACC`);
              if (judgeScores.helpfulness != null) jParts.push(`${num(judgeScores.helpfulness, 0)}/5 HLP`);
              if (judgeScores.clarity != null) jParts.push(`${num(judgeScores.clarity, 0)}/5 CLR`);
              if (judgeScores.instructionFollowing != null) jParts.push(`${num(judgeScores.instructionFollowing, 0)}/5 INS`);
              if (jParts.length > 0) checks.push(`Judge: ${jParts.join(", ")}`);
            }
            if (pr.manual_vote) checks.push(`Human Vote: ${pr.manual_vote}`);
            lines.push(`**${checks.join(" | ")}**`);
            if (pr.timed_out) lines.push("*Timed out*");
            lines.push("");
          }
        }
      }

      // Tool Calling Results
      if (suiteType === "tool_calling" && toolCallResults.length > 0) {
        lines.push("## Tool Calling Results");
        lines.push("");

        // Summary table per model
        const modelToolScores = new Map<string, { selection: number[]; params: number[]; restraint: number[]; sequence: number[]; overall: number[] }>();
        for (const r of toolCallResults) {
          if (!modelToolScores.has(r.model_name)) {
            modelToolScores.set(r.model_name, { selection: [], params: [], restraint: [], sequence: [], overall: [] });
          }
          const entry = modelToolScores.get(r.model_name)!;
          const s = r.score || {};
          if (s.toolSelection != null) entry.selection.push(s.toolSelection);
          if (s.paramAccuracy != null) entry.params.push(s.paramAccuracy);
          if (s.toolRestraint != null) entry.restraint.push(s.toolRestraint);
          if (s.sequenceOrder != null) entry.sequence.push(s.sequenceOrder);
          entry.overall.push(Number(r.overall_score) || 0);
        }

        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

        lines.push("| Model | Selection | Params | Restraint | Sequence | Overall |");
        lines.push("|-------|-----------|--------|-----------|----------|---------|");
        for (const [name, scores] of Array.from(modelToolScores)) {
          lines.push(`| ${name} | ${num(avg(scores.selection))}/5 | ${num(avg(scores.params))}/5 | ${num(avg(scores.restraint))}/5 | ${num(avg(scores.sequence))}/5 | ${pct(avg(scores.overall))} |`);
        }
        lines.push("");

        // Scenario details
        lines.push("### Scenario Details");
        lines.push("");

        // Group by scenario_id
        const toolScenarioMap = new Map<string, Record<string, any>>();
        const suiteToolScenarios = (suite as any)?.toolScenarios || [];
        for (const s of suiteToolScenarios) {
          toolScenarioMap.set(s.id, s);
        }

        const scenarioIds = Array.from(new Set(toolCallResults.map(r => r.scenario_id)));
        for (const scenarioId of scenarioIds) {
          const scenario = toolScenarioMap.get(scenarioId);
          const scenarioLabel = scenario?.userMessage || scenario?.user_message || scenarioId;
          lines.push(`**Scenario:** "${truncate(scenarioLabel, 100)}"`);
          lines.push("");

          const scenarioResults = toolCallResults.filter(r => r.scenario_id === scenarioId);
          for (const r of scenarioResults) {
            const expected = scenario?.expectedToolCalls || scenario?.expected_tool_calls || [];
            const actual = r.actual_tool_calls || [];
            const pass = Number(r.overall_score) >= 80 ? "PASS" : "FAIL";

            lines.push(`- **${r.model_name}** [${pass}]`);
            if (expected.length > 0) {
              const expStr = expected.map((e: any) => {
                const name = e.name || e.function?.name || "?";
                const args = e.arguments || e.params || {};
                return `${name}(${Object.entries(args).map(([k, v]) => `${k}="${v}"`).join(", ")})`;
              }).join(", ");
              lines.push(`  - Expected: ${expStr}`);
            }
            if (actual.length > 0) {
              const actStr = actual.map((a: any) => {
                const name = a.name || a.function?.name || "?";
                const args = a.arguments || {};
                return `${name}(${Object.entries(args).map(([k, v]) => `${k}="${v}"`).join(", ")})`;
              }).join(", ");
              lines.push(`  - Actual: ${actStr}`);
            } else {
              const snippet = r.text_response ? truncate(r.text_response, 100) : "(no response)";
              lines.push(`  - Actual: No tool called — ${snippet}`);
            }
            lines.push("");
          }
        }
      }

      // Conversation Results
      if (suiteType === "conversation" && conversationResults.length > 0) {
        lines.push("## Conversation Dimensions");
        lines.push("");

        const dims = ["contextRetention", "personaConsistency", "factualConsistency", "qualityMaintenance", "policyAdherence", "empathy"];
        const dimLabels = ["Context", "Persona", "Factual", "Quality", "Policy", "Empathy"];

        lines.push(`| Model | ${dimLabels.join(" | ")} | Overall |`);
        lines.push(`|-------|${dimLabels.map(() => "-------").join("|")}|---------|`);

        // Group by model
        const modelConvoScores = new Map<string, { dims: Record<string, number[]>; overall: number[] }>();
        for (const r of conversationResults) {
          if (!modelConvoScores.has(r.model_name)) {
            modelConvoScores.set(r.model_name, { dims: {}, overall: [] });
          }
          const entry = modelConvoScores.get(r.model_name)!;
          const s = r.score || {};
          for (const d of dims) {
            if (!entry.dims[d]) entry.dims[d] = [];
            if (s[d] != null) entry.dims[d].push(s[d]);
          }
          entry.overall.push(Number(r.overall_score) || 0);
        }

        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

        for (const [name, scores] of Array.from(modelConvoScores)) {
          const dimVals = dims.map(d => scores.dims[d] ? num(avg(scores.dims[d])) : "N/A");
          lines.push(`| ${name} | ${dimVals.join(" | ")} | ${pct(avg(scores.overall))} |`);
        }
        lines.push("");
      }

      // Adversarial Results
      if (suiteType === "adversarial" && adversarialResults.length > 0) {
        lines.push("## Robustness Report");
        lines.push("");

        lines.push("| Model | Robustness | Breaches | Survived | Avg Turns to Breach |");
        lines.push("|-------|-----------|----------|----------|---------------------|");

        // Group by model
        const modelAdvScores = new Map<string, { robustness: number[]; breachCount: number; survived: number; total: number; turnsToFirstBreach: number[] }>();
        for (const r of adversarialResults) {
          if (!modelAdvScores.has(r.model_name)) {
            modelAdvScores.set(r.model_name, { robustness: [], breachCount: 0, survived: 0, total: 0, turnsToFirstBreach: [] });
          }
          const entry = modelAdvScores.get(r.model_name)!;
          entry.robustness.push(Number(r.robustness_score) || 0);
          entry.total++;
          if (r.survived) entry.survived++;
          const breaches = r.breaches || [];
          entry.breachCount += breaches.length;
          if (r.turns_to_first_breach != null) entry.turnsToFirstBreach.push(r.turns_to_first_breach);
        }

        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

        for (const [name, scores] of Array.from(modelAdvScores)) {
          const avgRobust = pct(avg(scores.robustness));
          const avgTurns = scores.turnsToFirstBreach.length > 0 ? num(avg(scores.turnsToFirstBreach), 0) : "N/A";
          lines.push(`| ${name} | ${avgRobust} | ${scores.breachCount} | ${scores.survived}/${scores.total} | ${avgTurns} |`);
        }
        lines.push("");
      }

      // Footer
      lines.push("---");
      lines.push("Generated by ModelSweep");
      lines.push("");

      const md = lines.join("\n");

      return new NextResponse(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="modelsweep-run-${params.id.slice(0, 8)}.md"`,
        },
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }

    return NextResponse.json({ error: "unsupported format" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
