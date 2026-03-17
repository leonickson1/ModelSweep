import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { UserPreferences } from "@/types";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "modelpilot.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
  seedStarterSuites(_db);

  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_suites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_run_at TEXT,
      is_built_in INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'custom',
      difficulty TEXT NOT NULL DEFAULT 'medium',
      expected_behavior TEXT NOT NULL DEFAULT 'general',
      rubric TEXT NOT NULL DEFAULT '',
      variables TEXT NOT NULL DEFAULT '{}',
      max_tokens INTEGER NOT NULL DEFAULT 1024,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id),
      suite_name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      hardware TEXT NOT NULL DEFAULT '{}',
      judge_model TEXT,
      judge_enabled INTEGER NOT NULL DEFAULT 0,
      temperature REAL NOT NULL DEFAULT 0.7,
      top_p REAL NOT NULL DEFAULT 0.9,
      max_tokens INTEGER NOT NULL DEFAULT 1024
    );

    CREATE TABLE IF NOT EXISTS model_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      model_name TEXT NOT NULL,
      family TEXT NOT NULL DEFAULT 'other',
      parameter_size TEXT NOT NULL DEFAULT '',
      quantization TEXT NOT NULL DEFAULT '',
      overall_score REAL NOT NULL DEFAULT 0,
      category_scores TEXT NOT NULL DEFAULT '{}',
      avg_tokens_per_sec REAL NOT NULL DEFAULT 0,
      avg_ttft REAL NOT NULL DEFAULT 0,
      total_duration REAL NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      skip_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS prompt_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      model_result_id TEXT NOT NULL REFERENCES model_results(id) ON DELETE CASCADE,
      model_name TEXT NOT NULL,
      prompt_id TEXT NOT NULL,
      response TEXT NOT NULL DEFAULT '',
      tokens_per_sec REAL NOT NULL DEFAULT 0,
      ttft REAL NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      auto_scores TEXT NOT NULL DEFAULT '{}',
      judge_scores TEXT,
      manual_vote TEXT,
      timed_out INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      encrypted_key TEXT NOT NULL,
      base_url TEXT,
      model_id TEXT,
      label TEXT,
      use_for_judging INTEGER NOT NULL DEFAULT 1,
      use_for_baseline INTEGER NOT NULL DEFAULT 0,
      spend_limit_usd REAL NOT NULL DEFAULT 5.0,
      spend_used_usd REAL NOT NULL DEFAULT 0.0,
      spend_month TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'unchecked',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cloud_providers (
      id TEXT PRIMARY KEY,
      provider_type TEXT NOT NULL,
      label TEXT NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT,
      selected_model TEXT,
      use_for_judging INTEGER NOT NULL DEFAULT 1,
      use_for_playground INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_dimension_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_result_id TEXT NOT NULL REFERENCES prompt_results(id) ON DELETE CASCADE,
      relevance REAL NOT NULL DEFAULT 0,
      depth REAL NOT NULL DEFAULT 0,
      coherence REAL NOT NULL DEFAULT 0,
      compliance REAL NOT NULL DEFAULT 0,
      language_quality REAL NOT NULL DEFAULT 0,
      gate_pass INTEGER NOT NULL DEFAULT 1,
      gate_flag TEXT
    );

    CREATE TABLE IF NOT EXISTS judge_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_result_id TEXT NOT NULL REFERENCES prompt_results(id) ON DELETE CASCADE,
      judge_model TEXT NOT NULL,
      accuracy INTEGER NOT NULL DEFAULT 3,
      helpfulness INTEGER NOT NULL DEFAULT 3,
      clarity INTEGER NOT NULL DEFAULT 3,
      instruction_following INTEGER NOT NULL DEFAULT 3,
      strengths TEXT,
      weaknesses TEXT,
      is_winner INTEGER NOT NULL DEFAULT 0,
      winner_reasoning TEXT,
      judge_score REAL NOT NULL DEFAULT 50
    );

    CREATE TABLE IF NOT EXISTS elo_ratings (
      model_name TEXT PRIMARY KEY,
      rating REAL NOT NULL DEFAULT 1500,
      match_count INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS elo_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      prompt_id TEXT NOT NULL,
      winner TEXT NOT NULL,
      loser TEXT NOT NULL,
      is_tie INTEGER NOT NULL DEFAULT 0,
      winner_judge_score REAL,
      loser_judge_score REAL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prompts_suite_id ON prompts(suite_id);
    CREATE INDEX IF NOT EXISTS idx_test_runs_suite_id ON test_runs(suite_id);
    CREATE INDEX IF NOT EXISTS idx_model_results_run_id ON model_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_results_run_id ON prompt_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_results_model_name ON prompt_results(model_name);
    CREATE INDEX IF NOT EXISTS idx_elo_matches_run_id ON elo_matches(run_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_dimensions_prid ON prompt_dimension_scores(prompt_result_id);
    CREATE INDEX IF NOT EXISTS idx_judge_evals_prid ON judge_evaluations(prompt_result_id);
  `);

  // ── Agentic evaluation tables ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_definitions (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      parameters TEXT NOT NULL DEFAULT '[]',
      mock_returns TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_scenarios (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      user_message TEXT NOT NULL,
      system_prompt TEXT,
      should_call_tool INTEGER NOT NULL DEFAULT 1,
      expected_tool_calls TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL DEFAULT 'tool_selection',
      difficulty TEXT NOT NULL DEFAULT 'medium',
      simulated_error TEXT,
      dependency_chain TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_call_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      model_result_id TEXT NOT NULL REFERENCES model_results(id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      actual_tool_calls TEXT NOT NULL DEFAULT '[]',
      text_response TEXT NOT NULL DEFAULT '',
      score TEXT NOT NULL DEFAULT '{}',
      overall_score REAL NOT NULL DEFAULT 0,
      latency_ms REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tool_defs_suite ON tool_definitions(suite_id);
    CREATE INDEX IF NOT EXISTS idx_tool_scenarios_suite ON tool_scenarios(suite_id);
    CREATE INDEX IF NOT EXISTS idx_tool_call_results_run ON tool_call_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_tool_call_results_model ON tool_call_results(model_result_id);
  `);

  // ── Conversation evaluation tables ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_scenarios (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      user_persona TEXT NOT NULL DEFAULT '',
      turn_count INTEGER NOT NULL DEFAULT 6,
      turn_instructions TEXT NOT NULL DEFAULT '{}',
      evaluation_criteria TEXT NOT NULL DEFAULT '[]',
      difficulty TEXT NOT NULL DEFAULT 'medium',
      temperature REAL,
      max_tokens_per_turn INTEGER,
      simulator_model TEXT NOT NULL DEFAULT '',
      simulator_mode TEXT NOT NULL DEFAULT 'scripted',
      scripted_messages TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      model_result_id TEXT NOT NULL REFERENCES model_results(id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      history TEXT NOT NULL DEFAULT '[]',
      score TEXT NOT NULL DEFAULT '{}',
      overall_score REAL NOT NULL DEFAULT 0,
      actual_turns INTEGER NOT NULL DEFAULT 0,
      context_exhausted INTEGER NOT NULL DEFAULT 0,
      total_duration REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_convo_scenarios_suite ON conversation_scenarios(suite_id);
    CREATE INDEX IF NOT EXISTS idx_convo_results_run ON conversation_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_convo_results_model ON conversation_results(model_result_id);
  `);

  // ── Adversarial evaluation tables ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS adversarial_scenarios (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      attack_strategy TEXT NOT NULL DEFAULT 'prompt_extraction',
      custom_attack_persona TEXT,
      max_turns INTEGER NOT NULL DEFAULT 5,
      attack_intensity INTEGER NOT NULL DEFAULT 3,
      failure_conditions TEXT NOT NULL DEFAULT '[]',
      difficulty TEXT NOT NULL DEFAULT 'medium',
      attacker_model TEXT NOT NULL DEFAULT '',
      attacker_mode TEXT NOT NULL DEFAULT 'scripted',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS adversarial_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      model_result_id TEXT NOT NULL REFERENCES model_results(id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      history TEXT NOT NULL DEFAULT '[]',
      breaches TEXT NOT NULL DEFAULT '[]',
      score TEXT NOT NULL DEFAULT '{}',
      robustness_score REAL NOT NULL DEFAULT 0,
      survived INTEGER NOT NULL DEFAULT 1,
      turns_to_first_breach INTEGER,
      total_duration REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_adv_scenarios_suite ON adversarial_scenarios(suite_id);
    CREATE INDEX IF NOT EXISTS idx_adv_results_run ON adversarial_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_adv_results_model ON adversarial_results(model_result_id);
  `);

  // ── v2 schema migrations (add columns if missing) ──
  const colExists = (table: string, col: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return cols.some(c => c.name === col);
  };

  // Add suite_type to test_suites
  if (!colExists('test_suites', 'suite_type')) {
    db.exec(`ALTER TABLE test_suites ADD COLUMN suite_type TEXT NOT NULL DEFAULT 'standard'`);
  }
  // Add suite_type to test_runs
  if (!colExists('test_runs', 'suite_type')) {
    db.exec(`ALTER TABLE test_runs ADD COLUMN suite_type TEXT NOT NULL DEFAULT 'standard'`);
  }

  if (!colExists('model_results', 'rubric_score')) {
    db.exec(`ALTER TABLE model_results ADD COLUMN rubric_score REAL`);
  }
  if (!colExists('model_results', 'judge_composite')) {
    db.exec(`ALTER TABLE model_results ADD COLUMN judge_composite REAL`);
  }
  if (!colExists('model_results', 'elo_rating_snapshot')) {
    db.exec(`ALTER TABLE model_results ADD COLUMN elo_rating_snapshot REAL`);
  }
  if (!colExists('model_results', 'elo_confidence')) {
    db.exec(`ALTER TABLE model_results ADD COLUMN elo_confidence REAL`);
  }
  if (!colExists('model_results', 'scoring_version')) {
    db.exec(`ALTER TABLE model_results ADD COLUMN scoring_version INTEGER NOT NULL DEFAULT 1`);
  }
  if (!colExists('test_runs', 'scoring_version')) {
    db.exec(`ALTER TABLE test_runs ADD COLUMN scoring_version INTEGER NOT NULL DEFAULT 1`);
  }
  if (!colExists('tool_definitions', 'mock_returns')) {
    db.exec(`ALTER TABLE tool_definitions ADD COLUMN mock_returns TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!colExists('tool_scenarios', 'dependency_chain')) {
    db.exec(`ALTER TABLE tool_scenarios ADD COLUMN dependency_chain TEXT`);
  }

  // Seed default preferences if not set
  const prefCount = (db.prepare("SELECT COUNT(*) as c FROM preferences").get() as { c: number }).c;
  if (prefCount === 0) {
    const defaultPrefs: UserPreferences = {
      ollamaUrl: "http://localhost:11434",
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultMaxTokens: 1024,
      judgeModel: null,
      communityEnabled: false,
      defaultJudgeEnabled: false,
      weightAuto: 0.3,
      weightJudge: 0.5,
      weightHuman: 0.2,
    };
    const insert = db.prepare("INSERT OR IGNORE INTO preferences (key, value) VALUES (?, ?)");
    for (const [key, value] of Object.entries(defaultPrefs)) {
      insert.run(key, JSON.stringify(value));
    }
  } else {
    // Ensure new weight prefs exist for existing installs
    const weightKeys = [
      ["weightAuto", 0.3],
      ["weightJudge", 0.5],
      ["weightHuman", 0.2],
    ];
    const insertIgnore = db.prepare("INSERT OR IGNORE INTO preferences (key, value) VALUES (?, ?)");
    for (const [key, val] of weightKeys) {
      insertIgnore.run(key, JSON.stringify(val));
    }
  }
}

function seedStarterSuites(db: Database.Database) {
  const count = (db.prepare("SELECT COUNT(*) as c FROM test_suites WHERE is_built_in = 1").get() as { c: number }).c;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { STARTER_SUITES, STARTER_TOOL_SUITES, STARTER_CONVERSATION_SUITES, STARTER_ADVERSARIAL_SUITES } = require("./starter-suites");

  if (count === 0) {
    const insertSuite = db.prepare(`
      INSERT OR IGNORE INTO test_suites (id, name, description, suite_type, created_at, is_built_in)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const insertPrompt = db.prepare(`
      INSERT OR IGNORE INTO prompts (id, suite_id, text, category, difficulty, expected_behavior, rubric, variables, max_tokens, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedAll = db.transaction(() => {
      for (const suite of STARTER_SUITES) {
        insertSuite.run(suite.id, suite.name, suite.description, "standard", new Date().toISOString());
        suite.prompts.forEach((p: Record<string, unknown>, i: number) => {
          insertPrompt.run(
            p.id, suite.id, p.text, p.category, p.difficulty,
            p.expectedBehavior, p.rubric, JSON.stringify(p.variables || {}),
            p.maxTokens || 1024, i, new Date().toISOString()
          );
        });
      }
    });

    seedAll();
  }

  // Seed tool calling suites (check separately so they get added to existing installs)
  const toolSuiteExists = (db.prepare(
    "SELECT COUNT(*) as c FROM test_suites WHERE id = 'builtin-tool-calling'"
  ).get() as { c: number }).c;

  if (toolSuiteExists === 0 && STARTER_TOOL_SUITES) {
    const insertSuite = db.prepare(`
      INSERT OR IGNORE INTO test_suites (id, name, description, suite_type, created_at, is_built_in)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const insertToolDef = db.prepare(`
      INSERT OR IGNORE INTO tool_definitions (id, suite_id, name, description, parameters, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertScenario = db.prepare(`
      INSERT OR IGNORE INTO tool_scenarios (id, suite_id, name, user_message, should_call_tool, expected_tool_calls, category, difficulty, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedTools = db.transaction(() => {
      for (const suite of STARTER_TOOL_SUITES) {
        insertSuite.run(suite.id, suite.name, suite.description, suite.suiteType, new Date().toISOString());
        suite.toolDefinitions.forEach((t: Record<string, unknown>, i: number) => {
          insertToolDef.run(
            t.id, suite.id, t.name, t.description,
            JSON.stringify(t.parameters || []), i, new Date().toISOString()
          );
        });
        suite.toolScenarios.forEach((s: Record<string, unknown>, i: number) => {
          insertScenario.run(
            s.id, suite.id, s.name, s.userMessage,
            s.shouldCallTool ? 1 : 0, JSON.stringify(s.expectedToolCalls || []),
            s.category, s.difficulty, i, new Date().toISOString()
          );
        });
      }
    });

    seedTools();
  }

  // Seed conversation starter suite
  const convoSuiteExists = (db.prepare(
    "SELECT COUNT(*) as c FROM test_suites WHERE id = 'builtin-conversation'"
  ).get() as { c: number }).c;

  if (convoSuiteExists === 0 && STARTER_CONVERSATION_SUITES) {
    const insertSuite = db.prepare(`
      INSERT OR IGNORE INTO test_suites (id, name, description, suite_type, created_at, is_built_in)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const insertConvoScenario = db.prepare(`
      INSERT OR IGNORE INTO conversation_scenarios (id, suite_id, name, system_prompt, user_persona, turn_count, evaluation_criteria, difficulty, simulator_mode, scripted_messages, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedConvo = db.transaction(() => {
      for (const suite of STARTER_CONVERSATION_SUITES) {
        insertSuite.run(suite.id, suite.name, suite.description, suite.suiteType, new Date().toISOString());
        suite.conversationScenarios.forEach((s: Record<string, unknown>, i: number) => {
          insertConvoScenario.run(
            s.id, suite.id, s.name, s.systemPrompt, s.userPersona,
            s.turnCount, JSON.stringify(s.evaluationCriteria || []),
            s.difficulty, s.simulatorMode,
            s.scriptedMessages ? JSON.stringify(s.scriptedMessages) : null,
            i, new Date().toISOString()
          );
        });
      }
    });

    seedConvo();
  }

  // Seed adversarial starter suite
  const advSuiteExists = (db.prepare(
    "SELECT COUNT(*) as c FROM test_suites WHERE id = 'builtin-adversarial'"
  ).get() as { c: number }).c;

  if (advSuiteExists === 0 && STARTER_ADVERSARIAL_SUITES) {
    const insertSuite = db.prepare(`
      INSERT OR IGNORE INTO test_suites (id, name, description, suite_type, created_at, is_built_in)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const insertAdvScenario = db.prepare(`
      INSERT OR IGNORE INTO adversarial_scenarios (id, suite_id, name, system_prompt, attack_strategy, max_turns, attack_intensity, failure_conditions, difficulty, attacker_mode, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedAdv = db.transaction(() => {
      for (const suite of STARTER_ADVERSARIAL_SUITES) {
        insertSuite.run(suite.id, suite.name, suite.description, suite.suiteType, new Date().toISOString());
        suite.adversarialScenarios.forEach((s: Record<string, unknown>, i: number) => {
          insertAdvScenario.run(
            s.id, suite.id, s.name, s.systemPrompt, s.attackStrategy,
            s.maxTurns, s.attackIntensity,
            JSON.stringify(s.failureConditions || []),
            s.difficulty, s.attackerMode, i, new Date().toISOString()
          );
        });
      }
    });

    seedAdv();
  }
}

// ─── Suite Queries ───────────────────────────────────────────────────────────

export function getAllSuites(db: Database.Database) {
  return db.prepare(`
    SELECT s.*,
      CASE s.suite_type
        WHEN 'tool_calling' THEN (SELECT COUNT(*) FROM tool_scenarios WHERE suite_id = s.id)
        WHEN 'conversation' THEN (SELECT COUNT(*) FROM conversation_scenarios WHERE suite_id = s.id)
        WHEN 'adversarial' THEN (SELECT COUNT(*) FROM adversarial_scenarios WHERE suite_id = s.id)
        ELSE (SELECT COUNT(*) FROM prompts WHERE suite_id = s.id)
      END as prompt_count
    FROM test_suites s
    ORDER BY s.created_at DESC
  `).all();
}

export function getSuiteById(db: Database.Database, id: string) {
  const suite = db.prepare("SELECT * FROM test_suites WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!suite) return null;
  const prompts = db.prepare("SELECT * FROM prompts WHERE suite_id = ? ORDER BY sort_order").all(id);
  const toolDefs = getToolDefinitions(db, id);
  const toolScenarios = getToolScenarios(db, id);
  const convoScenarios = getConversationScenarios(db, id);
  const advScenarios = getAdversarialScenarios(db, id);
  return {
    ...suite,
    prompts: prompts.map(deserializePrompt),
    toolDefinitions: toolDefs.map(t => ({
      ...t,
      parameters: JSON.parse(t.parameters || "[]"),
      suiteId: t.suite_id,
      order: t.sort_order,
    })),
    toolScenarios: toolScenarios.map(s => ({
      ...s,
      suiteId: s.suite_id,
      userMessage: s.user_message,
      systemPrompt: s.system_prompt,
      shouldCallTool: s.should_call_tool === 1,
      expectedToolCalls: JSON.parse(s.expected_tool_calls || "[]"),
      simulatedError: s.simulated_error,
      order: s.sort_order,
    })),
    conversationScenarios: convoScenarios.map(c => ({
      ...c,
      suiteId: c.suite_id,
      systemPrompt: c.system_prompt,
      userPersona: c.user_persona,
      turnCount: c.turn_count,
      turnInstructions: JSON.parse(c.turn_instructions || "{}"),
      evaluationCriteria: JSON.parse(c.evaluation_criteria || "[]"),
      maxTokensPerTurn: c.max_tokens_per_turn,
      simulatorModel: c.simulator_model,
      simulatorMode: c.simulator_mode,
      scriptedMessages: c.scripted_messages ? JSON.parse(c.scripted_messages) : undefined,
      order: c.sort_order,
    })),
    adversarialScenarios: advScenarios.map(a => ({
      ...a,
      suiteId: a.suite_id,
      systemPrompt: a.system_prompt,
      attackStrategy: a.attack_strategy,
      customAttackPersona: a.custom_attack_persona,
      maxTurns: a.max_turns,
      attackIntensity: a.attack_intensity,
      failureConditions: JSON.parse(a.failure_conditions || "[]"),
      attackerModel: a.attacker_model,
      attackerMode: a.attacker_mode,
      order: a.sort_order,
    })),
  };
}

export function createSuite(
  db: Database.Database,
  data: { id: string; name: string; description: string; suiteType?: string }
) {
  db.prepare(`
    INSERT INTO test_suites (id, name, description, suite_type, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(data.id, data.name, data.description, data.suiteType ?? "standard", new Date().toISOString());
}

export function updateSuite(
  db: Database.Database,
  id: string,
  data: { name?: string; description?: string; suiteType?: string }
) {
  if (data.name !== undefined)
    db.prepare("UPDATE test_suites SET name = ? WHERE id = ?").run(data.name, id);
  if (data.description !== undefined)
    db.prepare("UPDATE test_suites SET description = ? WHERE id = ?").run(data.description, id);
  if (data.suiteType !== undefined)
    db.prepare("UPDATE test_suites SET suite_type = ? WHERE id = ?").run(data.suiteType, id);
}

export function deleteSuite(db: Database.Database, id: string) {
  db.prepare("DELETE FROM test_suites WHERE id = ? AND is_built_in = 0").run(id);
}

// ─── Prompt Queries ──────────────────────────────────────────────────────────

export function createPrompt(db: Database.Database, p: {
  id: string; suiteId: string; text: string; category: string;
  difficulty: string; expectedBehavior: string; rubric: string;
  variables: Record<string, string>; maxTokens: number; order: number;
}) {
  db.prepare(`
    INSERT INTO prompts (id, suite_id, text, category, difficulty, expected_behavior, rubric, variables, max_tokens, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(p.id, p.suiteId, p.text, p.category, p.difficulty, p.expectedBehavior,
    p.rubric, JSON.stringify(p.variables), p.maxTokens, p.order, new Date().toISOString());
}

export function updatePrompt(db: Database.Database, id: string, data: Partial<{
  text: string; category: string; difficulty: string; expectedBehavior: string;
  rubric: string; variables: Record<string, string>; maxTokens: number; order: number;
}>) {
  const fields = [];
  const values = [];
  if (data.text !== undefined) { fields.push("text = ?"); values.push(data.text); }
  if (data.category !== undefined) { fields.push("category = ?"); values.push(data.category); }
  if (data.difficulty !== undefined) { fields.push("difficulty = ?"); values.push(data.difficulty); }
  if (data.expectedBehavior !== undefined) { fields.push("expected_behavior = ?"); values.push(data.expectedBehavior); }
  if (data.rubric !== undefined) { fields.push("rubric = ?"); values.push(data.rubric); }
  if (data.variables !== undefined) { fields.push("variables = ?"); values.push(JSON.stringify(data.variables)); }
  if (data.maxTokens !== undefined) { fields.push("max_tokens = ?"); values.push(data.maxTokens); }
  if (data.order !== undefined) { fields.push("sort_order = ?"); values.push(data.order); }
  if (fields.length === 0) return;
  db.prepare(`UPDATE prompts SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
}

export function deletePrompt(db: Database.Database, id: string) {
  db.prepare("DELETE FROM prompts WHERE id = ?").run(id);
}

function deserializePrompt(row: unknown) {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    variables: JSON.parse((r.variables as string) || "{}"),
    suiteId: r.suite_id,
    expectedBehavior: r.expected_behavior,
    maxTokens: r.max_tokens,
    order: r.sort_order,
    createdAt: r.created_at,
  };
}

// ─── Tool Definition Queries ─────────────────────────────────────────────────

export function getToolDefinitions(db: Database.Database, suiteId: string) {
  return db.prepare("SELECT * FROM tool_definitions WHERE suite_id = ? ORDER BY sort_order").all(suiteId) as {
    id: string; suite_id: string; name: string; description: string;
    parameters: string; mock_returns: string; sort_order: number; created_at: string;
  }[];
}

export function createToolDefinition(db: Database.Database, t: {
  id: string; suiteId: string; name: string; description: string;
  parameters: unknown[]; mockReturns?: unknown[]; order: number;
}) {
  db.prepare(`
    INSERT INTO tool_definitions (id, suite_id, name, description, parameters, mock_returns, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(t.id, t.suiteId, t.name, t.description, JSON.stringify(t.parameters), JSON.stringify(t.mockReturns ?? []), t.order, new Date().toISOString());
}

export function updateToolDefinition(db: Database.Database, id: string, data: Partial<{
  name: string; description: string; parameters: unknown[]; mockReturns: unknown[]; order: number;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
  if (data.parameters !== undefined) { fields.push("parameters = ?"); values.push(JSON.stringify(data.parameters)); }
  if (data.mockReturns !== undefined) { fields.push("mock_returns = ?"); values.push(JSON.stringify(data.mockReturns)); }
  if (data.order !== undefined) { fields.push("sort_order = ?"); values.push(data.order); }
  if (fields.length === 0) return;
  db.prepare(`UPDATE tool_definitions SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
}

export function deleteToolDefinition(db: Database.Database, id: string) {
  db.prepare("DELETE FROM tool_definitions WHERE id = ?").run(id);
}

// ─── Tool Scenario Queries ──────────────────────────────────────────────────

export function getToolScenarios(db: Database.Database, suiteId: string) {
  return db.prepare("SELECT * FROM tool_scenarios WHERE suite_id = ? ORDER BY sort_order").all(suiteId) as {
    id: string; suite_id: string; name: string; user_message: string;
    system_prompt: string | null; should_call_tool: number;
    expected_tool_calls: string; category: string; difficulty: string;
    simulated_error: string | null; dependency_chain: string | null;
    sort_order: number; created_at: string;
  }[];
}

export function createToolScenario(db: Database.Database, s: {
  id: string; suiteId: string; name: string; userMessage: string;
  systemPrompt?: string | null; shouldCallTool: boolean;
  expectedToolCalls: unknown[]; category: string; difficulty: string;
  simulatedError?: string | null; dependencyChain?: unknown | null; order: number;
}) {
  db.prepare(`
    INSERT INTO tool_scenarios (id, suite_id, name, user_message, system_prompt, should_call_tool, expected_tool_calls, category, difficulty, simulated_error, dependency_chain, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(s.id, s.suiteId, s.name, s.userMessage, s.systemPrompt ?? null,
    s.shouldCallTool ? 1 : 0, JSON.stringify(s.expectedToolCalls),
    s.category, s.difficulty, s.simulatedError ?? null,
    s.dependencyChain ? JSON.stringify(s.dependencyChain) : null,
    s.order, new Date().toISOString());
}

export function updateToolScenario(db: Database.Database, id: string, data: Partial<{
  name: string; userMessage: string; systemPrompt: string | null;
  shouldCallTool: boolean; expectedToolCalls: unknown[]; category: string;
  difficulty: string; simulatedError: string | null; dependencyChain: unknown | null;
  order: number;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.userMessage !== undefined) { fields.push("user_message = ?"); values.push(data.userMessage); }
  if (data.systemPrompt !== undefined) { fields.push("system_prompt = ?"); values.push(data.systemPrompt); }
  if (data.shouldCallTool !== undefined) { fields.push("should_call_tool = ?"); values.push(data.shouldCallTool ? 1 : 0); }
  if (data.expectedToolCalls !== undefined) { fields.push("expected_tool_calls = ?"); values.push(JSON.stringify(data.expectedToolCalls)); }
  if (data.category !== undefined) { fields.push("category = ?"); values.push(data.category); }
  if (data.difficulty !== undefined) { fields.push("difficulty = ?"); values.push(data.difficulty); }
  if (data.simulatedError !== undefined) { fields.push("simulated_error = ?"); values.push(data.simulatedError); }
  if (data.dependencyChain !== undefined) { fields.push("dependency_chain = ?"); values.push(data.dependencyChain ? JSON.stringify(data.dependencyChain) : null); }
  if (data.order !== undefined) { fields.push("sort_order = ?"); values.push(data.order); }
  if (fields.length === 0) return;
  db.prepare(`UPDATE tool_scenarios SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
}

export function deleteToolScenario(db: Database.Database, id: string) {
  db.prepare("DELETE FROM tool_scenarios WHERE id = ?").run(id);
}

// ─── Tool Call Result Queries ───────────────────────────────────────────────

export function saveToolCallResult(db: Database.Database, r: {
  id: string; runId: string; modelResultId: string; scenarioId: string;
  modelName: string; actualToolCalls: unknown[]; textResponse: string;
  score: unknown; overallScore: number; latencyMs: number;
}) {
  db.prepare(`
    INSERT INTO tool_call_results (id, run_id, model_result_id, scenario_id, model_name, actual_tool_calls, text_response, score, overall_score, latency_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(r.id, r.runId, r.modelResultId, r.scenarioId, r.modelName,
    JSON.stringify(r.actualToolCalls), r.textResponse, JSON.stringify(r.score),
    r.overallScore, r.latencyMs, new Date().toISOString());
}

export function getToolCallResults(db: Database.Database, runId: string, modelName?: string) {
  if (modelName) {
    return db.prepare(
      "SELECT * FROM tool_call_results WHERE run_id = ? AND model_name = ? ORDER BY rowid"
    ).all(runId, modelName) as Record<string, unknown>[];
  }
  return db.prepare(
    "SELECT * FROM tool_call_results WHERE run_id = ? ORDER BY rowid"
  ).all(runId) as Record<string, unknown>[];
}

// ─── Conversation Scenario Queries ───────────────────────────────────────────

export function getConversationScenarios(db: Database.Database, suiteId: string) {
  return db.prepare("SELECT * FROM conversation_scenarios WHERE suite_id = ? ORDER BY sort_order").all(suiteId) as {
    id: string; suite_id: string; name: string; system_prompt: string;
    user_persona: string; turn_count: number; turn_instructions: string;
    evaluation_criteria: string; difficulty: string; temperature: number | null;
    max_tokens_per_turn: number | null; simulator_model: string;
    simulator_mode: string; scripted_messages: string | null;
    sort_order: number; created_at: string;
  }[];
}

export function createConversationScenario(db: Database.Database, s: {
  id: string; suiteId: string; name: string; systemPrompt: string;
  userPersona: string; turnCount: number; turnInstructions?: Record<number, string>;
  evaluationCriteria?: string[]; difficulty: string; temperature?: number | null;
  maxTokensPerTurn?: number | null; simulatorModel: string; simulatorMode: string;
  scriptedMessages?: string[] | null; order: number;
}) {
  db.prepare(`
    INSERT INTO conversation_scenarios (id, suite_id, name, system_prompt, user_persona, turn_count, turn_instructions, evaluation_criteria, difficulty, temperature, max_tokens_per_turn, simulator_model, simulator_mode, scripted_messages, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(s.id, s.suiteId, s.name, s.systemPrompt, s.userPersona, s.turnCount,
    JSON.stringify(s.turnInstructions ?? {}), JSON.stringify(s.evaluationCriteria ?? []),
    s.difficulty, s.temperature ?? null, s.maxTokensPerTurn ?? null,
    s.simulatorModel, s.simulatorMode,
    s.scriptedMessages ? JSON.stringify(s.scriptedMessages) : null,
    s.order, new Date().toISOString());
}

export function updateConversationScenario(db: Database.Database, id: string, data: Partial<{
  name: string; systemPrompt: string; userPersona: string; turnCount: number;
  turnInstructions: Record<number, string>; evaluationCriteria: string[];
  difficulty: string; temperature: number | null; maxTokensPerTurn: number | null;
  simulatorModel: string; simulatorMode: string; scriptedMessages: string[] | null;
  order: number;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.systemPrompt !== undefined) { fields.push("system_prompt = ?"); values.push(data.systemPrompt); }
  if (data.userPersona !== undefined) { fields.push("user_persona = ?"); values.push(data.userPersona); }
  if (data.turnCount !== undefined) { fields.push("turn_count = ?"); values.push(data.turnCount); }
  if (data.turnInstructions !== undefined) { fields.push("turn_instructions = ?"); values.push(JSON.stringify(data.turnInstructions)); }
  if (data.evaluationCriteria !== undefined) { fields.push("evaluation_criteria = ?"); values.push(JSON.stringify(data.evaluationCriteria)); }
  if (data.difficulty !== undefined) { fields.push("difficulty = ?"); values.push(data.difficulty); }
  if (data.temperature !== undefined) { fields.push("temperature = ?"); values.push(data.temperature); }
  if (data.maxTokensPerTurn !== undefined) { fields.push("max_tokens_per_turn = ?"); values.push(data.maxTokensPerTurn); }
  if (data.simulatorModel !== undefined) { fields.push("simulator_model = ?"); values.push(data.simulatorModel); }
  if (data.simulatorMode !== undefined) { fields.push("simulator_mode = ?"); values.push(data.simulatorMode); }
  if (data.scriptedMessages !== undefined) { fields.push("scripted_messages = ?"); values.push(data.scriptedMessages ? JSON.stringify(data.scriptedMessages) : null); }
  if (data.order !== undefined) { fields.push("sort_order = ?"); values.push(data.order); }
  if (fields.length === 0) return;
  db.prepare(`UPDATE conversation_scenarios SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
}

export function deleteConversationScenario(db: Database.Database, id: string) {
  db.prepare("DELETE FROM conversation_scenarios WHERE id = ?").run(id);
}

export function saveConversationResult(db: Database.Database, r: {
  id: string; runId: string; modelResultId: string; scenarioId: string;
  modelName: string; history: unknown[]; score: unknown; overallScore: number;
  actualTurns: number; contextExhausted: boolean; totalDuration: number;
}) {
  db.prepare(`
    INSERT INTO conversation_results (id, run_id, model_result_id, scenario_id, model_name, history, score, overall_score, actual_turns, context_exhausted, total_duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(r.id, r.runId, r.modelResultId, r.scenarioId, r.modelName,
    JSON.stringify(r.history), JSON.stringify(r.score), r.overallScore,
    r.actualTurns, r.contextExhausted ? 1 : 0, r.totalDuration,
    new Date().toISOString());
}

// ─── Adversarial Scenario Queries ───────────────────────────────────────────

export function getAdversarialScenarios(db: Database.Database, suiteId: string) {
  return db.prepare("SELECT * FROM adversarial_scenarios WHERE suite_id = ? ORDER BY sort_order").all(suiteId) as {
    id: string; suite_id: string; name: string; system_prompt: string;
    attack_strategy: string; custom_attack_persona: string | null;
    max_turns: number; attack_intensity: number; failure_conditions: string;
    difficulty: string; attacker_model: string; attacker_mode: string;
    sort_order: number; created_at: string;
  }[];
}

export function createAdversarialScenario(db: Database.Database, s: {
  id: string; suiteId: string; name: string; systemPrompt: string;
  attackStrategy: string; customAttackPersona?: string | null;
  maxTurns: number; attackIntensity: number; failureConditions?: unknown[];
  difficulty: string; attackerModel: string; attackerMode: string; order: number;
}) {
  db.prepare(`
    INSERT INTO adversarial_scenarios (id, suite_id, name, system_prompt, attack_strategy, custom_attack_persona, max_turns, attack_intensity, failure_conditions, difficulty, attacker_model, attacker_mode, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(s.id, s.suiteId, s.name, s.systemPrompt, s.attackStrategy,
    s.customAttackPersona ?? null, s.maxTurns, s.attackIntensity,
    JSON.stringify(s.failureConditions ?? []), s.difficulty,
    s.attackerModel, s.attackerMode, s.order, new Date().toISOString());
}

export function updateAdversarialScenario(db: Database.Database, id: string, data: Partial<{
  name: string; systemPrompt: string; attackStrategy: string;
  customAttackPersona: string | null; maxTurns: number; attackIntensity: number;
  failureConditions: unknown[]; difficulty: string; attackerModel: string;
  attackerMode: string; order: number;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.systemPrompt !== undefined) { fields.push("system_prompt = ?"); values.push(data.systemPrompt); }
  if (data.attackStrategy !== undefined) { fields.push("attack_strategy = ?"); values.push(data.attackStrategy); }
  if (data.customAttackPersona !== undefined) { fields.push("custom_attack_persona = ?"); values.push(data.customAttackPersona); }
  if (data.maxTurns !== undefined) { fields.push("max_turns = ?"); values.push(data.maxTurns); }
  if (data.attackIntensity !== undefined) { fields.push("attack_intensity = ?"); values.push(data.attackIntensity); }
  if (data.failureConditions !== undefined) { fields.push("failure_conditions = ?"); values.push(JSON.stringify(data.failureConditions)); }
  if (data.difficulty !== undefined) { fields.push("difficulty = ?"); values.push(data.difficulty); }
  if (data.attackerModel !== undefined) { fields.push("attacker_model = ?"); values.push(data.attackerModel); }
  if (data.attackerMode !== undefined) { fields.push("attacker_mode = ?"); values.push(data.attackerMode); }
  if (data.order !== undefined) { fields.push("sort_order = ?"); values.push(data.order); }
  if (fields.length === 0) return;
  db.prepare(`UPDATE adversarial_scenarios SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
}

export function deleteAdversarialScenario(db: Database.Database, id: string) {
  db.prepare("DELETE FROM adversarial_scenarios WHERE id = ?").run(id);
}

export function saveAdversarialResult(db: Database.Database, r: {
  id: string; runId: string; modelResultId: string; scenarioId: string;
  modelName: string; history: unknown[]; breaches: unknown[]; score: unknown;
  robustnessScore: number; survived: boolean; turnsToFirstBreach: number | null;
  totalDuration: number;
}) {
  db.prepare(`
    INSERT INTO adversarial_results (id, run_id, model_result_id, scenario_id, model_name, history, breaches, score, robustness_score, survived, turns_to_first_breach, total_duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(r.id, r.runId, r.modelResultId, r.scenarioId, r.modelName,
    JSON.stringify(r.history), JSON.stringify(r.breaches), JSON.stringify(r.score),
    r.robustnessScore, r.survived ? 1 : 0, r.turnsToFirstBreach,
    r.totalDuration, new Date().toISOString());
}

// ─── Run Queries ─────────────────────────────────────────────────────────────

export function getAllRuns(db: Database.Database) {
  return db.prepare(`
    SELECT r.*, COUNT(DISTINCT mr.model_name) as model_count
    FROM test_runs r
    LEFT JOIN model_results mr ON mr.run_id = r.id
    GROUP BY r.id
    ORDER BY r.started_at DESC
    LIMIT 100
  `).all();
}

export function getRunById(db: Database.Database, id: string) {
  const run = db.prepare("SELECT * FROM test_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!run) return null;

  const modelResults = db.prepare("SELECT * FROM model_results WHERE run_id = ? ORDER BY overall_score DESC").all(id) as Record<string, unknown>[];
  for (const mr of modelResults) {
    const promptResults = db.prepare("SELECT * FROM prompt_results WHERE model_result_id = ?").all(mr.id as string) as Record<string, unknown>[];
    (mr as Record<string, unknown>).promptResults = promptResults.map((pr) => ({
      ...pr,
      autoScores: JSON.parse((pr.auto_scores as string) || "{}"),
      judgeScores: pr.judge_scores ? JSON.parse(pr.judge_scores as string) : null,
    }));
    (mr as Record<string, unknown>).categoryScores = JSON.parse((mr.category_scores as string) || "{}");
  }

  return {
    ...run,
    hardware: JSON.parse((run.hardware as string) || "{}"),
    models: modelResults,
  };
}

export function createRun(db: Database.Database, run: {
  id: string; suiteId: string; suiteName: string; hardware: object;
  judgeModel: string | null; judgeEnabled: boolean;
  temperature: number; topP: number; maxTokens: number;
  suiteType?: string;
}) {
  db.prepare(`
    INSERT INTO test_runs (id, suite_id, suite_name, started_at, status, hardware, judge_model, judge_enabled, temperature, top_p, max_tokens, suite_type)
    VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?)
  `).run(run.id, run.suiteId, run.suiteName, new Date().toISOString(),
    JSON.stringify(run.hardware), run.judgeModel, run.judgeEnabled ? 1 : 0,
    run.temperature, run.topP, run.maxTokens, run.suiteType ?? "standard");
}

export function deleteRun(db: Database.Database, id: string) {
  db.prepare("DELETE FROM test_runs WHERE id = ?").run(id);
}

export function completeRun(db: Database.Database, id: string) {
  db.prepare("UPDATE test_runs SET status = 'completed', completed_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
  db.prepare("UPDATE test_suites SET last_run_at = ? WHERE id = (SELECT suite_id FROM test_runs WHERE id = ?)")
    .run(new Date().toISOString(), id);
}

export function saveModelResult(db: Database.Database, mr: {
  id: string; runId: string; modelName: string; family: string;
  parameterSize: string; quantization: string; overallScore: number;
  categoryScores: object; avgTokensPerSec: number; avgTTFT: number;
  totalDuration: number; skipped: boolean; skipReason: string | null;
}) {
  db.prepare(`
    INSERT INTO model_results (id, run_id, model_name, family, parameter_size, quantization, overall_score, category_scores, avg_tokens_per_sec, avg_ttft, total_duration, skipped, skip_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(mr.id, mr.runId, mr.modelName, mr.family, mr.parameterSize, mr.quantization,
    mr.overallScore, JSON.stringify(mr.categoryScores), mr.avgTokensPerSec, mr.avgTTFT,
    mr.totalDuration, mr.skipped ? 1 : 0, mr.skipReason);
}

export function updateModelResult(db: Database.Database, id: string, mr: {
  overallScore: number; categoryScores: object; avgTokensPerSec: number;
  avgTTFT: number; totalDuration: number; parameterSize: string; quantization: string;
}) {
  db.prepare(`
    UPDATE model_results
    SET overall_score = ?, category_scores = ?, avg_tokens_per_sec = ?,
        avg_ttft = ?, total_duration = ?, parameter_size = ?, quantization = ?
    WHERE id = ?
  `).run(mr.overallScore, JSON.stringify(mr.categoryScores), mr.avgTokensPerSec,
    mr.avgTTFT, mr.totalDuration, mr.parameterSize, mr.quantization, id);
}

export function savePromptResult(db: Database.Database, pr: {
  id: string; runId: string; modelResultId: string; modelName: string;
  promptId: string; response: string; tokensPerSec: number; ttft: number;
  totalTokens: number; duration: number; autoScores: object;
  judgeScores: object | null; timedOut: boolean; error: string | null;
}) {
  db.prepare(`
    INSERT INTO prompt_results (id, run_id, model_result_id, model_name, prompt_id, response, tokens_per_sec, ttft, total_tokens, duration, auto_scores, judge_scores, timed_out, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(pr.id, pr.runId, pr.modelResultId, pr.modelName, pr.promptId, pr.response,
    pr.tokensPerSec, pr.ttft, pr.totalTokens, pr.duration,
    JSON.stringify(pr.autoScores), pr.judgeScores ? JSON.stringify(pr.judgeScores) : null,
    pr.timedOut ? 1 : 0, pr.error);
}

export function updateManualVote(db: Database.Database, promptResultId: string, vote: "better" | "worse" | null) {
  db.prepare("UPDATE prompt_results SET manual_vote = ? WHERE id = ?").run(vote, promptResultId);
}

export function updatePromptJudgeScores(db: Database.Database, promptResultId: string, judgeScores: object) {
  db.prepare("UPDATE prompt_results SET judge_scores = ? WHERE id = ?")
    .run(JSON.stringify(judgeScores), promptResultId);
}

export function getPromptResultsForModel(db: Database.Database, modelResultId: string) {
  return db.prepare("SELECT id, prompt_id, response FROM prompt_results WHERE model_result_id = ? ORDER BY rowid")
    .all(modelResultId) as { id: string; prompt_id: string; response: string }[];
}

// ─── Preferences Queries ─────────────────────────────────────────────────────

export function getPreferences(db: Database.Database): UserPreferences {
  const rows = db.prepare("SELECT key, value FROM preferences").all() as { key: string; value: string }[];
  const prefs: Record<string, unknown> = {};
  for (const row of rows) {
    prefs[row.key] = JSON.parse(row.value);
  }
  return prefs as unknown as UserPreferences;
}

export function setPreference(db: Database.Database, key: string, value: unknown) {
  db.prepare("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export interface ApiKeyRow {
  id: string;
  provider: string;
  encrypted_key: string;
  base_url: string | null;
  model_id: string | null;
  label: string | null;
  use_for_judging: number;
  use_for_baseline: number;
  spend_limit_usd: number;
  spend_used_usd: number;
  spend_month: string;
  status: string;
  created_at: string;
}

export function getApiKeys(db: Database.Database): ApiKeyRow[] {
  return db.prepare("SELECT * FROM api_keys ORDER BY created_at ASC").all() as ApiKeyRow[];
}

export function upsertApiKey(db: Database.Database, key: {
  id: string; provider: string; encryptedKey: string;
  baseUrl?: string | null; modelId?: string | null; label?: string | null;
  useForJudging: boolean; useForBaseline: boolean;
  spendLimitUsd: number;
}) {
  db.prepare(`
    INSERT INTO api_keys (id, provider, encrypted_key, base_url, model_id, label, use_for_judging, use_for_baseline, spend_limit_usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      encrypted_key = excluded.encrypted_key,
      base_url = excluded.base_url,
      model_id = excluded.model_id,
      label = excluded.label,
      use_for_judging = excluded.use_for_judging,
      use_for_baseline = excluded.use_for_baseline,
      spend_limit_usd = excluded.spend_limit_usd
  `).run(
    key.id, key.provider, key.encryptedKey,
    key.baseUrl ?? null, key.modelId ?? null, key.label ?? null,
    key.useForJudging ? 1 : 0, key.useForBaseline ? 1 : 0,
    key.spendLimitUsd, new Date().toISOString()
  );
}

export function updateApiKeyStatus(db: Database.Database, provider: string, status: string) {
  db.prepare("UPDATE api_keys SET status = ? WHERE provider = ?").run(status, provider);
}

export function deleteApiKey(db: Database.Database, provider: string) {
  db.prepare("DELETE FROM api_keys WHERE provider = ?").run(provider);
}

export function addApiKeySpend(db: Database.Database, provider: string, usd: number) {
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  // Reset spend if new month
  db.prepare(`
    UPDATE api_keys
    SET spend_used_usd = CASE WHEN spend_month = ? THEN spend_used_usd + ? ELSE ? END,
        spend_month = ?
    WHERE provider = ?
  `).run(month, usd, usd, month, provider);
}

// ─── Cloud Providers ─────────────────────────────────────────────────────────

export interface CloudProviderRow {
  id: string;
  provider_type: string;
  label: string;
  api_key: string;
  base_url: string | null;
  selected_model: string | null;
  use_for_judging: number;
  use_for_playground: number;
  created_at: string;
  updated_at: string;
}

export function getCloudProviders(db: Database.Database): CloudProviderRow[] {
  return db.prepare("SELECT * FROM cloud_providers ORDER BY created_at ASC").all() as CloudProviderRow[];
}

export function getCloudProviderById(db: Database.Database, id: string): CloudProviderRow | undefined {
  return db.prepare("SELECT * FROM cloud_providers WHERE id = ?").get(id) as CloudProviderRow | undefined;
}

export function createCloudProvider(db: Database.Database, p: {
  id: string; providerType: string; label: string; apiKey: string;
  baseUrl?: string | null; selectedModel?: string | null;
  useForJudging: boolean; useForPlayground: boolean;
}) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO cloud_providers (id, provider_type, label, api_key, base_url, selected_model, use_for_judging, use_for_playground, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(p.id, p.providerType, p.label, p.apiKey, p.baseUrl ?? null,
    p.selectedModel ?? null, p.useForJudging ? 1 : 0, p.useForPlayground ? 1 : 0, now, now);
}

export function updateCloudProvider(db: Database.Database, id: string, data: {
  label?: string; apiKey?: string; baseUrl?: string | null;
  selectedModel?: string | null; useForJudging?: boolean; useForPlayground?: boolean;
}) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.label !== undefined) { fields.push("label = ?"); values.push(data.label); }
  if (data.apiKey !== undefined) { fields.push("api_key = ?"); values.push(data.apiKey); }
  if (data.baseUrl !== undefined) { fields.push("base_url = ?"); values.push(data.baseUrl); }
  if (data.selectedModel !== undefined) { fields.push("selected_model = ?"); values.push(data.selectedModel); }
  if (data.useForJudging !== undefined) { fields.push("use_for_judging = ?"); values.push(data.useForJudging ? 1 : 0); }
  if (data.useForPlayground !== undefined) { fields.push("use_for_playground = ?"); values.push(data.useForPlayground ? 1 : 0); }
  if (fields.length === 0) return;
  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);
  db.prepare(`UPDATE cloud_providers SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteCloudProvider(db: Database.Database, id: string) {
  db.prepare("DELETE FROM cloud_providers WHERE id = ?").run(id);
}

// ─── Scoring v2 Helpers ──────────────────────────────────────────────────────

export function saveRubricDimensions(db: Database.Database, data: {
  promptResultId: string;
  relevance: number; depth: number; coherence: number;
  compliance: number; languageQuality: number;
  gatePass: boolean; gateFlag: string | null;
}) {
  db.prepare(`
    INSERT INTO prompt_dimension_scores (prompt_result_id, relevance, depth, coherence, compliance, language_quality, gate_pass, gate_flag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.promptResultId, data.relevance, data.depth, data.coherence,
    data.compliance, data.languageQuality, data.gatePass ? 1 : 0, data.gateFlag);
}

export function saveJudgeEvaluation(db: Database.Database, data: {
  promptResultId: string; judgeModel: string;
  accuracy: number; helpfulness: number; clarity: number;
  instructionFollowing: number; strengths: string; weaknesses: string;
  isWinner: boolean; winnerReasoning: string; judgeScore: number;
}) {
  db.prepare(`
    INSERT INTO judge_evaluations (prompt_result_id, judge_model, accuracy, helpfulness, clarity, instruction_following, strengths, weaknesses, is_winner, winner_reasoning, judge_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.promptResultId, data.judgeModel, data.accuracy, data.helpfulness,
    data.clarity, data.instructionFollowing, data.strengths, data.weaknesses,
    data.isWinner ? 1 : 0, data.winnerReasoning, data.judgeScore);
}

export function getEloRatings(db: Database.Database) {
  return db.prepare("SELECT * FROM elo_ratings ORDER BY rating DESC").all() as {
    model_name: string; rating: number; match_count: number; last_updated: string;
  }[];
}

export function getEloRating(db: Database.Database, modelName: string) {
  return db.prepare("SELECT * FROM elo_ratings WHERE model_name = ?").get(modelName) as {
    model_name: string; rating: number; match_count: number; last_updated: string;
  } | undefined;
}

export function upsertEloRating(db: Database.Database, modelName: string, rating: number, matchCount: number) {
  db.prepare(`
    INSERT INTO elo_ratings (model_name, rating, match_count, last_updated)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(model_name) DO UPDATE SET
      rating = excluded.rating,
      match_count = excluded.match_count,
      last_updated = excluded.last_updated
  `).run(modelName, rating, matchCount, new Date().toISOString());
}

export function saveEloMatch(db: Database.Database, data: {
  runId: string; promptId: string; winner: string; loser: string;
  isTie: boolean; winnerJudgeScore: number | null; loserJudgeScore: number | null;
}) {
  db.prepare(`
    INSERT INTO elo_matches (run_id, prompt_id, winner, loser, is_tie, winner_judge_score, loser_judge_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.runId, data.promptId, data.winner, data.loser,
    data.isTie ? 1 : 0, data.winnerJudgeScore, data.loserJudgeScore,
    new Date().toISOString());
}

export function getEloMatchesForRun(db: Database.Database, runId: string) {
  return db.prepare("SELECT * FROM elo_matches WHERE run_id = ? ORDER BY created_at").all(runId);
}

export function getDimensionScoresForPromptResult(db: Database.Database, promptResultId: string) {
  return db.prepare("SELECT * FROM prompt_dimension_scores WHERE prompt_result_id = ?").get(promptResultId) as {
    relevance: number; depth: number; coherence: number; compliance: number;
    language_quality: number; gate_pass: number; gate_flag: string | null;
  } | undefined;
}

export function getJudgeEvaluationsForPromptResult(db: Database.Database, promptResultId: string) {
  return db.prepare("SELECT * FROM judge_evaluations WHERE prompt_result_id = ?").all(promptResultId);
}

// ─── Data Management ─────────────────────────────────────────────────────────

export function deleteAllRuns(db: Database.Database) {
  const runCount = (db.prepare("SELECT COUNT(*) as c FROM test_runs").get() as { c: number }).c;
  const resultCount = (db.prepare("SELECT COUNT(*) as c FROM prompt_results").get() as { c: number }).c;
  db.prepare("DELETE FROM prompt_results").run();
  db.prepare("DELETE FROM model_results").run();
  db.prepare("DELETE FROM test_runs").run();
  return { runs: runCount, results: resultCount };
}

export function deleteAllSuites(db: Database.Database) {
  const suiteCount = (db.prepare("SELECT COUNT(*) as c FROM test_suites WHERE is_built_in = 0").get() as { c: number }).c;
  // Cascade: delete runs referencing non-built-in suites
  const runCount = (db.prepare("SELECT COUNT(*) as c FROM test_runs WHERE suite_id IN (SELECT id FROM test_suites WHERE is_built_in = 0)").get() as { c: number }).c;
  db.prepare("DELETE FROM test_runs WHERE suite_id IN (SELECT id FROM test_suites WHERE is_built_in = 0)").run();
  db.prepare("DELETE FROM test_suites WHERE is_built_in = 0").run();
  return { suites: suiteCount, runs: runCount };
}

export function deleteAllData(db: Database.Database) {
  const runCount = (db.prepare("SELECT COUNT(*) as c FROM test_runs").get() as { c: number }).c;
  const resultCount = (db.prepare("SELECT COUNT(*) as c FROM prompt_results").get() as { c: number }).c;
  const suiteCount = (db.prepare("SELECT COUNT(*) as c FROM test_suites").get() as { c: number }).c;
  const providerCount = (db.prepare("SELECT COUNT(*) as c FROM cloud_providers").get() as { c: number }).c;
  db.prepare("DELETE FROM prompt_results").run();
  db.prepare("DELETE FROM model_results").run();
  db.prepare("DELETE FROM test_runs").run();
  db.prepare("DELETE FROM prompts").run();
  db.prepare("DELETE FROM test_suites").run();
  db.prepare("DELETE FROM cloud_providers").run();
  db.prepare("DELETE FROM api_keys").run();
  return { runs: runCount, results: resultCount, suites: suiteCount, providers: providerCount };
}
