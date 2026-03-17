import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getDb, getPreferences, getSuiteById, createRun,
  saveModelResult, updateModelResult, savePromptResult, completeRun,
  updatePromptJudgeScores, getCloudProviderById,
  saveRubricDimensions, saveJudgeEvaluation,
  getEloRatings, upsertEloRating, saveEloMatch,
  saveToolCallResult,
} from "@/lib/db";
import { OllamaClient } from "@/lib/ollama";
import {
  computeRubricScore, computeCompositeScore,
  computeJudgeScore, computeCategoryScoresV2,
  categoryScoresV2ToLegacy, computeModelOverallScore,
} from "@/lib/scoring";
import { detectModelFamily } from "@/lib/model-colors";
import { cloudChatCompletion } from "@/lib/providers/cloud-inference";
import {
  updateElo, derivePairwiseResults, loadEloState, computeConfidence,
} from "@/lib/elo";
import {
  toOllamaTools, runToolCallingScenario, runErrorRecoveryScenario,
  computeToolCategoryScores,
} from "@/lib/tool-calling-engine";
import { runConversationScenario } from "@/lib/conversation-engine";
import type { ConversationScenario } from "@/lib/conversation-engine";
import { runAdversarialScenario } from "@/lib/adversarial-engine";
import type { AdversarialScenario } from "@/lib/adversarial-engine";
import { saveConversationResult, saveAdversarialResult } from "@/lib/db";
import type { ToolScenario, StoredToolDefinition } from "@/types";

export const maxDuration = 600; // 10 minutes

interface RunEvent {
  type: string;
  [key: string]: unknown;
}

// Per-prompt response collected across models for comparative judging
interface PromptResponseEntry {
  modelName: string;
  promptResultId: string;
  response: string;
  rubricScore: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { suiteId, models: selectedModels, temperature, topP, maxTokens, judgeEnabled, judgeModel } = body;

  if (!suiteId || !selectedModels?.length) {
    return NextResponse.json({ error: "suiteId and models required" }, { status: 400 });
  }

  const db = getDb();
  const prefs = getPreferences(db);
  const suite = getSuiteById(db, suiteId);

  if (!suite) return NextResponse.json({ error: "suite not found" }, { status: 404 });

  const suiteType = (suite as Record<string, unknown>).suite_type as string ?? "standard";
  const isToolCalling = suiteType === "tool_calling";
  const isConversation = suiteType === "conversation";
  const isAdversarial = suiteType === "adversarial";

  if (isToolCalling && (!suite.toolScenarios?.length)) {
    return NextResponse.json({ error: "suite has no scenarios" }, { status: 400 });
  }
  if (isConversation && (!suite.conversationScenarios?.length)) {
    return NextResponse.json({ error: "suite has no conversation scenarios" }, { status: 400 });
  }
  if (isAdversarial && (!suite.adversarialScenarios?.length)) {
    return NextResponse.json({ error: "suite has no adversarial scenarios" }, { status: 400 });
  }
  if (!isToolCalling && !isConversation && !isAdversarial && !suite.prompts?.length) {
    return NextResponse.json({ error: "suite has no prompts" }, { status: 400 });
  }

  const runId = randomUUID();
  const hardware = detectHardware();

  createRun(db, {
    id: runId,
    suiteId,
    suiteName: (suite as Record<string, unknown>).name as string,
    hardware,
    judgeModel: judgeModel || null,
    judgeEnabled: !!judgeEnabled,
    temperature: temperature ?? prefs.defaultTemperature,
    topP: topP ?? prefs.defaultTopP,
    maxTokens: maxTokens ?? prefs.defaultMaxTokens,
    suiteType,
  });

  // Set scoring_version = 2 for this run
  db.prepare("UPDATE test_runs SET scoring_version = 2 WHERE id = ?").run(runId);

  const client = new OllamaClient(prefs.ollamaUrl);

