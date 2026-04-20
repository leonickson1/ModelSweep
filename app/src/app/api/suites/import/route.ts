import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";

/**
 * POST /api/suites/import
 *
 * Accepts a `.modelsweep.json` export and re-creates the suite with all its
 * nested scenarios, prompts, tool definitions, etc. Generates new IDs to
 * avoid collisions with existing data.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const suite = body.suite || body;

    if (!suite.name) {
      return NextResponse.json({ error: "Invalid suite JSON — missing name" }, { status: 400 });
    }

    const db = getDb();
    const suiteId = randomUUID();
    const now = new Date().toISOString();
    const suiteType = suite.suite_type || "standard";

    // Create the suite
    db.prepare(`
      INSERT INTO test_suites (id, name, description, suite_type, created_at, is_built_in)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(suiteId, `${suite.name} (imported)`, suite.description || "", suiteType, now);

    // Standard prompts
    if (Array.isArray(suite.prompts)) {
      const stmt = db.prepare(`
        INSERT INTO prompts (id, suite_id, text, category, difficulty, expected_behavior, rubric, variables, max_tokens, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < suite.prompts.length; i++) {
        const p = suite.prompts[i];
        stmt.run(randomUUID(), suiteId, p.text || "", p.category || "custom", p.difficulty || "medium",
          p.expected_behavior || p.expectedBehavior || "general", p.rubric || "",
          JSON.stringify(p.variables || {}), p.max_tokens || p.maxTokens || 1024, i, now);
      }
    }

    // Tool definitions
    if (Array.isArray(suite.toolDefinitions) && suite.toolDefinitions.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO tool_definitions (id, suite_id, name, description, parameters, mock_returns, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < suite.toolDefinitions.length; i++) {
        const t = suite.toolDefinitions[i];
        stmt.run(randomUUID(), suiteId, t.name || "", t.description || "",
          JSON.stringify(t.parameters || []), JSON.stringify(t.mockReturns || t.mock_returns || []), i, now);
      }
    }

    // Tool scenarios
    if (Array.isArray(suite.toolScenarios) && suite.toolScenarios.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO tool_scenarios (id, suite_id, name, user_message, system_prompt, should_call_tool, expected_tool_calls, category, difficulty, simulated_error, dependency_chain, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < suite.toolScenarios.length; i++) {
        const s = suite.toolScenarios[i];
        stmt.run(randomUUID(), suiteId, s.name || "", s.userMessage || s.user_message || "",
          s.systemPrompt || s.system_prompt || null,
          (s.shouldCallTool ?? s.should_call_tool ?? true) ? 1 : 0,
          JSON.stringify(s.expectedToolCalls || s.expected_tool_calls || []),
          s.category || "tool_selection", s.difficulty || "medium",
          s.simulatedError || s.simulated_error || null,
          s.dependencyChain ? JSON.stringify(s.dependencyChain) : (s.dependency_chain || null),
          i, now);
      }
    }

    // Conversation scenarios
    if (Array.isArray(suite.conversationScenarios) && suite.conversationScenarios.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO conversation_scenarios (id, suite_id, name, system_prompt, user_persona, turn_count, evaluation_criteria, difficulty, simulator_mode, scripted_messages, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < suite.conversationScenarios.length; i++) {
        const s = suite.conversationScenarios[i];
        stmt.run(randomUUID(), suiteId, s.name || "",
          s.systemPrompt || s.system_prompt || "",
          s.userPersona || s.user_persona || "",
          s.turnCount || s.turn_count || 6,
          JSON.stringify(s.evaluationCriteria || s.evaluation_criteria || []),
          s.difficulty || "medium",
          s.simulatorMode || s.simulator_mode || "scripted",
          s.scriptedMessages ? JSON.stringify(s.scriptedMessages) : (s.scripted_messages || null),
          i, now);
      }
    }

    // Adversarial scenarios
    if (Array.isArray(suite.adversarialScenarios) && suite.adversarialScenarios.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO adversarial_scenarios (id, suite_id, name, system_prompt, attack_strategy, max_turns, attack_intensity, failure_conditions, difficulty, attacker_mode, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < suite.adversarialScenarios.length; i++) {
        const s = suite.adversarialScenarios[i];
        stmt.run(randomUUID(), suiteId, s.name || "",
          s.systemPrompt || s.system_prompt || "",
          s.attackStrategy || s.attack_strategy || "prompt_extraction",
          s.maxTurns || s.max_turns || 5,
          s.attackIntensity || s.attack_intensity || 3,
          JSON.stringify(s.failureConditions || s.failure_conditions || []),
          s.difficulty || "medium",
          s.attackerMode || s.attacker_mode || "scripted",
          i, now);
      }
    }

    // Coding scenarios
    if (Array.isArray(suite.codingScenarios) && suite.codingScenarios.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO coding_scenarios (id, suite_id, name, description, language, function_signature, test_cases, difficulty, time_limit_ms, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < suite.codingScenarios.length; i++) {
        const s = suite.codingScenarios[i];
        stmt.run(randomUUID(), suiteId, s.name || "",
          s.description || "",
          s.language || "python",
          s.functionSignature || s.function_signature || "",
          JSON.stringify(s.testCases || s.test_cases || []),
          s.difficulty || "medium",
          s.timeLimitMs || s.time_limit_ms || 30000,
          i, now);
      }
    }

    // Vision scenarios
    if (Array.isArray(suite.visionScenarios) && suite.visionScenarios.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO vision_scenarios (id, suite_id, name, image_data, image_mime, question, category, expected_answer, rubric, difficulty, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < suite.visionScenarios.length; i++) {
        const s = suite.visionScenarios[i];
        stmt.run(randomUUID(), suiteId, s.name || "",
          s.imageData || s.image_data || "",
          s.imageMime || s.image_mime || "image/png",
          s.question || "",
          s.category || "description",
          s.expectedAnswer || s.expected_answer || null,
          s.rubric || "",
          s.difficulty || "medium",
          i, now);
      }
    }

    return NextResponse.json({
      ok: true,
      id: suiteId,
      name: `${suite.name} (imported)`,
      suiteType,
      counts: {
        prompts: suite.prompts?.length || 0,
        toolDefinitions: suite.toolDefinitions?.length || 0,
        toolScenarios: suite.toolScenarios?.length || 0,
        conversationScenarios: suite.conversationScenarios?.length || 0,
        adversarialScenarios: suite.adversarialScenarios?.length || 0,
        codingScenarios: suite.codingScenarios?.length || 0,
        visionScenarios: suite.visionScenarios?.length || 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
