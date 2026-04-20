import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getDb, getPreferences, getSuiteById, createRun,
  saveModelResult, updateModelResult, savePromptResult, completeRun,
  updatePromptJudgeScores, getCloudProviderById,
  saveJudgeEvaluation,
  getEloRatings, upsertEloRating, saveEloMatch,
  saveToolCallResult, savePeerVotes,
  checkCloudSpendAllowed, incrementCloudSpend,
} from "@/lib/db";
import { OllamaClient } from "@/lib/ollama";
import {
  computeGateScore, computeCompositeScore,
  computeJudgeScore, computeCategoryScoresV2,
  categoryScoresV2ToLegacy, computeModelOverallScore,
} from "@/lib/scoring";
import { detectModelFamily } from "@/lib/model-colors";
import { cloudChatCompletionWithUsage } from "@/lib/providers/cloud-inference";
import {
  updateElo, derivePairwiseResults, loadEloState, computeConfidence,
} from "@/lib/elo";
import {
  toOllamaTools, runToolCallingScenario, runErrorRecoveryScenario,
  computeToolCategoryScores,
} from "@/lib/tool-calling-engine";
import { runPeerJudging, peerResultsToEloMatches } from "@/lib/peer-judge-engine";
import { runCodingScenario, checkDockerAvailable, extractFnName, type CodingLanguage } from "@/lib/code-execution-engine";
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
  const {
    suiteId, models: selectedModels, temperature, topP, maxTokens,
    judgeEnabled, judgeModel, judgeCustomPrompt, peerJudgeEnabled,
    cloudPeerJudgeIds: rawCloudPeerJudgeIds,
  } = body;

  // Optional list of `cloud:<id>` strings to add as extra peer judges.
  // Only included if the user explicitly selected them in the UI.
  const cloudPeerJudgeIds: string[] = Array.isArray(rawCloudPeerJudgeIds)
    ? rawCloudPeerJudgeIds.filter((s): s is string => typeof s === "string" && s.startsWith("cloud:"))
    : [];

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
  const isCoding = suiteType === "coding";
  const isVision = suiteType === "vision";
  const isRag = suiteType === "rag";

  if (isToolCalling && (!suite.toolScenarios?.length)) {
    return NextResponse.json({ error: "suite has no scenarios" }, { status: 400 });
  }
  if (isConversation && (!suite.conversationScenarios?.length)) {
    return NextResponse.json({ error: "suite has no conversation scenarios" }, { status: 400 });
  }
  if (isAdversarial && (!suite.adversarialScenarios?.length)) {
    return NextResponse.json({ error: "suite has no adversarial scenarios" }, { status: 400 });
  }
  if (isCoding && (!suite.codingScenarios?.length)) {
    return NextResponse.json({ error: "suite has no coding scenarios" }, { status: 400 });
  }
  if (isVision && (!suite.visionScenarios?.length)) {
    return NextResponse.json({ error: "suite has no vision scenarios" }, { status: 400 });
  }
  if (isRag && (!suite.ragScenarios?.length)) {
    return NextResponse.json({ error: "suite has no RAG scenarios" }, { status: 400 });
  }
  if (!isToolCalling && !isConversation && !isAdversarial && !isCoding && !isVision && !isRag && !suite.prompts?.length) {
    return NextResponse.json({ error: "suite has no prompts" }, { status: 400 });
  }

  // Vision: every scenario must have real image data, not empty strings from
  // AI-generated placeholders.
  if (isVision) {
    const visionScenarios = suite.visionScenarios as Array<{ id: string; name: string; question: string; imageData?: string }>;
    const emptyImages = visionScenarios.filter((s) => !s.imageData || s.imageData.trim().length === 0);
    if (emptyImages.length > 0) {
      return NextResponse.json({
        error: `${emptyImages.length} vision scenario(s) have no image data`,
        problems: emptyImages.map((s) => ({ scenarioId: s.id, question: s.question || s.name, reason: "no image uploaded — upload an image in the suite editor" })),
      }, { status: 400 });
    }
  }

  // Deep validation for RAG: every scenario must reference a document that has
  // chunks, and the relevant/distractor chunk IDs must resolve. Without this
  // check, the model runs against empty context and scores 100 on nothing.
  if (isRag) {
    const ragScenarios = suite.ragScenarios as Array<{
      id: string; documentId: string; question: string;
      relevantChunkIds: string[]; distractorChunkIds: string[];
    }>;
    const problems: Array<{ scenarioId: string; question: string; reason: string }> = [];
    const chunksByDoc = new Map<string, Set<string>>();
    for (const s of ragScenarios) {
      if (!s.documentId) {
        problems.push({ scenarioId: s.id, question: s.question, reason: "no document linked" });
        continue;
      }
      if (!chunksByDoc.has(s.documentId)) {
        const rows = db.prepare("SELECT id FROM rag_chunks WHERE document_id = ?").all(s.documentId) as Array<{ id: string }>;
        chunksByDoc.set(s.documentId, new Set(rows.map((r) => r.id)));
      }
      const chunks = chunksByDoc.get(s.documentId)!;
      if (chunks.size === 0) {
        problems.push({ scenarioId: s.id, question: s.question, reason: "linked document has no chunks — re-upload and chunk it" });
        continue;
      }
      const missingRelevant = (s.relevantChunkIds ?? []).filter((id) => !chunks.has(id));
      const missingDistractor = (s.distractorChunkIds ?? []).filter((id) => !chunks.has(id));
      if (missingRelevant.length > 0) {
        problems.push({ scenarioId: s.id, question: s.question, reason: `${missingRelevant.length} relevant chunk(s) missing` });
      } else if (missingDistractor.length > 0) {
        problems.push({ scenarioId: s.id, question: s.question, reason: `${missingDistractor.length} distractor chunk(s) missing` });
      } else if ((s.relevantChunkIds ?? []).length === 0) {
        problems.push({ scenarioId: s.id, question: s.question, reason: "no relevant chunks selected" });
      }
    }
    if (problems.length > 0) {
      return NextResponse.json({
        error: `${problems.length} RAG scenario(s) have unresolved document/chunk references`,
        problems,
      }, { status: 400 });
    }
  }

  // Conversation: every non-scripted scenario must name a reachable simulator.
  if (isConversation) {
    const convoScenarios = suite.conversationScenarios as Array<{
      id: string; name: string; simulatorMode: "scripted" | "local" | "cloud";
      simulatorModel: string; scriptedMessages?: string[];
    }>;
    const problems: Array<{ scenarioId: string; name: string; reason: string }> = [];
    let installedNames: Set<string> | null = null;
    for (const s of convoScenarios) {
      if (s.simulatorMode === "scripted") {
        if (!Array.isArray(s.scriptedMessages) || s.scriptedMessages.length === 0) {
          problems.push({ scenarioId: s.id, name: s.name, reason: "scripted mode but no scripted messages" });
        }
        continue;
      }
      if (!s.simulatorModel) {
        problems.push({ scenarioId: s.id, name: s.name, reason: "no simulator model set" });
        continue;
      }
      if (s.simulatorMode === "cloud") {
        if (!s.simulatorModel.startsWith("cloud:")) {
          problems.push({ scenarioId: s.id, name: s.name, reason: "cloud mode but simulator is not a cloud provider" });
          continue;
        }
        const providerId = s.simulatorModel.replace("cloud:", "");
        const provider = getCloudProviderById(db, providerId);
        if (!provider) {
          problems.push({ scenarioId: s.id, name: s.name, reason: `cloud provider ${providerId} no longer exists` });
        }
      } else {
        // local
        if (!installedNames) {
          try {
            const prefs = getPreferences(db);
            const res = await fetch(`${prefs.ollamaUrl}/api/tags`, { cache: "no-store" });
            if (res.ok) {
              const data = await res.json();
              installedNames = new Set((data.models ?? []).map((m: { name: string }) => m.name));
            } else {
              installedNames = new Set();
            }
          } catch {
            installedNames = new Set();
          }
        }
        if (installedNames.size > 0 && !installedNames.has(s.simulatorModel)) {
          problems.push({ scenarioId: s.id, name: s.name, reason: `simulator model "${s.simulatorModel}" not installed locally` });
        }
      }
    }
    if (problems.length > 0) {
      return NextResponse.json({
        error: `${problems.length} conversation scenario(s) have unresolved simulator references`,
        problems,
      }, { status: 400 });
    }
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

  /**
   * Wrapper around cloud inference that:
   *   1. Refuses if the provider's monthly spend cap is reached.
   *   2. Records actual usage after the call so `spend_used_usd` tracks real cost.
   * Returns the text (matching cloudChatCompletion's signature) so callers stay
   * terse.
   */
  const cloudCallTracked = async (
    provider: { id: string; provider_type: string; api_key: string; base_url: string | null; selected_model: string | null; label: string },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    opts: { temperature?: number; topP?: number; maxTokens?: number } = {}
  ): Promise<string> => {
    if (!provider.selected_model) {
      throw new Error(`Cloud provider "${provider.label}" has no model configured`);
    }
    const allow = checkCloudSpendAllowed(db, provider.id);
    if (!allow.allowed) {
      throw new Error(`Spend limit reached for "${provider.label}" ($${allow.limit.toFixed(2)}/mo). Raise it in Settings > Cloud Providers.`);
    }
    const { text, usage } = await cloudChatCompletionWithUsage(
      provider.provider_type,
      provider.api_key,
      provider.base_url,
      provider.selected_model,
      messages,
      opts
    );
    incrementCloudSpend(db, provider.id, usage.costUsd);
    return text;
  };

  // Build a resolver for cloud peer judges. It receives a `cloud:<id>` judge
  // identifier and the full judge prompt; it returns the judge's reply.
  // Unresolved IDs (deleted providers) and spend-limit hits fall back to "TIE".
  const cloudPeerInfer = cloudPeerJudgeIds.length > 0
    ? async (judgeId: string, prompt: string): Promise<string> => {
        const providerId = judgeId.replace("cloud:", "");
        const provider = getCloudProviderById(db, providerId);
        if (!provider || !provider.selected_model) return "TIE";
        try {
          return await cloudCallTracked(
            provider,
            [{ role: "user", content: prompt }],
            { temperature: 0.1, maxTokens: 10 }
          );
        } catch {
          return "TIE";
        }
      }
    : undefined;

  const peerJudgeOptions = cloudPeerJudgeIds.length > 0
    ? { extraJudges: cloudPeerJudgeIds, cloudInfer: cloudPeerInfer }
    : undefined;

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

        // Collect per-scenario responses across models for peer judging
        const toolResponses: Array<Array<{ modelName: string; response: string }>> = scenarios.map(() => []);

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

              // Create synthetic prompt_result so the scenario appears in
              // the Scenario Drill-Down on the results page
              savePromptResult(db, {
                id: randomUUID(),
                runId,
                modelResultId,
                modelName,
                promptId: scenario.id,
                response: result.textResponse,
                tokensPerSec: 0,
                ttft: result.score.selectionLatencyMs || 0,
                totalTokens: 0,
                duration: (result.score.selectionLatencyMs || 0) / 1000,
                autoScores: {
                  synthetic: true,
                  suiteMode: "tool_calling",
                  scenarioName: scenario.name,
                  gatePass: true,
                  gateFlag: null,
                  rubricScore: result.overallScore,
                  toolSelection: result.score.toolSelection,
                  paramAccuracy: result.score.paramAccuracy,
                  toolRestraint: result.score.toolRestraint,
                  actualToolCalls: result.actualToolCalls,
                  expectedToolCalls: scenario.expectedToolCalls,
                },
                judgeScores: null,
                timedOut: false,
                error: null,
              });

              // Collect for peer judging
              toolResponses[si].push({ modelName, response: result.textResponse || JSON.stringify(result.actualToolCalls) });

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

        // ── Peer judging for tool calling ─────────────────────────────
        if (peerJudgeEnabled && (selectedModels.length + cloudPeerJudgeIds.length) >= 3) {
          send({ type: "peer_judge_start", modelCount: selectedModels.length });
          try {
            for (let si = 0; si < scenarios.length; si++) {
              const entries = toolResponses[si];
              if (entries.length < 2 || entries.length + cloudPeerJudgeIds.length < 3) continue;
              const responseMap = new Map(entries.map(e => [e.modelName, e.response]));
              const promptText = `${scenarios[si].name}: ${(scenarios[si] as unknown as Record<string, unknown>).user_message ?? ""}`;
              const pairings = await runPeerJudging(client, entries.map(e => e.modelName), promptText, responseMap, peerJudgeOptions);
              for (const p of pairings) savePeerVotes(db, runId, scenarios[si].id, p.modelA, p.modelB, p.votes);
              const eloMatches = peerResultsToEloMatches(pairings);
              const eloRows = getEloRatings(db);
              const eloState = loadEloState(eloRows);
              for (const match of eloMatches) {
                updateElo(eloState, { ...match, winnerScore: null, loserScore: null });
                saveEloMatch(db, { runId, promptId: scenarios[si].id, winner: match.winner, loser: match.loser, isTie: match.isTie, winnerJudgeScore: null, loserJudgeScore: null });
              }
              for (const [mn, rating] of Object.entries(eloState.ratings)) {
                upsertEloRating(db, mn, rating, eloState.matchCounts[mn] ?? 0);
              }
              send({ type: "peer_judge_prompt", promptIndex: si });
            }
            send({ type: "peer_judge_done" });
          } catch (err) {
            send({ type: "peer_judge_error", error: String(err) });
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

        // Collect the defender's last assistant turn (or full transcript) for
        // the optional judge phase.
        const convoResponses: Array<Array<{ modelName: string; promptResultId: string; response: string; score: number }>> = convoScenarios.map(() => []);
        const convoModelResultIds: Record<string, string> = {};

        for (let mi = 0; mi < selectedModels.length; mi++) {
          const modelName = selectedModels[mi];
          const modelResultId = randomUUID();
          const family = detectModelFamily(modelName);

          send({ type: "model_start", modelName, modelIndex: mi });

          convoModelResultIds[modelName] = modelResultId;
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

            // Build a cloud simulator fn if this scenario's simulator is a cloud provider.
            let cloudSimulatorFn: ((messages: Array<{ role: string; content: string }>) => Promise<string>) | undefined;
            if (scenario.simulatorMode === "cloud" && scenario.simulatorModel?.startsWith("cloud:")) {
              const providerId = scenario.simulatorModel.replace("cloud:", "");
              const provider = getCloudProviderById(db, providerId);
              if (provider && provider.selected_model) {
                cloudSimulatorFn = async (messages) =>
                  cloudCallTracked(
                    provider,
                    messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
                    { temperature: 0.8, maxTokens: 512 }
                  );
              }
            }

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
                },
                cloudSimulatorFn
              );

              scenarioScores.push(result.overallScore);

              // Collect speed metrics from assistant turns
              const assistantTurns = result.history.filter(t => t.role === "assistant");
              for (const t of assistantTurns) {
                if (t.tokensPerSec && t.tokensPerSec > 0) allTurnSpeeds.push(t.tokensPerSec);
                if (t.ttft != null && t.ttft > 0) allTurnTtfts.push(t.ttft);
              }

              // For the judge phase, compress the defender's turns into a
              // single string so the shared comparator can judge it alongside
              // other models' transcripts. Save a synthetic prompt_result so
              // the judge phase's saveJudgeEvaluation / updatePromptJudgeScores
              // calls can target it (the conversation_results row is the
              // canonical store — this synthetic row is for judge bookkeeping).
              const transcriptSummary = assistantTurns
                .map((t, i) => `Turn ${i + 1}: ${t.content}`)
                .join("\n\n");
              const convoPromptResultId = randomUUID();
              savePromptResult(db, {
                id: convoPromptResultId,
                runId,
                modelResultId,
                modelName,
                promptId: scenario.id,
                response: transcriptSummary,
                tokensPerSec: 0,
                ttft: 0,
                totalTokens: 0,
                duration: result.totalDuration,
                autoScores: { gatePass: true, gateFlag: null, rubricScore: result.overallScore, synthetic: "conversation" },
                judgeScores: null,
                timedOut: false,
                error: null,
              });
              convoResponses[si].push({
                modelName,
                promptResultId: convoPromptResultId,
                response: transcriptSummary,
                score: result.overallScore,
              });

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

        // Optional judge + peer phase over the conversation transcripts.
        // Keep overall_score as the conversation quality score; judge opinion
        // lives in judge_composite.
        await runJudgeAndPeerPhase(db, client, send, {
          runId, judgeEnabled: !!judgeEnabled, judgeModel, peerJudgeEnabled: !!peerJudgeEnabled, selectedModels,
          scenarioLabels: convoScenarios.map(s => `Conversation: ${s.name || s.userPersona}`),
          scenarioIds: convoScenarios.map(s => s.id),
          responses: convoResponses, modelResultIds: convoModelResultIds,
          cloudPeerJudgeIds, peerJudgeOptions, judgeCustomPrompt,
          preserveOverallScore: true,
        });

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

        // Collect defender transcripts per scenario for the optional judge phase.
        const advResponses: Array<Array<{ modelName: string; promptResultId: string; response: string; score: number }>> = advScenarios.map(() => []);
        const advModelResultIds: Record<string, string> = {};

        for (let mi = 0; mi < selectedModels.length; mi++) {
          const modelName = selectedModels[mi];
          const modelResultId = randomUUID();
          const family = detectModelFamily(modelName);
          advModelResultIds[modelName] = modelResultId;

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

            // Build a cloud attacker fn if this scenario's attacker is a cloud provider.
            let cloudAttackerFn: ((messages: Array<{ role: string; content: string }>) => Promise<string>) | undefined;
            if (scenario.attackerMode === "cloud" && scenario.attackerModel?.startsWith("cloud:")) {
              const providerId = scenario.attackerModel.replace("cloud:", "");
              const provider = getCloudProviderById(db, providerId);
              if (provider && provider.selected_model) {
                cloudAttackerFn = async (messages) =>
                  cloudCallTracked(
                    provider,
                    messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
                    { temperature: 0.9, maxTokens: 512 }
                  );
              }
            }

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
                },
                cloudAttackerFn
              );

              scenarioScores.push(result.robustnessScore);

              // Collect speed metrics from defender turns
              const defenderTurns = result.history.filter(t => t.role === "defender");
              for (const t of defenderTurns) {
                if (t.tokensPerSec && t.tokensPerSec > 0) advTurnSpeeds.push(t.tokensPerSec);
                if (t.ttft != null && t.ttft > 0) advTurnTtfts.push(t.ttft);
              }

              // Synthetic prompt_result so the judge phase can reference it.
              const defenderTranscript = defenderTurns.map((t, i) => `Defender turn ${i + 1}: ${t.content}`).join("\n\n");
              const advPromptResultId = randomUUID();
              savePromptResult(db, {
                id: advPromptResultId,
                runId,
                modelResultId,
                modelName,
                promptId: scenario.id,
                response: defenderTranscript,
                tokensPerSec: 0,
                ttft: 0,
                totalTokens: 0,
                duration: result.totalDuration,
                autoScores: { gatePass: result.breaches.length === 0, gateFlag: result.breaches.length > 0 ? "REFUSED" : null, rubricScore: result.robustnessScore, synthetic: "adversarial" },
                judgeScores: null,
                timedOut: false,
                error: null,
              });
              advResponses[si].push({
                modelName,
                promptResultId: advPromptResultId,
                response: defenderTranscript,
                score: result.robustnessScore,
              });

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

        // Optional judge + peer phase over the defender transcripts.
        // Keep overall_score as the robustness score; judge opinion lives in
        // judge_composite so security scoring isn't clobbered by a quality judge.
        await runJudgeAndPeerPhase(db, client, send, {
          runId, judgeEnabled: !!judgeEnabled, judgeModel, peerJudgeEnabled: !!peerJudgeEnabled, selectedModels,
          scenarioLabels: advScenarios.map(s => `Adversarial: ${s.name || s.attackStrategy}`),
          scenarioIds: advScenarios.map(s => s.id),
          responses: advResponses, modelResultIds: advModelResultIds,
          cloudPeerJudgeIds, peerJudgeOptions, judgeCustomPrompt,
          preserveOverallScore: true,
        });

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

  // ── Coding Sandbox Run ──────────────────────────────────────────────────
  if (isCoding) {
    const codingScenarios = (suite.codingScenarios ?? []) as Array<{
      id: string; name: string; description: string; language: string;
      functionSignature: string; testCases: Array<{ id: string; input: unknown; expectedOutput: unknown; description?: string }>;
      difficulty: string; timeLimitMs: number;
    }>;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: RunEvent) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        send({ type: "run_started", runId });

        // Upfront Docker check — done once so the user is told immediately,
        // not per-scenario after code has been generated.
        const hasTestCases = codingScenarios.some((s) => (s.testCases?.length ?? 0) > 0);
        let dockerAvailable = false;
        if (hasTestCases) {
          try {
            dockerAvailable = await checkDockerAvailable();
          } catch {
            dockerAvailable = false;
          }
          if (!dockerAvailable) {
            send({
              type: "coding_docker_error",
              modelName: "",
              promptIndex: -1,
              error: "Docker is not running. Code will be generated but not executed against test cases.",
            });
          }
        }

        // Collect responses for judge/peer phase
        const codingResponses: Array<Array<{ modelName: string; promptResultId: string; response: string; score: number }>> = codingScenarios.map(() => []);
        const codingModelResultIds: Record<string, string> = {};

        for (let mi = 0; mi < selectedModels.length; mi++) {
          const modelName = selectedModels[mi];
          const modelResultId = randomUUID();
          const family = detectModelFamily(modelName);
          codingModelResultIds[modelName] = modelResultId;

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
            await client.waitForModelLoaded(modelName, 120000);
            send({ type: "model_loaded", modelName });
          } catch (err) {
            send({ type: "model_skipped", modelName, reason: `Failed to load: ${err}` });
            continue;
          }

          const promptScores: Array<{ score: number; category: string; tokensPerSec: number }> = [];
          const modelStartTime = Date.now();

          for (let pi = 0; pi < codingScenarios.length; pi++) {
            const scenario = codingScenarios[pi];
            const promptResultId = randomUUID();

            const fnName = extractFnName(scenario.functionSignature);
            const promptText = `Implement the following ${scenario.language} function:

\`\`\`${scenario.language}
${scenario.functionSignature}
\`\`\`

${scenario.description}

Rules:
- Use EXACTLY this function name: \`${fnName}\`
- The function must RETURN the result (not print it)
- You may add helper functions if needed
- Only use built-in/standard library modules (no npm packages, no pip packages)
- Do NOT include any console.log(), print(), example usage, or test code
- Output ONLY the function definition(s) and necessary imports

Respond with ONLY a single \`\`\`${scenario.language} code block.`;

            send({ type: "prompt_start", modelName, promptIndex: pi });

            let response = "";
            let tokensPerSec = 0;
            let ttft = 0;
            let totalTokens = 0;
            let duration = 0;
            let error: string | null = null;
            const timedOut = false;

            try {
              for await (const chunk of client.chat({
                model: modelName,
                messages: [{ role: "user", content: promptText }],
                temperature: temperature ?? prefs.defaultTemperature,
                maxTokens: maxTokens ?? prefs.defaultMaxTokens,
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
              error = String(err);
              send({ type: "prompt_error", modelName, promptIndex: pi, error });
            }

            const gateResult = computeGateScore(response, timedOut, error, maxTokens ?? prefs.defaultMaxTokens);

            // For coding scenarios, a one-liner function is a valid response
            // even if it's under 10 words. If the gate flagged EMPTY but the
            // response contains a code block or function definition, override
            // the gate so Docker can actually test the code.
            const hasCodeContent = /```|def\s+\w|function\s+\w|func\s+\w|fn\s+\w/i.test(response);
            if (gateResult.gate.flag === "EMPTY" && hasCodeContent) {
              gateResult.gate.pass = true;
              gateResult.gate.flag = null;
              gateResult.score = 100;
            }

            let codingScore = gateResult.score;
            let testResults: Array<{ passed: boolean; testCaseId: string }> = [];

            if (gateResult.gate.pass && scenario.testCases?.length > 0 && dockerAvailable) {
              try {
                send({ type: "coding_executing", modelName, promptIndex: pi });
                const codingResult = await runCodingScenario(response, {
                  id: scenario.id, suiteId, name: scenario.name, description: scenario.description,
                  language: scenario.language as CodingLanguage, functionSignature: scenario.functionSignature,
                  testCases: scenario.testCases, difficulty: scenario.difficulty as "easy" | "medium" | "hard",
                  timeLimitMs: scenario.timeLimitMs, order: pi,
                });
                codingScore = codingResult.score;
                testResults = codingResult.testResults.map(r => ({
                  passed: r.passed,
                  testCaseId: r.testCaseId,
                  actualOutput: r.actualOutput?.slice(0, 500),
                  expectedOutput: r.expectedOutput?.slice(0, 500),
                  executionTimeMs: r.executionTimeMs,
                  error: r.error?.slice(0, 300),
                }));
              } catch (dockerErr) {
                send({ type: "coding_docker_error", modelName, promptIndex: pi, error: String(dockerErr) });
              }
            }

            savePromptResult(db, {
              id: promptResultId, runId, modelResultId, modelName, promptId: scenario.id,
              response, tokensPerSec, ttft, totalTokens, duration,
              autoScores: {
                gatePass: gateResult.gate.pass, gateFlag: gateResult.gate.flag, rubricScore: codingScore,
                // Save full test results with timing + output for the coding results view
                testResults: testResults.length > 0 ? testResults : undefined,
                dockerExecuted: testResults.length > 0,
                scenarioName: scenario.name,
                language: scenario.language,
                difficulty: scenario.difficulty,
              },
              judgeScores: null, timedOut, error,
            });

            promptScores.push({ score: codingScore, category: "coding", tokensPerSec });

            // Collect for judge phase
            if (response.trim()) {
              codingResponses[pi].push({ modelName, promptResultId, response, score: codingScore });
            }

            send({
              type: "prompt_done", modelName, promptIndex: pi, score: codingScore,
              tokensPerSec, timedOut,
              gatePass: gateResult.gate.pass, gateFlag: gateResult.gate.flag,
              testResults: testResults.length > 0 ? testResults : undefined,
              scenarioName: scenario.name,
              language: scenario.language,
            });
          }

          try { await client.unloadModel(modelName); } catch { /* non-fatal */ }

          const overallScore = promptScores.length > 0 ? Math.round(promptScores.reduce((a, b) => a + b.score, 0) / promptScores.length) : 0;
          const avgTokensPerSec = promptScores.length > 0 ? promptScores.reduce((a, b) => a + b.tokensPerSec, 0) / promptScores.length : 0;
          const totalDuration = (Date.now() - modelStartTime) / 1000;

          updateModelResult(db, modelResultId, { overallScore, categoryScores: { coding: overallScore }, avgTokensPerSec, avgTTFT: 0, totalDuration, parameterSize: "", quantization: "" });
          send({ type: "model_done", modelName, overallScore, categoryScores: { coding: overallScore }, avgTokensPerSec });
        }

        // ── Judge phase for coding (same as standard run) ─────────────
        if (judgeEnabled && judgeModel) {
          const comparablePrompts = codingResponses.filter(r => r.length >= 2);
          if (comparablePrompts.length > 0) {
            send({ type: "judge_start", totalPrompts: comparablePrompts.length });
            try {
              if (!judgeModel.startsWith("cloud:")) {
                await client.preloadModel(judgeModel);
                await client.waitForModelLoaded(judgeModel, 90000);
              }
              const modelJudgeScores: Record<string, number[]> = {};
              for (const name of selectedModels) { modelJudgeScores[name] = []; }

              for (let pi = 0; pi < codingScenarios.length; pi++) {
                const entries = codingResponses[pi];
                if (entries.length < 2) continue;

                // Include test results in the response so the judge knows if the code actually works
                const entriesWithTestInfo = entries.map(e => {
                  const pr = db.prepare("SELECT auto_scores FROM prompt_results WHERE id = ?").get(e.promptResultId) as { auto_scores: string } | undefined;
                  const autoScores = pr ? JSON.parse(pr.auto_scores) : {};
                  const testResults = (autoScores.testResults || []) as Array<{ passed: boolean; expectedOutput?: string; actualOutput?: string; error?: string }>;
                  const passed = testResults.filter(t => t.passed).length;
                  const total = testResults.length;
                  // Put test results FIRST so they don't get cut off by the 1500-char slice
                  const testSummary = total > 0
                    ? `[TEST RESULTS: ${passed}/${total} passed${passed < total ? `. Failures: ${testResults.filter(t => !t.passed).map(t => t.error ? `Error: ${t.error.slice(0, 80)}` : `Expected ${t.expectedOutput}, got ${t.actualOutput}`).slice(0, 3).join("; ")}` : ""}]\n\n`
                    : "";
                  return { ...e, response: testSummary + e.response, testPassed: passed, testTotal: total };
                });

                // If ALL models scored 0% on tests, skip judge comparison — no point picking a "winner" among broken code
                const allFailed = entriesWithTestInfo.every(e => e.testTotal > 0 && e.testPassed === 0);
                if (allFailed) {
                  // Give all entries a low judge score but no winner
                  for (const entry of entries) {
                    modelJudgeScores[entry.modelName].push(0);
                    updatePromptJudgeScores(db, entry.promptResultId, { score: 0, won: false, reasoning: "All models failed all tests", accuracy: 1, helpfulness: 1, clarity: 3, instructionFollowing: 1 });
                  }
                  send({ type: "judge_prompt_compared", promptIndex: pi, winner: null, scores: Object.fromEntries(entries.map(e => [e.modelName, 0])), reasoning: "All models failed tests" });
                  continue;
                }

                send({ type: "judge_prompt_comparing", promptIndex: pi });
                const promptText = `${codingScenarios[pi].name}: ${codingScenarios[pi].description}`;
                const judgeResult = await callStructuredJudge(db, client, judgeModel, promptText, "coding",
                  entriesWithTestInfo.map(e => ({ modelName: e.modelName, promptResultId: e.promptResultId, response: e.response, rubricScore: e.score })),
                  judgeCustomPrompt || undefined
                );

                for (const entry of entriesWithTestInfo) {
                  const evalData = judgeResult.evaluations[entry.modelName];
                  if (evalData) {
                    let jScore = computeJudgeScore(evalData);
                    // If model failed all tests, cap judge score — pretty code that doesn't work isn't good
                    if (entry.testTotal > 0 && entry.testPassed === 0) {
                      jScore = Math.min(jScore, 25);
                    }
                    const isWinner = judgeResult.winner === entry.modelName && !(entry.testTotal > 0 && entry.testPassed === 0);
                    modelJudgeScores[entry.modelName].push(jScore);
                    saveJudgeEvaluation(db, { promptResultId: entry.promptResultId, judgeModel, ...evalData, judgeScore: jScore, isWinner, winnerReasoning: judgeResult.winnerReasoning });
                    updatePromptJudgeScores(db, entry.promptResultId, { score: jScore, won: isWinner, reasoning: judgeResult.winnerReasoning, accuracy: evalData.accuracy, helpfulness: evalData.helpfulness, clarity: evalData.clarity, instructionFollowing: evalData.instructionFollowing });
                  }
                }
                send({
                  type: "judge_prompt_compared",
                  promptIndex: pi,
                  winner: judgeResult.winner,
                  scores: Object.fromEntries(
                    Object.entries(judgeResult.evaluations).map(([name, ev]) => [name, ev.judgeScore])
                  ),
                  reasoning: judgeResult.winnerReasoning,
                });
              }
              // Update model results with judge composite
              for (const [modelName, modelResultId] of Object.entries(codingModelResultIds)) {
                const scores = modelJudgeScores[modelName] ?? [];
                if (scores.length === 0) continue;
                const judgeAvg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
                const { score: compositeScore } = computeCompositeScore(100, true, null, judgeAvg);
                db.prepare("UPDATE model_results SET overall_score = ?, judge_composite = ?, scoring_version = 2 WHERE id = ?").run(compositeScore, judgeAvg, modelResultId);
              }
              send({ type: "judge_done" });
            } catch (err) {
              send({ type: "judge_error", error: String(err) });
            }
          }
        }

        // ── Peer judging for coding ───────────────────────────────────
        if (peerJudgeEnabled && (selectedModels.length + cloudPeerJudgeIds.length) >= 3) {
          send({ type: "peer_judge_start", modelCount: selectedModels.length });
          try {
            for (let pi = 0; pi < codingScenarios.length; pi++) {
              const entries = codingResponses[pi];
              if (entries.length < 2 || entries.length + cloudPeerJudgeIds.length < 3) continue;
              // Include test results in responses so peer judges know if the code works
              const peerEntries = entries.map(e => {
                const pr = db.prepare("SELECT auto_scores FROM prompt_results WHERE id = ?").get(e.promptResultId) as { auto_scores: string } | undefined;
                const autoScores = pr ? JSON.parse(pr.auto_scores) : {};
                const testResults = (autoScores.testResults || []) as Array<{ passed: boolean }>;
                const passed = testResults.filter(t => t.passed).length;
                const total = testResults.length;
                const prefix = total > 0 ? `[TEST RESULTS: ${passed}/${total} tests passed]\n\n` : "";
                return { ...e, response: prefix + e.response, testPassed: passed, testTotal: total };
              });

              // Skip peer judging if ALL models failed all tests — no point comparing broken code
              if (peerEntries.every(e => e.testTotal > 0 && e.testPassed === 0)) {
                send({ type: "peer_judge_prompt", promptIndex: pi });
                continue;
              }

              const responseMap = new Map(peerEntries.map(e => [e.modelName, e.response] as [string, string]));
              const promptText = `${codingScenarios[pi].name}: ${codingScenarios[pi].description}`;
              const pairings = await runPeerJudging(client, entries.map(e => e.modelName), promptText, responseMap, peerJudgeOptions);
              // Save individual peer votes before aggregating
              for (const p of pairings) savePeerVotes(db, runId, codingScenarios[pi].id, p.modelA, p.modelB, p.votes);
              const eloMatches = peerResultsToEloMatches(pairings);
              const eloRows = getEloRatings(db);
              const eloState = loadEloState(eloRows);
              for (const match of eloMatches) {
                updateElo(eloState, { ...match, winnerScore: null, loserScore: null });
                saveEloMatch(db, { runId, promptId: codingScenarios[pi].id, winner: match.winner, loser: match.loser, isTie: match.isTie, winnerJudgeScore: null, loserJudgeScore: null });
              }
              for (const [mn, rating] of Object.entries(eloState.ratings)) {
                upsertEloRating(db, mn, rating, eloState.matchCounts[mn] ?? 0);
              }
              send({ type: "peer_judge_prompt", promptIndex: pi });
            }
            send({ type: "peer_judge_done" });
          } catch (err) {
            send({ type: "peer_judge_error", error: String(err) });
          }
        }

        completeRun(db, runId);
        send({ type: "run_complete", runId });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  // ── Vision Run ──────────────────────────────────────────────────────────
  if (isVision) {
    const visionScenarios = (suite.visionScenarios ?? []) as Array<{
      id: string; name: string; question: string; imageData: string; imageMime: string;
      category: string; expectedAnswer: string | null; difficulty: string;
    }>;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: RunEvent) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        send({ type: "run_started", runId });

        const visionResponses: Array<Array<{ modelName: string; promptResultId: string; response: string; score: number }>> = visionScenarios.map(() => []);
        const visionModelResultIds: Record<string, string> = {};

        for (let mi = 0; mi < selectedModels.length; mi++) {
          const modelName = selectedModels[mi];
          const modelResultId = randomUUID();
          const family = detectModelFamily(modelName);
          visionModelResultIds[modelName] = modelResultId;
          send({ type: "model_start", modelName, modelIndex: mi });
          saveModelResult(db, { id: modelResultId, runId, modelName, family, parameterSize: "", quantization: "", overallScore: 0, categoryScores: {}, avgTokensPerSec: 0, avgTTFT: 0, totalDuration: 0, skipped: false, skipReason: null });

          try {
            send({ type: "model_loading", modelName });
            await client.preloadModel(modelName);
            await client.waitForModelLoaded(modelName, 120000);
            send({ type: "model_loaded", modelName });
          } catch (err) {
            send({ type: "model_skipped", modelName, reason: `Failed to load: ${err}` });
            continue;
          }

          const promptScores: Array<{ score: number; category: string; tokensPerSec: number }> = [];
          const modelStartTime = Date.now();

          for (let pi = 0; pi < visionScenarios.length; pi++) {
            const scenario = visionScenarios[pi];
            const promptResultId = randomUUID();
            send({ type: "prompt_start", modelName, promptIndex: pi });

            let response = "";
            let tokensPerSec = 0;
            let ttft = 0;
            let totalTokens = 0;
            let duration = 0;
            let error: string | null = null;

            try {
              const visionRes = await fetch(`${prefs.ollamaUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: modelName,
                  messages: [{ role: "user", content: scenario.question, images: scenario.imageData ? [scenario.imageData] : [] }],
                  stream: true,
                  options: { temperature: temperature ?? 0.3, num_predict: maxTokens ?? 1024 },
                }),
              });
              if (!visionRes.ok) {
                const errText = await visionRes.text().catch(() => "");
                throw new Error(`Ollama vision API error ${visionRes.status}: ${errText.slice(0, 200)}`);
              }
              const reader = visionRes.body!.getReader();
              const startTime = performance.now();
              let firstToken = false;
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const lines = new TextDecoder().decode(value).split("\n");
                for (const line of lines) {
                  if (!line.trim()) continue;
                  try {
                    const chunk = JSON.parse(line);
                    if (chunk.message?.content) {
                      if (!firstToken) { ttft = performance.now() - startTime; firstToken = true; }
                      response += chunk.message.content;
                      send({ type: "token", modelName, promptIndex: pi, token: chunk.message.content });
                    }
                    if (chunk.done) { totalTokens = chunk.eval_count ?? response.split(/\s+/).length; }
                  } catch { /* skip */ }
                }
              }
              duration = (performance.now() - startTime) / 1000;
              tokensPerSec = duration > 0 ? totalTokens / duration : 0;
            } catch (err) {
              error = String(err);
              send({ type: "prompt_error", modelName, promptIndex: pi, error });
            }

            const gateResult = computeGateScore(response, false, error, maxTokens ?? 1024);
            savePromptResult(db, { id: promptResultId, runId, modelResultId, modelName, promptId: scenario.id, response, tokensPerSec, ttft, totalTokens, duration, autoScores: { gatePass: gateResult.gate.pass, gateFlag: gateResult.gate.flag, rubricScore: gateResult.score }, judgeScores: null, timedOut: false, error });
            promptScores.push({ score: gateResult.score, category: scenario.category, tokensPerSec });
            if (response.trim()) { visionResponses[pi].push({ modelName, promptResultId, response, score: gateResult.score }); }
            send({ type: "prompt_done", modelName, promptIndex: pi, score: gateResult.score, tokensPerSec, timedOut: false, gatePass: gateResult.gate.pass, gateFlag: gateResult.gate.flag });
          }

          try { await client.unloadModel(modelName); } catch { /* */ }
          const overallScore = promptScores.length > 0 ? Math.round(promptScores.reduce((a, b) => a + b.score, 0) / promptScores.length) : 0;
          const avgTokensPerSec = promptScores.length > 0 ? promptScores.reduce((a, b) => a + b.tokensPerSec, 0) / promptScores.length : 0;
          updateModelResult(db, modelResultId, { overallScore, categoryScores: { vision: overallScore }, avgTokensPerSec, avgTTFT: 0, totalDuration: (Date.now() - modelStartTime) / 1000, parameterSize: "", quantization: "" });
          send({ type: "model_done", modelName, overallScore, categoryScores: { vision: overallScore }, avgTokensPerSec });
        }

        await runJudgeAndPeerPhase(db, client, send, {
          runId, judgeEnabled: !!judgeEnabled, judgeModel, peerJudgeEnabled: !!peerJudgeEnabled, selectedModels,
          scenarioLabels: visionScenarios.map(s => s.question),
          scenarioIds: visionScenarios.map(s => s.id),
          responses: visionResponses, modelResultIds: visionModelResultIds,
          cloudPeerJudgeIds, peerJudgeOptions, judgeCustomPrompt,
        });

        completeRun(db, runId);
        send({ type: "run_complete", runId });
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  }

  // ── RAG Run ────────────────────────────────────────────────────────────
  if (isRag) {
    const ragScenarios = (suite.ragScenarios ?? []) as Array<{
      id: string; documentId: string; question: string; groundTruthAnswer: string;
      relevantChunkIds: string[]; distractorChunkIds: string[]; answerNotInDocument: boolean; difficulty: string;
    }>;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: RunEvent) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        send({ type: "run_started", runId });

        // Load chunks for building RAG prompts
        const allChunks = new Map<string, Array<{ id: string; text: string; source: string }>>();
        for (const scenario of ragScenarios) {
          if (!allChunks.has(scenario.documentId)) {
            const chunks = db.prepare("SELECT * FROM rag_chunks WHERE document_id = ? ORDER BY sort_order").all(scenario.documentId) as Array<{ id: string; text: string; source: string }>;
            allChunks.set(scenario.documentId, chunks);
          }
        }

        const ragResponses: Array<Array<{ modelName: string; promptResultId: string; response: string; score: number }>> = ragScenarios.map(() => []);
        const ragModelResultIds: Record<string, string> = {};

        for (let mi = 0; mi < selectedModels.length; mi++) {
          const modelName = selectedModels[mi];
          const modelResultId = randomUUID();
          const family = detectModelFamily(modelName);
          ragModelResultIds[modelName] = modelResultId;
          send({ type: "model_start", modelName, modelIndex: mi });
          saveModelResult(db, { id: modelResultId, runId, modelName, family, parameterSize: "", quantization: "", overallScore: 0, categoryScores: {}, avgTokensPerSec: 0, avgTTFT: 0, totalDuration: 0, skipped: false, skipReason: null });

          try {
            send({ type: "model_loading", modelName });
            await client.preloadModel(modelName);
            await client.waitForModelLoaded(modelName, 120000);
            send({ type: "model_loaded", modelName });
          } catch (err) {
            send({ type: "model_skipped", modelName, reason: `Failed to load: ${err}` });
            continue;
          }

          const promptScores: Array<{ score: number; category: string; tokensPerSec: number }> = [];
          const modelStartTime = Date.now();

          for (let pi = 0; pi < ragScenarios.length; pi++) {
            const scenario = ragScenarios[pi];
            const promptResultId = randomUUID();
            send({ type: "prompt_start", modelName, promptIndex: pi });

            const docChunks = allChunks.get(scenario.documentId) || [];
            const relevantChunks = docChunks.filter(c => scenario.relevantChunkIds.includes(c.id));
            const distractorChunks = docChunks.filter(c => scenario.distractorChunkIds.includes(c.id));
            const contextChunks = [...relevantChunks, ...distractorChunks].sort(() => Math.random() - 0.5);
            const context = contextChunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
            const ragPrompt = `Answer the following question using ONLY the provided context. If the answer is not in the context, say "I don't know."\n\nCONTEXT:\n${context}\n\nQUESTION: ${scenario.question}\n\nANSWER:`;

            let response = "";
            let tokensPerSec = 0;
            let ttft = 0;
            let totalTokens = 0;
            let duration = 0;
            let error: string | null = null;

            try {
              for await (const chunk of client.chat({
                model: modelName, messages: [{ role: "user", content: ragPrompt }],
                temperature: temperature ?? 0.3, maxTokens: maxTokens ?? 1024,
              })) {
                if (chunk.type === "token") { response += chunk.text; send({ type: "token", modelName, promptIndex: pi, token: chunk.text }); }
                else if (chunk.type === "done") { tokensPerSec = chunk.stats.tokensPerSec; ttft = chunk.stats.ttft; totalTokens = chunk.stats.totalTokens; duration = chunk.stats.totalDuration; }
              }
            } catch (err) {
              error = String(err);
              send({ type: "prompt_error", modelName, promptIndex: pi, error });
            }

            const gateResult = computeGateScore(response, false, error, maxTokens ?? 1024);
            savePromptResult(db, { id: promptResultId, runId, modelResultId, modelName, promptId: scenario.id, response, tokensPerSec, ttft, totalTokens, duration, autoScores: { gatePass: gateResult.gate.pass, gateFlag: gateResult.gate.flag, rubricScore: gateResult.score }, judgeScores: null, timedOut: false, error });
            promptScores.push({ score: gateResult.score, category: "rag", tokensPerSec });
            if (response.trim()) { ragResponses[pi].push({ modelName, promptResultId, response, score: gateResult.score }); }
            send({ type: "prompt_done", modelName, promptIndex: pi, score: gateResult.score, tokensPerSec, timedOut: false, gatePass: gateResult.gate.pass, gateFlag: gateResult.gate.flag });
          }

          try { await client.unloadModel(modelName); } catch { /* */ }
          const overallScore = promptScores.length > 0 ? Math.round(promptScores.reduce((a, b) => a + b.score, 0) / promptScores.length) : 0;
          const avgTokensPerSec = promptScores.length > 0 ? promptScores.reduce((a, b) => a + b.tokensPerSec, 0) / promptScores.length : 0;
          updateModelResult(db, modelResultId, { overallScore, categoryScores: { rag: overallScore }, avgTokensPerSec, avgTTFT: 0, totalDuration: (Date.now() - modelStartTime) / 1000, parameterSize: "", quantization: "" });
          send({ type: "model_done", modelName, overallScore, categoryScores: { rag: overallScore }, avgTokensPerSec });
        }

        await runJudgeAndPeerPhase(db, client, send, {
          runId, judgeEnabled: !!judgeEnabled, judgeModel, peerJudgeEnabled: !!peerJudgeEnabled, selectedModels,
          scenarioLabels: ragScenarios.map(s => s.question),
          scenarioIds: ragScenarios.map(s => s.id),
          responses: ragResponses, modelResultIds: ragModelResultIds,
          cloudPeerJudgeIds, peerJudgeOptions, judgeCustomPrompt,
        });

        completeRun(db, runId);
        send({ type: "run_complete", runId });
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
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

          // ── Gate Scoring (simplified — judge handles quality) ──
          const gateResult = computeGateScore(
            response,
            timedOut,
            error,
            maxTokens ?? prefs.defaultMaxTokens
          );

          const autoScoresToSave = {
            gatePass: gateResult.gate.pass,
            gateFlag: gateResult.gate.flag,
            rubricScore: gateResult.score,
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

          promptScores.push({ score: gateResult.score, category: prompt.category as string, tokensPerSec });

          // Collect for judge phase — include ALL responses that have text,
          // even if gated (Fix 5: don't skip gated responses from judge)
          if (response.trim()) {
            promptResponses[pi].push({ modelName, promptResultId, response, rubricScore: gateResult.score });
          }

          send({
            type: "prompt_done",
            modelName,
            promptIndex: pi,
            score: gateResult.score,
            tokensPerSec,
            timedOut,
            gatePass: gateResult.gate.pass,
            gateFlag: gateResult.gate.flag,
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

            const rubric = [(prompt.rubric as string) || "", judgeCustomPrompt || ""].filter(Boolean).join("\n") || undefined;
            const result = await callStructuredJudge(
              db, client, judgeModel,
              prompt.text as string,
              prompt.category as string,
              entries,
              rubric
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

      // ── Peer Judging (explicitly enabled, 3+ judges incl. extras) ───────
      if (peerJudgeEnabled && (selectedModels.length + cloudPeerJudgeIds.length) >= 3 && promptResponses.some(r => r.length >= 2)) {
        send({ type: "peer_judge_start", modelCount: selectedModels.length });

        try {
          for (let pi = 0; pi < suite.prompts.length; pi++) {
            const entries = promptResponses[pi];
            if (entries.length < 2) continue;

            const promptText = (suite.prompts[pi] as Record<string, unknown>).text as string;
            const responseMap = new Map(entries.map(e => [e.modelName, e.response]));
            const modelsWithResponses = entries.map(e => e.modelName);

            if (modelsWithResponses.length + cloudPeerJudgeIds.length < 3) continue;

            const pairings = await runPeerJudging(
              client,
              modelsWithResponses,
              promptText,
              responseMap,
              peerJudgeOptions
            );

            // Save individual peer votes + aggregate into Elo
            const promptIdStr = (suite.prompts[pi] as Record<string, unknown>).id as string;
            for (const p of pairings) savePeerVotes(db, runId, promptIdStr, p.modelA, p.modelB, p.votes);
            const eloMatches = peerResultsToEloMatches(pairings);
            const eloRows = getEloRatings(db);
            const eloState = loadEloState(eloRows);

            for (const match of eloMatches) {
              updateElo(eloState, { ...match, winnerScore: null, loserScore: null });
              saveEloMatch(db, {
                runId,
                promptId: (suite.prompts[pi] as Record<string, unknown>).id as string,
                winner: match.winner,
                loser: match.loser,
                isTie: match.isTie,
                winnerJudgeScore: null,
                loserJudgeScore: null,
              });
            }

            // Persist Elo
            for (const [modelName, rating] of Object.entries(eloState.ratings)) {
              upsertEloRating(db, modelName, rating, eloState.matchCounts[modelName] ?? 0);
            }

            send({ type: "peer_judge_prompt", promptIndex: pi, pairings: pairings.length });
          }

          send({ type: "peer_judge_done" });
        } catch (err) {
          send({ type: "peer_judge_error", error: String(err) });
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
    .map((e, i) => {
      // Strip thinking tags so the judge evaluates visible output quality only.
      const visible = e.response.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, "").trim();
      return `--- RESPONSE ${labels[i]} ---\n"""\n${visible.slice(0, 10000)}\n"""`;
    })
    .join("\n\n");

  const evalFields = labels
    .map((l) => category === "coding"
      ? `"Response ${l}": {"accuracy": <1-5>, "helpfulness": <1-5>, "clarity": <1-5>, "instruction_following": <1-5>, "strengths": "<one sentence>", "weaknesses": "<one sentence>", "code_review": "<2-3 sentences explaining what the code does right or wrong, why tests passed or failed, and any bugs>"}`
      : `"Response ${l}": {"accuracy": <1-5>, "helpfulness": <1-5>, "clarity": <1-5>, "instruction_following": <1-5>, "strengths": "<one sentence>", "weaknesses": "<one sentence>"}`)
    .join(", ");
  const winnerOptions = labels.map((l) => `"Response ${l}"`).join(" | ");

  const rubricSection = rubricText?.trim()
    ? `\nEVALUATION RUBRIC (defined by the test creator — score accuracy and instruction following against this rubric specifically):\n"""\n${rubricText.trim()}\n"""\n`
    : "";

  const codingInstructions = category === "coding" ? `
You are a SENIOR SOFTWARE ENGINEER conducting a blind code review. You do NOT know which model or developer wrote each response. Judge purely on the code quality.

CRITICAL: Test results are appended to each response as [TEST RESULTS: X/Y passed].
- A response that FAILS tests must score 1 on accuracy — broken code is never acceptable
- A response that PASSES all tests should score 4-5 on accuracy
- Between two responses that both pass tests, judge on code readability, efficiency, and best practices

Score on these 4 axes (1-5):
1. ACCURACY (correctness): Does the code work? Test results are the ground truth.
2. HELPFULNESS (completeness): Does it handle edge cases? Is the solution robust?
3. CLARITY (readability): Clean variable names, good structure, no unnecessary complexity?
4. INSTRUCTION FOLLOWING: Does it match the required function signature and constraints?` : `
You are an expert evaluator. You do NOT know which model wrote each response. Judge purely on response quality.

Score on these 4 axes (1-5):
1. ACCURACY & CORRECTNESS: Is the information factually correct?
2. HELPFULNESS & COMPLETENESS: Does it fully address the question?
3. CLARITY & COMMUNICATION: Is it well-written and well-structured?
4. INSTRUCTION FOLLOWING: Does it follow all requirements?${rubricText?.trim() ? '\n   NOTE: Score against the EVALUATION RUBRIC provided above' : ''}`;

  const judgePrompt = `${codingInstructions}

TASK GIVEN TO THE MODELS:
"""
${promptText}
"""
${rubricSection}
${responsesBlock}

You MUST pick one clear winner — no ties.

Respond with ONLY this JSON:
{"evaluations": {${evalFields}}, "winner": ${winnerOptions}, "winner_reasoning": "<one sentence>"}`;

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
        const allow = checkCloudSpendAllowed(db, provider.id);
        if (!allow.allowed) {
          throw new Error(`Spend limit reached for "${provider.label}" ($${allow.limit.toFixed(2)}/mo). Raise it in Settings > Cloud Providers.`);
        }
        const { text, usage } = await cloudChatCompletionWithUsage(
          provider.provider_type,
          provider.api_key,
          provider.base_url,
          provider.selected_model,
          [{ role: "user", content: judgePrompt }],
          { temperature: 0.1, maxTokens: 500 }
        );
        incrementCloudSpend(db, provider.id, usage.costUsd);
        fullText = text;
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
            weaknesses: [raw.weaknesses, raw.code_review].filter(Boolean).join(" | ") || "",
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

      // If judge said "Tie", pick the model with the highest judge score
      let finalWinner = winner;
      if (parsed.winner === "Tie") {
        let bestScore = -1;
        for (const [name, ev] of Object.entries(evaluations)) {
          if (ev.judgeScore > bestScore) {
            bestScore = ev.judgeScore;
            finalWinner = name;
          }
        }
      }
      return {
        evaluations,
        winner: finalWinner,
        winnerReasoning: reasoning,
      };
    } catch (err) {
      if (attempt < maxRetries) continue; // retry

      // Final fallback: pick the model with highest rubric/test score, flag error
      const fallback: JudgeResult["evaluations"] = {};
      for (const e of entries) {
        fallback[e.modelName] = {
          accuracy: 1, helpfulness: 1, clarity: 1, instructionFollowing: 1,
          strengths: "", weaknesses: `Judge failed: ${String(err).slice(0, 100)}`,
          judgeScore: 0,
        };
      }
      // Pick the model with highest rubricScore as winner (fallback to test results)
      const bestEntry = entries.reduce((best, e) => e.rubricScore > best.rubricScore ? e : best, entries[0]);
      return {
        evaluations: fallback,
        winner: bestEntry.modelName,
        winnerReasoning: `Judge unavailable — winner based on test score (${bestEntry.rubricScore}%)`,
      };
    }
  }

  // Should never reach here, but TypeScript needs it
  const fallback: JudgeResult["evaluations"] = {};
  for (const e of entries) {
    fallback[e.modelName] = {
      accuracy: 1, helpfulness: 1, clarity: 1, instructionFollowing: 1,
      strengths: "", weaknesses: "Judge fallthrough error", judgeScore: 0,
    };
  }
  return { evaluations: fallback, winner: entries[0].modelName, winnerReasoning: "Judge fallthrough — winner based on submission order" };
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

// ── Reusable judge + peer phase for any run type ────────────────────────────

async function runJudgeAndPeerPhase(
  db: ReturnType<typeof getDb>,
  client: OllamaClient,
  send: (event: RunEvent) => void,
  options: {
    runId: string;
    judgeEnabled: boolean;
    judgeModel?: string;
    peerJudgeEnabled: boolean;
    selectedModels: string[];
    scenarioLabels: string[];
    scenarioIds: string[];
    responses: Array<Array<{ modelName: string; promptResultId: string; response: string; score: number }>>;
    modelResultIds: Record<string, string>;
    cloudPeerJudgeIds?: string[];
    peerJudgeOptions?: { extraJudges?: string[]; cloudInfer?: (id: string, prompt: string) => Promise<string> };
    /**
     * When true, judge scores are stored in `judge_composite` alongside the
     * existing `overall_score` (which the caller already set to a mode-specific
     * value like adversarial robustness or conversation quality). When false
     * (default), judge score replaces overall_score — appropriate for modes
     * whose pre-judge score is just gate pass/fail.
     */
    preserveOverallScore?: boolean;
    judgeCustomPrompt?: string;
  }
) {
  const { runId, judgeEnabled, judgeModel, peerJudgeEnabled, selectedModels, scenarioLabels, scenarioIds, responses, modelResultIds } = options;
  const cloudPeerJudgeIds = options.cloudPeerJudgeIds ?? [];
  const peerJudgeOptions = options.peerJudgeOptions;
  const preserveOverallScore = !!options.preserveOverallScore;

  // Judge phase
  if (judgeEnabled && judgeModel) {
    const comparablePrompts = responses.filter(r => r.length >= 2);
    if (comparablePrompts.length > 0) {
      send({ type: "judge_start", totalPrompts: comparablePrompts.length });
      try {
        if (!judgeModel.startsWith("cloud:")) {
          await client.preloadModel(judgeModel);
          await client.waitForModelLoaded(judgeModel, 90000);
        }
        const modelJudgeScores: Record<string, number[]> = {};
        for (const name of selectedModels) { modelJudgeScores[name] = []; }

        for (let pi = 0; pi < responses.length; pi++) {
          const entries = responses[pi];

          // Solo response: auto-win — give the only model that responded a
          // baseline score so it still shows up as "judged" in the UI.
          if (entries.length === 1) {
            const solo = entries[0];
            const autoScore = Math.min(100, Math.max(30, solo.score));
            const autoEval = { accuracy: 3, helpfulness: 3, clarity: 3, instructionFollowing: 3, strengths: "Only response", weaknesses: "", judgeScore: autoScore };
            modelJudgeScores[solo.modelName].push(autoScore);
            saveJudgeEvaluation(db, { promptResultId: solo.promptResultId, judgeModel, ...autoEval, isWinner: true, winnerReasoning: "Auto-win: only model that produced a response" });
            updatePromptJudgeScores(db, solo.promptResultId, { score: autoScore, won: true, reasoning: "Auto-win: only response", accuracy: 3, helpfulness: 3, clarity: 3, instructionFollowing: 3 });
            send({ type: "judge_prompt_compared", promptIndex: pi, winner: solo.modelName, scores: { [solo.modelName]: autoScore }, reasoning: "Auto-win: only response" });
            // Give non-responding models a 0
            for (const name of selectedModels) {
              if (name !== solo.modelName) modelJudgeScores[name].push(0);
            }
            continue;
          }
          if (entries.length < 2) continue;

          send({ type: "judge_prompt_comparing", promptIndex: pi });
          const judgeResult = await callStructuredJudge(db, client, judgeModel, scenarioLabels[pi] || `Scenario ${pi + 1}`, "custom",
            entries.map(e => ({ modelName: e.modelName, promptResultId: e.promptResultId, response: e.response, rubricScore: e.score })),
            options.judgeCustomPrompt || undefined
          );
          for (const entry of entries) {
            const evalData = judgeResult.evaluations[entry.modelName];
            if (evalData) {
              const jScore = computeJudgeScore(evalData);
              modelJudgeScores[entry.modelName].push(jScore);
              saveJudgeEvaluation(db, { promptResultId: entry.promptResultId, judgeModel, ...evalData, judgeScore: jScore, isWinner: judgeResult.winner === entry.modelName, winnerReasoning: judgeResult.winnerReasoning });
              updatePromptJudgeScores(db, entry.promptResultId, { score: jScore, won: judgeResult.winner === entry.modelName, reasoning: judgeResult.winnerReasoning, accuracy: evalData.accuracy, helpfulness: evalData.helpfulness, clarity: evalData.clarity, instructionFollowing: evalData.instructionFollowing });
            }
          }
          send({
            type: "judge_prompt_compared",
            promptIndex: pi,
            winner: judgeResult.winner,
            scores: Object.fromEntries(
              Object.entries(judgeResult.evaluations).map(([name, ev]) => [name, ev.judgeScore])
            ),
            reasoning: judgeResult.winnerReasoning,
          });
        }
        for (const [modelName, modelResultId] of Object.entries(modelResultIds)) {
          const scores = modelJudgeScores[modelName] ?? [];
          if (scores.length === 0) continue;
          const judgeAvg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          const { score: compositeScore } = computeCompositeScore(100, true, null, judgeAvg);
          if (preserveOverallScore) {
            // Mode-specific overall (e.g. adversarial robustness, conversation
            // quality decay) already lives in overall_score — judge opinion
            // gets stored separately so both are visible.
            db.prepare("UPDATE model_results SET judge_composite = ?, scoring_version = 2 WHERE id = ?").run(judgeAvg, modelResultId);
          } else {
            db.prepare("UPDATE model_results SET overall_score = ?, judge_composite = ?, scoring_version = 2 WHERE id = ?").run(compositeScore, judgeAvg, modelResultId);
          }
        }
        send({ type: "judge_done" });
      } catch (err) {
        send({ type: "judge_error", error: String(err) });
      }
    }
  }

  // Peer judging phase
  if (peerJudgeEnabled && (selectedModels.length + cloudPeerJudgeIds.length) >= 3) {
    send({ type: "peer_judge_start", modelCount: selectedModels.length });
    try {
      for (let pi = 0; pi < responses.length; pi++) {
        const entries = responses[pi];
        if (entries.length < 2 || entries.length + cloudPeerJudgeIds.length < 3) continue;
        const responseMap = new Map(entries.map(e => [e.modelName, e.response]));
        const pairings = await runPeerJudging(client, entries.map(e => e.modelName), scenarioLabels[pi] || `Scenario ${pi + 1}`, responseMap, peerJudgeOptions);
        for (const p of pairings) savePeerVotes(db, runId, scenarioIds[pi] || `scenario-${pi}`, p.modelA, p.modelB, p.votes);
        const eloMatches = peerResultsToEloMatches(pairings);
        const eloRows = getEloRatings(db);
        const eloState = loadEloState(eloRows);
        for (const match of eloMatches) {
          updateElo(eloState, { ...match, winnerScore: null, loserScore: null });
          saveEloMatch(db, { runId, promptId: scenarioIds[pi] || `scenario-${pi}`, winner: match.winner, loser: match.loser, isTie: match.isTie, winnerJudgeScore: null, loserJudgeScore: null });
        }
        for (const [mn, rating] of Object.entries(eloState.ratings)) {
          upsertEloRating(db, mn, rating, eloState.matchCounts[mn] ?? 0);
        }
        send({ type: "peer_judge_prompt", promptIndex: pi });
      }
      send({ type: "peer_judge_done" });
    } catch (err) {
      send({ type: "peer_judge_error", error: String(err) });
    }
  }
}