  // ── Tool Calling Run ────────────────────────────────────────────────────
  if (isToolCalling) {
    const toolDefs = suite.toolDefinitions as StoredToolDefinition[];
    const scenarios = suite.toolScenarios as ToolScenario[];
    const ollamaTools = toOllamaTools(toolDefs);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: RunEvent) => {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        send({ type: "run_started", runId, suiteType: "tool_calling" });

        for (let mi = 0; mi < selectedModels.length; mi++) {
          const modelName = selectedModels[mi];
          const modelResultId = randomUUID();
          const family = detectModelFamily(modelName);

          send({ type: "model_start", modelName, modelIndex: mi });

          saveModelResult(db, {
            id: modelResultId, runId, modelName, family,
            parameterSize: "", quantization: "", overallScore: 0,
            categoryScores: {}, avgTokensPerSec: 0, avgTTFT: 0, totalDuration: 0,
            skipped: false, skipReason: null,
          });

          try {
            send({ type: "model_loading", modelName });
            await client.preloadModel(modelName);
            await client.waitForModelLoaded(modelName, 90000);
            send({ type: "model_loaded", modelName });
          } catch (err) {
            send({ type: "model_skipped", modelName, reason: `Failed to load: ${err}` });
            db.prepare("UPDATE model_results SET skipped = 1, skip_reason = ? WHERE id = ?")
              .run(String(err), modelResultId);
            continue;
          }

          const modelStartTime = Date.now();
          const scenarioResults = [];

          for (let si = 0; si < scenarios.length; si++) {
            const scenario = scenarios[si];
            send({
              type: "scenario_start",
              modelName,
              scenarioIndex: si,
              scenarioId: scenario.id,
              scenarioName: scenario.name,
            });

            try {
              const result = scenario.category === "error_recovery"
                ? await runErrorRecoveryScenario(prefs.ollamaUrl, modelName, ollamaTools, scenario)
                : await runToolCallingScenario(prefs.ollamaUrl, modelName, ollamaTools, scenario);

              scenarioResults.push(result);

              saveToolCallResult(db, {
                id: randomUUID(),
                runId,
                modelResultId,
                scenarioId: scenario.id,
                modelName,
                actualToolCalls: result.actualToolCalls,
                textResponse: result.textResponse,
                score: result.score,
                overallScore: result.overallScore,
                latencyMs: result.score.selectionLatencyMs,
              });

              send({
                type: "scenario_done",
                modelName,
                scenarioIndex: si,
                scenarioId: scenario.id,
                score: result.score,
                overallScore: result.overallScore,
                actualToolCalls: result.actualToolCalls,
                textResponse: result.textResponse.substring(0, 500),
              });
            } catch (err) {
              send({
                type: "scenario_error",
                modelName,
                scenarioIndex: si,
                scenarioId: scenario.id,
                error: String(err),
              });
            }
          }

          // Compute model-level scores
          const totalDuration = (Date.now() - modelStartTime) / 1000;
          const avgScore = scenarioResults.length > 0
            ? scenarioResults.reduce((a, b) => a + b.overallScore, 0) / scenarioResults.length
            : 0;
          const avgLatency = scenarioResults.length > 0
            ? scenarioResults.reduce((a, b) => a + b.score.selectionLatencyMs, 0) / scenarioResults.length
            : 0;
          const categoryScores = computeToolCategoryScores(scenarioResults, scenarios);

          updateModelResult(db, modelResultId, {
            overallScore: Math.round(avgScore),
            categoryScores,
            avgTokensPerSec: 0,
            avgTTFT: avgLatency,
            totalDuration,
            parameterSize: "",
            quantization: "",
          });

          send({
            type: "model_done",
            modelName,
            overallScore: Math.round(avgScore),
            categoryScores,
            totalDuration,
            scenarioCount: scenarioResults.length,
          });

          // Unload model
          try { await client.unloadModel(modelName); } catch { /* ignore */ }
        }

        completeRun(db, runId);
        send({ type: "run_complete", runId });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // ── Conversation Run ──────────────────────────────────────────────────
  if (isConversation) {
    const convoScenarios = suite.conversationScenarios as ConversationScenario[];

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: RunEvent) => {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        send({ type: "run_started", runId, suiteType: "conversation" });

        for (let mi = 0; mi < selectedModels.length; mi++) {
          const modelName = selectedModels[mi];
          const modelResultId = randomUUID();
          const family = detectModelFamily(modelName);

          send({ type: "model_start", modelName, modelIndex: mi });

          saveModelResult(db, {
            id: modelResultId, runId, modelName, family,
            parameterSize: "", quantization: "", overallScore: 0,
            categoryScores: {}, avgTokensPerSec: 0, avgTTFT: 0, totalDuration: 0,
            skipped: false, skipReason: null,
          });

          try {
            send({ type: "model_loading", modelName });
            await client.preloadModel(modelName);
            await client.waitForModelLoaded(modelName, 90000);
            send({ type: "model_loaded", modelName });
          } catch (err) {
            send({ type: "model_skipped", modelName, reason: `Failed to load: ${err}` });
            db.prepare("UPDATE model_results SET skipped = 1, skip_reason = ? WHERE id = ?")
              .run(String(err), modelResultId);
            continue;
          }

          const modelStartTime = Date.now();
          const scenarioScores: number[] = [];
          const allTurnSpeeds: number[] = [];
          const allTurnTtfts: number[] = [];

          for (let si = 0; si < convoScenarios.length; si++) {
            const scenario = convoScenarios[si];

            send({
              type: "convo_scenario_start",
              modelName,
              scenarioIndex: si,
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              turnCount: scenario.turnCount,
            });

            try {
              const result = await runConversationScenario(
                prefs.ollamaUrl,
                modelName,
                scenario,
                (turn) => {
                  send({
                    type: "convo_turn",
                    modelName,
                    scenarioIndex: si,
                    scenarioId: scenario.id,
                    role: turn.role,
                    content: turn.content.substring(0, 1000),
                    turnNumber: turn.turnNumber,
                    tokensPerSec: turn.tokensPerSec,
                    ttft: turn.ttft,
                  });
                },
                (msg) => {
                  send({
                    type: "convo_context_warning",
                    modelName,
                    scenarioId: scenario.id,
                    message: msg,
                  });
                },
                (info) => {
                  send({
                    type: "convo_context_update",
                    modelName,
                    scenarioId: scenario.id,
                    contextTokensUsed: info.tokensUsed,
                    contextLimit: info.contextLimit,
                    contextUtilization: info.utilization,
                  });
                }
              );

              scenarioScores.push(result.overallScore);

              // Collect speed metrics from assistant turns
              const assistantTurns = result.history.filter(t => t.role === "assistant");
              for (const t of assistantTurns) {
                if (t.tokensPerSec && t.tokensPerSec > 0) allTurnSpeeds.push(t.tokensPerSec);
                if (t.ttft != null && t.ttft > 0) allTurnTtfts.push(t.ttft);
              }

              saveConversationResult(db, {
                id: randomUUID(),
                runId,
                modelResultId,
                scenarioId: scenario.id,
                modelName,
                history: result.history,
                score: result.score,
                overallScore: result.overallScore,
                actualTurns: result.actualTurnsCompleted,
                contextExhausted: result.contextExhausted,
                totalDuration: result.totalDuration,
              });

              send({
                type: "convo_scenario_done",
                modelName,
                scenarioIndex: si,
                scenarioId: scenario.id,
                overallScore: result.overallScore,
                actualTurns: result.actualTurnsCompleted,
                contextExhausted: result.contextExhausted,
                contextTokensUsed: result.contextTokensUsed,
                contextLimit: result.contextLimit,
                contextUtilization: result.contextUtilization,
                score: result.score,
              });
            } catch (err) {
              send({
                type: "convo_scenario_error",
                modelName,
                scenarioIndex: si,
                scenarioId: scenario.id,
                error: String(err),
              });
            }
          }

          const totalDuration = (Date.now() - modelStartTime) / 1000;
          const avgScore = scenarioScores.length > 0
            ? Math.round(scenarioScores.reduce((a, b) => a + b, 0) / scenarioScores.length)
            : 0;

          const convoAvgTokensPerSec = allTurnSpeeds.length > 0
            ? allTurnSpeeds.reduce((a, b) => a + b, 0) / allTurnSpeeds.length
            : 0;
          const convoAvgTTFT = allTurnTtfts.length > 0
            ? allTurnTtfts.reduce((a, b) => a + b, 0) / allTurnTtfts.length
            : 0;

          updateModelResult(db, modelResultId, {
            overallScore: avgScore,
            categoryScores: {},
            avgTokensPerSec: convoAvgTokensPerSec,
            avgTTFT: convoAvgTTFT,
            totalDuration,
            parameterSize: "",
            quantization: "",
          });

          send({
            type: "model_done",
            modelName,
            overallScore: avgScore,
            avgTokensPerSec: convoAvgTokensPerSec,
            avgTTFT: convoAvgTTFT,
            totalDuration,
            scenarioCount: scenarioScores.length,
          });

          try { await client.unloadModel(modelName); } catch { /* ignore */ }
        }

        completeRun(db, runId);
        send({ type: "run_complete", runId });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // ── Adversarial Run ──────────────────────────────────────────────────
  if (isAdversarial) {
    const advScenarios = suite.adversarialScenarios as AdversarialScenario[];

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: RunEvent) => {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        send({ type: "run_started", runId, suiteType: "adversarial" });

        for (let mi = 0; mi < selectedModels.length; mi++) {
          const modelName = selectedModels[mi];
          const modelResultId = randomUUID();
          const family = detectModelFamily(modelName);

          send({ type: "model_start", modelName, modelIndex: mi });

          saveModelResult(db, {
            id: modelResultId, runId, modelName, family,
            parameterSize: "", quantization: "", overallScore: 0,
            categoryScores: {}, avgTokensPerSec: 0, avgTTFT: 0, totalDuration: 0,
            skipped: false, skipReason: null,
          });

          try {
            send({ type: "model_loading", modelName });
            await client.preloadModel(modelName);
            await client.waitForModelLoaded(modelName, 90000);
            send({ type: "model_loaded", modelName });
          } catch (err) {
            send({ type: "model_skipped", modelName, reason: `Failed to load: ${err}` });
            db.prepare("UPDATE model_results SET skipped = 1, skip_reason = ? WHERE id = ?")
              .run(String(err), modelResultId);
            continue;
          }

          const modelStartTime = Date.now();
          const scenarioScores: number[] = [];
          const advTurnSpeeds: number[] = [];
          const advTurnTtfts: number[] = [];

          for (let si = 0; si < advScenarios.length; si++) {
            const scenario = advScenarios[si];

            send({
              type: "adv_scenario_start",
              modelName,
              scenarioIndex: si,
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              attackStrategy: scenario.attackStrategy,
              maxTurns: scenario.maxTurns,
            });

            try {
              const result = await runAdversarialScenario(
                prefs.ollamaUrl,
                modelName,
                scenario,
                (turn) => {
                  send({
                    type: "adv_turn",
                    modelName,
                    scenarioIndex: si,
                    scenarioId: scenario.id,
                    role: turn.role,
                    content: turn.content.substring(0, 1000),
                    turnNumber: turn.turnNumber,
                    breachDetected: turn.breachDetected,
                    breachType: turn.breachType,
                    fallbackUsed: turn.fallbackUsed,
                    tokensPerSec: turn.tokensPerSec,
                    ttft: turn.ttft,
                  });
                },
                (breach) => {
                  send({
                    type: "adv_breach",
                    modelName,
                    scenarioIndex: si,
                    scenarioId: scenario.id,
                    breach,
                  });
                }
              );

              scenarioScores.push(result.robustnessScore);

              // Collect speed metrics from defender turns
              const defenderTurns = result.history.filter(t => t.role === "defender");
              for (const t of defenderTurns) {
                if (t.tokensPerSec && t.tokensPerSec > 0) advTurnSpeeds.push(t.tokensPerSec);
                if (t.ttft != null && t.ttft > 0) advTurnTtfts.push(t.ttft);
              }

              saveAdversarialResult(db, {
                id: randomUUID(),
                runId,
                modelResultId,
                scenarioId: scenario.id,
                modelName,
                history: result.history,
                breaches: result.breaches,
                score: result.score,
                robustnessScore: result.robustnessScore,
                survived: result.survived,
                turnsToFirstBreach: result.turnsToFirstBreach,
                totalDuration: result.totalDuration,
              });

              send({
                type: "adv_scenario_done",
                modelName,
                scenarioIndex: si,
                scenarioId: scenario.id,
                robustnessScore: result.robustnessScore,
                survived: result.survived,
                breachCount: result.breaches.length,
                turnsToFirstBreach: result.turnsToFirstBreach,
                score: result.score,
              });
            } catch (err) {
              send({
                type: "adv_scenario_error",
                modelName,
                scenarioIndex: si,
                scenarioId: scenario.id,
                error: String(err),
              });
            }
          }

          const totalDuration = (Date.now() - modelStartTime) / 1000;
          const avgScore = scenarioScores.length > 0
            ? Math.round(scenarioScores.reduce((a, b) => a + b, 0) / scenarioScores.length)
            : 0;

          const advAvgTokensPerSec = advTurnSpeeds.length > 0
            ? advTurnSpeeds.reduce((a, b) => a + b, 0) / advTurnSpeeds.length
            : 0;
          const advAvgTTFT = advTurnTtfts.length > 0
            ? advTurnTtfts.reduce((a, b) => a + b, 0) / advTurnTtfts.length
            : 0;

          updateModelResult(db, modelResultId, {
            overallScore: avgScore,
            categoryScores: {},
            avgTokensPerSec: advAvgTokensPerSec,
            avgTTFT: advAvgTTFT,
            totalDuration,
            parameterSize: "",
            quantization: "",
          });

          send({
            type: "model_done",
            modelName,
            overallScore: avgScore,
            avgTokensPerSec: advAvgTokensPerSec,
            avgTTFT: advAvgTTFT,
            totalDuration,
            scenarioCount: scenarioScores.length,
          });

          try { await client.unloadModel(modelName); } catch { /* ignore */ }
        }

        completeRun(db, runId);
        send({ type: "run_complete", runId });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // ── Standard Run ────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RunEvent) => {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      send({ type: "run_started", runId });

      // promptResponses[promptIndex] = array of responses from each model
      const promptResponses: PromptResponseEntry[][] = suite.prompts.map(() => []);
      const modelResultIds: Record<string, string> = {};

      // ── Model runs ─────────────────────────────────────────────────────────
      for (let mi = 0; mi < selectedModels.length; mi++) {
        const modelName = selectedModels[mi];
        const modelResultId = randomUUID();
        const family = detectModelFamily(modelName);
        modelResultIds[modelName] = modelResultId;

        send({ type: "model_start", modelName, modelIndex: mi });

        saveModelResult(db, {
          id: modelResultId, runId, modelName, family,
          parameterSize: "", quantization: "", overallScore: 0,
          categoryScores: {}, avgTokensPerSec: 0, avgTTFT: 0, totalDuration: 0,
          skipped: false, skipReason: null,
        });

        try {
          send({ type: "model_loading", modelName });
          await client.preloadModel(modelName);
          await client.waitForModelLoaded(modelName, 90000);
          send({ type: "model_loaded", modelName });
        } catch (err) {
          send({ type: "model_skipped", modelName, reason: `Failed to load: ${err}` });
          updateModelResult(db, modelResultId, {
            overallScore: 0, categoryScores: {}, avgTokensPerSec: 0,
            avgTTFT: 0, totalDuration: 0, parameterSize: "", quantization: "",
          });
          db.prepare("UPDATE model_results SET skipped = 1, skip_reason = ? WHERE id = ?")
            .run(String(err), modelResultId);
          continue;
        }

        const promptScores: Array<{ score: number; category: string; tokensPerSec: number }> = [];
        const modelStartTime = Date.now();

        for (let pi = 0; pi < suite.prompts.length; pi++) {
          const prompt = suite.prompts[pi] as Record<string, unknown>;
          const promptResultId = randomUUID();

          send({ type: "prompt_start", modelName, promptIndex: pi, promptId: prompt.id });

          let response = "";
          let tokensPerSec = 0;
          let ttft = 0;
          let totalTokens = 0;
          let duration = 0;
          let timedOut = false;
          let error: string | null = null;

          const timeoutController = new AbortController();
          const timeoutId = setTimeout(() => {
            timeoutController.abort();
            timedOut = true;
          }, 120000);

          try {
            const promptText = interpolateVariables(
              prompt.text as string,
              (prompt.variables as Record<string, string>) || {}
            );

            for await (const chunk of client.chat({
              model: modelName,
              messages: [{ role: "user", content: promptText }],
              temperature: temperature ?? prefs.defaultTemperature,
              topP: topP ?? prefs.defaultTopP,
              maxTokens: maxTokens ?? prefs.defaultMaxTokens,
              signal: timeoutController.signal,
            })) {
              if (chunk.type === "token") {
                response += chunk.text;
                send({ type: "token", modelName, promptIndex: pi, token: chunk.text });
              } else if (chunk.type === "done") {
                tokensPerSec = chunk.stats.tokensPerSec;
                ttft = chunk.stats.ttft;
                totalTokens = chunk.stats.totalTokens;
                duration = chunk.stats.totalDuration;
              }
            }
          } catch (err) {
            if (timedOut) {
              send({ type: "prompt_timeout", modelName, promptIndex: pi });
            } else {
              error = String(err);
              send({ type: "prompt_error", modelName, promptIndex: pi, error });
            }
          } finally {
            clearTimeout(timeoutId);
          }

          // ── v2 Rubric Scoring ──
          const rubric = computeRubricScore(
            response,
            prompt as unknown as Parameters<typeof computeRubricScore>[1],
            timedOut,
            error
          );

          // Build auto_scores with v2 dimensions + v1 legacy fields
          const autoScoresToSave = {
            // v2 dimension scores (used by heatmap and per-prompt display)
            relevance: rubric.dimensions.relevance,
            depth: rubric.dimensions.depth,
            coherence: rubric.dimensions.coherence,
            compliance: rubric.dimensions.compliance,
            language: rubric.dimensions.language,
            // v1 legacy fields (backward compat)
            formatCompliance: rubric.dimensions.compliance >= 3,
            lengthCompliance: rubric.dimensions.depth >= 1,
            languageMatch: rubric.dimensions.language >= 2,
            refusalDetected: rubric.gate.flag === "REFUSED",
            repetitionScore: rubric.gate.flag === "REPETITION_LOOP" ? 1 : 0,
            // Gate info
            gatePass: rubric.gate.pass,
            gateFlag: rubric.gate.flag,
            // Warnings + rubric results
            warnings: rubric.warnings || [],
            rubricResults: rubric.rubricResults || null,
            rubricScore: rubric.score,
          };

          savePromptResult(db, {
            id: promptResultId,
            runId,
            modelResultId,
            modelName,
            promptId: prompt.id as string,
            response,
            tokensPerSec,
            ttft,
            totalTokens,
            duration,
            autoScores: autoScoresToSave,
            judgeScores: null,
            timedOut,
            error,
          });

          // Save v2 dimension scores
          saveRubricDimensions(db, {
            promptResultId,
            relevance: rubric.dimensions.relevance,
            depth: rubric.dimensions.depth,
            coherence: rubric.dimensions.coherence,
            compliance: rubric.dimensions.compliance,
            languageQuality: rubric.dimensions.language,
            gatePass: rubric.gate.pass,
            gateFlag: rubric.gate.flag,
          });

          promptScores.push({ score: rubric.score, category: prompt.category as string, tokensPerSec });

          // Collect for judge phase — include ALL responses that have text,
          // even if gated (Fix 5: don't skip gated responses from judge)
          if (response.trim()) {
            promptResponses[pi].push({ modelName, promptResultId, response, rubricScore: rubric.score });
          }

          send({
            type: "prompt_done",
            modelName,
            promptIndex: pi,
            score: rubric.score,
            tokensPerSec,
            timedOut,
          });

          // New v2 event: dimension breakdown
          send({
            type: "prompt_rubric",
            modelName,
            promptIndex: pi,
            rubricScore: rubric.score,
            dimensions: rubric.dimensions,
            gatePass: rubric.gate.pass,
            gateFlag: rubric.gate.flag,
          });
        }

        try { await client.unloadModel(modelName); } catch { /* non-fatal */ }

        const maxTps = Math.max(...promptScores.map((p) => p.tokensPerSec), 0.001);
        const categoryScoresV2 = computeCategoryScoresV2(promptScores, maxTps);
        const categoryScoresLegacy = categoryScoresV2ToLegacy(categoryScoresV2);
        // For legacy compat: replace null with 0 in the stored object
        const categoryScoresForDb: Record<string, number> = {};
        for (const [k, v] of Object.entries(categoryScoresLegacy)) {
          categoryScoresForDb[k] = v ?? 0;
        }

        const overallScore = computeModelOverallScore(
          promptScores.map((p) => p.score),
          suite.prompts.map((p: Record<string, unknown>) => (p.difficulty as string) || "medium")
        );
        const avgTokensPerSec = promptScores.reduce((a, b) => a + b.tokensPerSec, 0) / (promptScores.length || 1);
        const totalDuration = (Date.now() - modelStartTime) / 1000;

        let parameterSize = "";
        let quantization = "";
        try {
          const details = await client.showModel(modelName);
          parameterSize = details.details?.parameter_size ?? "";
          quantization = details.details?.quantization_level ?? "";
        } catch { /* non-fatal */ }

        updateModelResult(db, modelResultId, {
          overallScore, categoryScores: categoryScoresForDb, avgTokensPerSec,
          avgTTFT: 0, totalDuration, parameterSize, quantization,
        });

        // Save v2 fields
        db.prepare(`
          UPDATE model_results
          SET rubric_score = ?, scoring_version = 2
          WHERE id = ?
        `).run(overallScore, modelResultId);

        send({ type: "model_done", modelName, overallScore, categoryScores: categoryScoresForDb, avgTokensPerSec });
      }

      // ── LLM-as-Judge: Structured 4-Axis Evaluation ──────────────────────
      if (judgeEnabled && judgeModel) {
        const comparablePrompts = promptResponses.filter((r) => r.length >= 2);
        if (comparablePrompts.length === 0) {
          send({ type: "judge_error", error: "No prompts had responses from 2+ models" });
        } else {
          send({ type: "judge_start", totalPrompts: comparablePrompts.length });

          // Load judge model (skip for cloud)
          try {
            if (!judgeModel.startsWith("cloud:")) {
              await client.preloadModel(judgeModel);
              await client.waitForModelLoaded(judgeModel, 90000);
            }
          } catch (err) {
            send({ type: "judge_error", error: `Failed to load judge model: ${err}` });
            completeRun(db, runId);
            send({ type: "run_complete", runId });
            controller.close();
            return;
          }

          // Per-model judge scores: modelName → array of per-prompt judge scores
          const modelJudgeScores: Record<string, number[]> = {};
          const winCounts: Record<string, number> = {};
          for (const name of selectedModels) {
            modelJudgeScores[name] = [];
            winCounts[name] = 0;
          }

          // Per-prompt judge scores for Elo
          const promptJudgeResults: Array<{ promptId: string; scores: Record<string, number> }> = [];

          for (let pi = 0; pi < suite.prompts.length; pi++) {
            const entries = promptResponses[pi];

            // If only one model responded, auto-award that model the win
            if (entries.length === 1) {
              const solo = entries[0];
              const autoScore = Math.min(100, Math.max(30, solo.rubricScore)); // their rubric score, floored at 30
              const autoEval = {
                accuracy: 3, helpfulness: 3, clarity: 3, instructionFollowing: 3,
                strengths: "Only response provided for this prompt",
                weaknesses: "No comparison available",
                judgeScore: autoScore,
              };

              saveJudgeEvaluation(db, {
                promptResultId: solo.promptResultId,
                judgeModel,
                ...autoEval,
                isWinner: true,
                winnerReasoning: "Auto-win: only model that produced a response for this prompt",
              });

              updatePromptJudgeScores(db, solo.promptResultId, {
                score: autoScore,
                won: true,
                reasoning: "Auto-win: only model that produced a response",
                accuracy: 3, helpfulness: 3, clarity: 3, instructionFollowing: 3,
              });

              modelJudgeScores[solo.modelName]?.push(autoScore);
              winCounts[solo.modelName] = (winCounts[solo.modelName] || 0) + 1;
              promptJudgeResults.push({
                promptId: (suite.prompts[pi] as Record<string, unknown>).id as string,
                scores: { [solo.modelName]: autoScore },
              });

              // Also give non-responding models a 0 score for this prompt
              for (const name of selectedModels) {
                if (name !== solo.modelName) {
                  modelJudgeScores[name]?.push(0);
                }
              }

              send({
                type: "judge_prompt_compared",
                promptIndex: pi,
                winner: solo.modelName,
                evaluations: { [solo.modelName]: autoEval },
                scores: { [solo.modelName]: autoScore },
                reasoning: "Auto-win: only model that produced a response",
              });
              continue;
            }
            if (entries.length < 2) continue; // No responses at all

            const prompt = suite.prompts[pi] as Record<string, unknown>;
            send({
              type: "judge_prompt_comparing",
              promptIndex: pi,
              modelCount: entries.length,
            });

            const result = await callStructuredJudge(
              db, client, judgeModel,
              prompt.text as string,
              prompt.category as string,
              entries,
              (prompt.rubric as string) || undefined
            );

            const perPromptScores: Record<string, number> = {};

            // Save judge evaluations + collect scores
            for (const entry of entries) {
              const evaluation = result.evaluations[entry.modelName];
              if (evaluation) {
                saveJudgeEvaluation(db, {
                  promptResultId: entry.promptResultId,
                  judgeModel,
                  accuracy: evaluation.accuracy,
                  helpfulness: evaluation.helpfulness,
                  clarity: evaluation.clarity,
                  instructionFollowing: evaluation.instructionFollowing,
                  strengths: evaluation.strengths,
                  weaknesses: evaluation.weaknesses,
                  isWinner: result.winner === entry.modelName,
                  winnerReasoning: result.winnerReasoning,
                  judgeScore: evaluation.judgeScore,
                });

                modelJudgeScores[entry.modelName]?.push(evaluation.judgeScore);
                perPromptScores[entry.modelName] = evaluation.judgeScore;

                // Update legacy judge_scores column
                updatePromptJudgeScores(db, entry.promptResultId, {
                  score: evaluation.judgeScore,
                  won: result.winner === entry.modelName,
                  reasoning: result.winnerReasoning,
                  accuracy: evaluation.accuracy,
                  helpfulness: evaluation.helpfulness,
                  clarity: evaluation.clarity,
                  instructionFollowing: evaluation.instructionFollowing,
                });
              }
            }

            if (result.winner && winCounts[result.winner] !== undefined) {
              winCounts[result.winner]++;
            }

            promptJudgeResults.push({ promptId: prompt.id as string, scores: perPromptScores });

            send({
              type: "judge_prompt_compared",
              promptIndex: pi,
              winner: result.winner,
              evaluations: result.evaluations,
              // Flat scores map for backward compat with run page
              scores: Object.fromEntries(
                Object.entries(result.evaluations).map(([name, ev]) => [name, ev.judgeScore])
              ),
              reasoning: result.winnerReasoning,
            });
          }

          // Unload judge model (skip for cloud)
          try { if (!judgeModel.startsWith("cloud:")) await client.unloadModel(judgeModel); } catch { /* non-fatal */ }

          // ── Elo Processing ──
          const eloRows = getEloRatings(db);
          const eloState = loadEloState(eloRows);

          for (const { promptId, scores } of promptJudgeResults) {
            const matches = derivePairwiseResults(scores, 3);
            for (const match of matches) {
              updateElo(eloState, match);
              saveEloMatch(db, {
                runId,
                promptId,
                winner: match.winner,
                loser: match.loser,
                isTie: match.isTie,
                winnerJudgeScore: match.winnerScore,
                loserJudgeScore: match.loserScore,
              });
            }
          }

          // Persist Elo ratings
          for (const [modelName, rating] of Object.entries(eloState.ratings)) {
            upsertEloRating(db, modelName, rating, eloState.matchCounts[modelName] ?? 0);
          }

          send({ type: "elo_update", ratings: eloState.ratings });

          // ── Compute final blended scores per model ──
          const avgJudgeScores: Record<string, number> = {};
          for (const [name, scores] of Object.entries(modelJudgeScores)) {
            avgJudgeScores[name] = scores.length > 0
              ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
              : 0;
          }

          const overallWinner = Object.entries(winCounts)
            .sort((a, b) => b[1] - a[1] || (avgJudgeScores[b[0]] ?? 0) - (avgJudgeScores[a[0]] ?? 0))[0];

          // Update model results with composite scores
          for (const [modelName, modelResultId] of Object.entries(modelResultIds)) {
            const judgeAvg = avgJudgeScores[modelName] ?? 0;
            if (judgeAvg === 0) continue;

            const currentRow = db.prepare("SELECT overall_score, rubric_score FROM model_results WHERE id = ?")
              .get(modelResultId) as { overall_score: number; rubric_score: number | null } | undefined;
            const rubricScore = currentRow?.rubric_score ?? currentRow?.overall_score ?? 0;

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { score: compositeScore, layers: _layers } = computeCompositeScore(
              rubricScore, true, null, judgeAvg
            );

            const eloRating = eloState.ratings[modelName] ?? 1500;
            const eloConf = computeConfidence(eloState.matchCounts[modelName] ?? 0);

            db.prepare(`
              UPDATE model_results
              SET overall_score = ?, judge_composite = ?, elo_rating_snapshot = ?, elo_confidence = ?, scoring_version = 2
              WHERE id = ?
            `).run(compositeScore, judgeAvg, eloRating, eloConf, modelResultId);
          }

          send({
            type: "judge_done",
            winner: overallWinner ? { modelName: overallWinner[0], wins: overallWinner[1] } : null,
            winCounts,
            avgScores: avgJudgeScores,
            totalPrompts: comparablePrompts.length,
          });
        }
      }

      completeRun(db, runId);
      send({ type: "run_complete", runId });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ── Structured 4-Axis Judge ─────────────────────────────────────────────────

interface JudgeResult {
  evaluations: Record<string, {
    accuracy: number;
    helpfulness: number;
    clarity: number;
    instructionFollowing: number;
    strengths: string;
    weaknesses: string;
    judgeScore: number;
  }>;
  winner: string;
  winnerReasoning: string;
}

async function callStructuredJudge(
  db: ReturnType<typeof getDb>,
  client: OllamaClient,
  judgeModel: string,
  promptText: string,
  category: string,
  entries: PromptResponseEntry[],
  rubricText?: string
): Promise<JudgeResult> {
  const labels = entries.map((_, i) => String.fromCharCode(65 + i)); // A, B, C...

  const responsesBlock = entries
    .map((e, i) => `--- RESPONSE ${labels[i]} ---\n"""\n${e.response.slice(0, 1500)}\n"""`)
    .join("\n\n");

  const evalFields = labels
    .map((l) => `"Response ${l}": {"accuracy": <1-5>, "helpfulness": <1-5>, "clarity": <1-5>, "instruction_following": <1-5>, "strengths": "<one sentence>", "weaknesses": "<one sentence>"}`)
    .join(", ");
  const winnerOptions = labels.map((l) => `"Response ${l}"`).join(" | ");

  const rubricSection = rubricText?.trim()
    ? `\nEVALUATION RUBRIC (defined by the test creator — score accuracy and instruction following against this rubric specifically):\n"""\n${rubricText.trim()}\n"""\n`
    : "";

  const judgePrompt = `You are an expert evaluator comparing AI model responses. Evaluate each response independently on 4 axes, then pick an overall winner.

PROMPT GIVEN TO THE MODELS:
"""
${promptText}
"""

PROMPT CATEGORY: ${category}
${rubricSection}
${responsesBlock}

EVALUATION INSTRUCTIONS:

Score each response on these 4 axes using a 1-5 scale:

1. ACCURACY & CORRECTNESS (1-5)
   1 = Contains factual errors or wrong conclusions
   3 = Mostly correct with minor issues
   5 = Fully correct, no errors detected

2. HELPFULNESS & COMPLETENESS (1-5)
   1 = Unhelpful, doesn't address the user's need
   3 = Moderately helpful, covers the basics
   5 = Exceptionally helpful, anticipates follow-up needs

3. CLARITY & COMMUNICATION (1-5)
   1 = Confusing, poorly organized
   3 = Clear enough, adequate organization
   5 = Excellent writing, perfect structure

4. INSTRUCTION FOLLOWING (1-5)
   1 = Ignored the prompt's requirements
   3 = Followed most requirements
   5 = Followed all requirements perfectly${rubricText?.trim() ? '\n   NOTE: Score against the EVALUATION RUBRIC provided above' : ''}

Respond with ONLY this JSON (no other text):
{"evaluations": {${evalFields}}, "winner": ${winnerOptions} | "Tie", "winner_reasoning": "<one sentence>"}`;

  let fullText = "";
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    fullText = "";

    try {
      if (judgeModel.startsWith("cloud:")) {
        const providerId = judgeModel.replace("cloud:", "");
        const provider = getCloudProviderById(db, providerId);
        if (!provider || !provider.selected_model) {
          throw new Error("Cloud provider or model not found");
        }
        fullText = await cloudChatCompletion(
          provider.provider_type,
          provider.api_key,
          provider.base_url,
          provider.selected_model,
          [{ role: "user", content: judgePrompt }],
          { temperature: 0.1, maxTokens: 500 }
        );
      } else {
        for await (const chunk of client.chat({
          model: judgeModel,
          messages: [{ role: "user", content: judgePrompt }],
          temperature: 0.1,
          maxTokens: 500,
        })) {
          if (chunk.type === "token") fullText += chunk.text;
        }
      }

      // Parse JSON from response
      const jsonMatch = fullText.match(/\{[\s\S]*"evaluations"[\s\S]*\}/);
      if (!jsonMatch) throw new Error(`No JSON found in: ${fullText.slice(0, 200)}`);
      const parsed = JSON.parse(jsonMatch[0]);

      // Build result
      const evaluations: JudgeResult["evaluations"] = {};
      let winner = entries[0].modelName;

      for (let i = 0; i < entries.length; i++) {
        const label = `Response ${labels[i]}`;
        const raw = parsed.evaluations?.[label];
        if (raw) {
          const accuracy = clamp(Math.round(Number(raw.accuracy) || 3), 1, 5);
          const helpfulness = clamp(Math.round(Number(raw.helpfulness) || 3), 1, 5);
          const clarity = clamp(Math.round(Number(raw.clarity) || 3), 1, 5);
          const instructionFollowing = clamp(Math.round(Number(raw.instruction_following) || 3), 1, 5);

          evaluations[entries[i].modelName] = {
            accuracy,
            helpfulness,
            clarity,
            instructionFollowing,
            strengths: String(raw.strengths || ""),
            weaknesses: String(raw.weaknesses || ""),
            judgeScore: computeJudgeScore({ accuracy, helpfulness, clarity, instructionFollowing }),
          };
        } else {
          // Fallback: neutral scores
          evaluations[entries[i].modelName] = {
            accuracy: 3, helpfulness: 3, clarity: 3, instructionFollowing: 3,
            strengths: "", weaknesses: "",
            judgeScore: computeJudgeScore({ accuracy: 3, helpfulness: 3, clarity: 3, instructionFollowing: 3 }),
          };
        }

        if (parsed.winner === label) winner = entries[i].modelName;
      }

      // Replace Response A/B references in reasoning with actual model names
      let reasoning = String(parsed.winner_reasoning || "");
      for (let i = 0; i < entries.length; i++) {
        reasoning = reasoning.replace(
          new RegExp(`Response ${labels[i]}\\b`, 'gi'),
          entries[i].modelName
        );
      }

      return {
        evaluations,
        winner: parsed.winner === "Tie" ? entries[0].modelName : winner,
        winnerReasoning: reasoning,
      };
    } catch (err) {
      if (attempt < maxRetries) continue; // retry

      // Final fallback: neutral scores, first entry wins
      const fallback: JudgeResult["evaluations"] = {};
      for (const e of entries) {
        fallback[e.modelName] = {
          accuracy: 3, helpfulness: 3, clarity: 3, instructionFollowing: 3,
          strengths: "", weaknesses: "",
          judgeScore: 50,
        };
      }
      return {
        evaluations: fallback,
        winner: entries[0].modelName,
        winnerReasoning: `Parse error (after ${maxRetries} retries): ${err}`,
      };
    }
  }

  // Should never reach here, but TypeScript needs it
  const fallback: JudgeResult["evaluations"] = {};
  for (const e of entries) {
    fallback[e.modelName] = {
      accuracy: 3, helpfulness: 3, clarity: 3, instructionFollowing: 3,
      strengths: "", weaknesses: "", judgeScore: 50,
    };
  }
  return { evaluations: fallback, winner: entries[0].modelName, winnerReasoning: "Unexpected fallthrough" };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function detectHardware() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  const totalRam = Math.round(os.totalmem() / (1024 ** 3));
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model ?? "Unknown CPU";

  let gpuClass = "unknown";
  const ramClass = `${totalRam}GB`;

  if (cpuModel.toLowerCase().includes("apple")) {
    if (totalRam <= 8) gpuClass = "apple_silicon_8gb";
    else if (totalRam <= 16) gpuClass = "apple_silicon_16gb";
    else if (totalRam <= 32) gpuClass = "apple_silicon_32gb";
    else gpuClass = "apple_silicon_64gb+";
  } else if (totalRam >= 32) {
    gpuClass = "high_end_desktop";
  } else {
    gpuClass = "mid_range";
  }

  return { class: gpuClass, gpu: cpuModel, ram: ramClass };
}

function interpolateVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}
