import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { UserPreferences } from "@/types";
// Encryption removed — local-only app, DB is on user's machine, encryption
// just breaks things when .seed file changes or hostname changes.

/** Our ciphertext format is `iv:tag:ciphertext` where each part is hex. */
const CIPHERTEXT_RE = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i;

function isLikelyEncrypted(v: string | null | undefined): boolean {
  return !!v && CIPHERTEXT_RE.test(v);
}

/** Pass through API key as-is (no encryption). */
function safeDecrypt(v: string | null | undefined): string {
  if (!v) return "";
  return v;
}

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
  migrateCloudProviderSpendColumns(_db);
  migrateCloudProviderKeys(_db);

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

    -- Track deleted built-in suites so they don't get re-seeded
    CREATE TABLE IF NOT EXISTS deleted_builtins (
      suite_id TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL
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
      spend_limit_usd REAL NOT NULL DEFAULT 5.0,
      spend_used_usd REAL NOT NULL DEFAULT 0.0,
      spend_month TEXT NOT NULL DEFAULT '',
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
    CREATE TABLE IF NOT EXISTS peer_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      prompt_id TEXT NOT NULL,
      model_a TEXT NOT NULL,
      model_b TEXT NOT NULL,
      judge TEXT NOT NULL,
      vote TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_elo_matches_run_id ON elo_matches(run_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_dimensions_prid ON prompt_dimension_scores(prompt_result_id);
    CREATE INDEX IF NOT EXISTS idx_judge_evals_prid ON judge_evaluations(prompt_result_id);
    CREATE INDEX IF NOT EXISTS idx_peer_votes_run_id ON peer_votes(run_id);
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

    -- ── Vision Scenarios ──
    CREATE TABLE IF NOT EXISTS vision_scenarios (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      image_data TEXT NOT NULL,
      image_mime TEXT NOT NULL DEFAULT 'image/png',
      question TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'description',
      expected_answer TEXT,
      rubric TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT 'medium',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vision_scenarios_suite ON vision_scenarios(suite_id);

    -- ── Coding Scenarios ──
    CREATE TABLE IF NOT EXISTS coding_scenarios (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'python',
      function_signature TEXT NOT NULL DEFAULT '',
      test_cases TEXT NOT NULL DEFAULT '[]',
      setup_code TEXT,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      time_limit_ms INTEGER NOT NULL DEFAULT 30000,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_coding_scenarios_suite ON coding_scenarios(suite_id);

    -- ── RAG Documents & Scenarios ──
    CREATE TABLE IF NOT EXISTS rag_documents (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rag_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      token_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rag_scenarios (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES rag_documents(id),
      question TEXT NOT NULL,
      ground_truth_answer TEXT NOT NULL DEFAULT '',
      relevant_chunk_ids TEXT NOT NULL DEFAULT '[]',
      distractor_chunk_ids TEXT NOT NULL DEFAULT '[]',
      answer_not_in_document INTEGER NOT NULL DEFAULT 0,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rag_docs_suite ON rag_documents(suite_id);
    CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_rag_scenarios_suite ON rag_scenarios(suite_id);

    -- ── MCP Servers ──
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL DEFAULT 'stdio',
      command TEXT,
      args TEXT NOT NULL DEFAULT '[]',
      url TEXT,
      env TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- ── Peer Judge Results ──
    CREATE TABLE IF NOT EXISTS peer_judge_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      prompt_id TEXT NOT NULL,
      model_a TEXT NOT NULL,
      model_b TEXT NOT NULL,
      winner TEXT NOT NULL,
      votes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_peer_judge_run ON peer_judge_results(run_id);
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

function seedStarterSuites(db: Database.Database, opts: { force?: boolean } = {}) {
  const force = !!opts.force;
  const count = (db.prepare("SELECT COUNT(*) as c FROM test_suites WHERE is_built_in = 1").get() as { c: number }).c;

  // Check if a built-in suite was deleted by the user — don't re-seed it.
  // Force mode bypasses this AFTER the caller has cleared deleted_builtins.
  const wasDeleted = (suiteId: string): boolean => {
    if (force) return false;
    const row = db.prepare("SELECT 1 FROM deleted_builtins WHERE suite_id = ?").get(suiteId);
    return !!row;
  };

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { STARTER_SUITES, STARTER_TOOL_SUITES, STARTER_CONVERSATION_SUITES, STARTER_ADVERSARIAL_SUITES, OWASP_LLM_TOP10_SUITE, STARTER_CODING_SUITES } = require("./starter-suites");

  if (count === 0 || force) {
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
        if (wasDeleted(suite.id)) continue;
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

  if ((toolSuiteExists === 0 || force) && STARTER_TOOL_SUITES) {
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
        if (wasDeleted(suite.id)) continue;
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

  if ((convoSuiteExists === 0 || force) && STARTER_CONVERSATION_SUITES) {
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
        if (wasDeleted(suite.id)) continue;
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

  if ((advSuiteExists === 0 || force) && STARTER_ADVERSARIAL_SUITES) {
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
        if (wasDeleted(suite.id)) continue;
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

  // ── OWASP LLM Top 10 Suite ──
  const owaspExists = (db.prepare("SELECT COUNT(*) as c FROM test_suites WHERE id = 'builtin-owasp-llm-top10'").get() as { c: number }).c;
  if ((owaspExists === 0 || force) && OWASP_LLM_TOP10_SUITE && !wasDeleted('builtin-owasp-llm-top10')) {
    const insertSuiteOwasp = db.prepare(`
      INSERT OR IGNORE INTO test_suites (id, name, description, suite_type, created_at, is_built_in)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const insertAdvScenarioOwasp = db.prepare(`
      INSERT OR IGNORE INTO adversarial_scenarios (id, suite_id, name, system_prompt, attack_strategy, max_turns, attack_intensity, failure_conditions, difficulty, attacker_mode, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedOwasp = db.transaction(() => {
      const suite = OWASP_LLM_TOP10_SUITE;
      insertSuiteOwasp.run(suite.id, suite.name, suite.description, suite.suiteType, new Date().toISOString());
      suite.adversarialScenarios.forEach((s: Record<string, unknown>, i: number) => {
        insertAdvScenarioOwasp.run(
          s.id, suite.id, s.name, s.systemPrompt, s.attackStrategy,
          s.maxTurns, s.attackIntensity,
          JSON.stringify(s.failureConditions || []),
          s.difficulty, s.attackerMode, i, new Date().toISOString()
        );
      });
    });

    seedOwasp();
  }

  // ── Coding Sandbox Starter Suite ──
  const codingSuiteExists = (db.prepare("SELECT COUNT(*) as c FROM test_suites WHERE id = 'builtin-coding-sandbox'").get() as { c: number }).c;
  if ((codingSuiteExists === 0 || force) && STARTER_CODING_SUITES && !wasDeleted('builtin-coding-sandbox')) {
    const insertSuiteCoding = db.prepare(`
      INSERT OR IGNORE INTO test_suites (id, name, description, suite_type, created_at, is_built_in)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const insertCodingScenario = db.prepare(`
      INSERT OR IGNORE INTO coding_scenarios (id, suite_id, name, description, language, function_signature, test_cases, difficulty, time_limit_ms, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedCoding = db.transaction(() => {
      for (const suite of STARTER_CODING_SUITES) {
        if (wasDeleted(suite.id)) continue;
        insertSuiteCoding.run(suite.id, suite.name, suite.description, suite.suiteType, new Date().toISOString());
        suite.codingScenarios.forEach((s: Record<string, unknown>, i: number) => {
          insertCodingScenario.run(
            s.id, suite.id, s.name, s.description,
            s.language, s.functionSignature,
            JSON.stringify(s.testCases || []),
            s.difficulty, s.timeLimitMs, i, new Date().toISOString()
          );
        });
      }
    });

    seedCoding();
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
        WHEN 'coding' THEN (SELECT COUNT(*) FROM coding_scenarios WHERE suite_id = s.id)
        WHEN 'vision' THEN (SELECT COUNT(*) FROM vision_scenarios WHERE suite_id = s.id)
        WHEN 'rag' THEN (SELECT COUNT(*) FROM rag_scenarios WHERE suite_id = s.id)
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
  const codingScenarios = getCodingScenarios(db, id);
  const visionScenarios = getVisionScenarios(db, id);
  const ragScenarios = getRagScenarios(db, id);
  const ragDocuments = getRagDocuments(db, id);
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
    codingScenarios: codingScenarios.map(c => ({
      ...c,
      suiteId: c.suite_id,
      functionSignature: c.function_signature,
      testCases: JSON.parse(c.test_cases || "[]"),
      setupCode: c.setup_code,
      timeLimitMs: c.time_limit_ms,
      order: c.sort_order,
    })),
    visionScenarios: visionScenarios.map(v => ({
      ...v,
      suiteId: v.suite_id,
      imageData: v.image_data,
      imageMime: v.image_mime,
      expectedAnswer: v.expected_answer,
      order: v.sort_order,
    })),
    ragScenarios: ragScenarios.map(r => ({
      ...r,
      suiteId: r.suite_id,
      documentId: r.document_id,
      groundTruthAnswer: r.ground_truth_answer,
      relevantChunkIds: JSON.parse(r.relevant_chunk_ids || "[]"),
      distractorChunkIds: JSON.parse(r.distractor_chunk_ids || "[]"),
      answerNotInDocument: r.answer_not_in_document === 1,
      order: r.sort_order,
    })),
    ragDocuments: ragDocuments.map(d => ({
      ...d,
      suiteId: d.suite_id,
      mimeType: d.mime_type,
      chunks: getRagChunks(db, d.id).map(c => ({
        ...c,
        documentId: c.document_id,
        tokenCount: c.token_count,
        order: c.sort_order,
      })),
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
  // Record built-in deletions so they don't get re-seeded
  const suite = db.prepare("SELECT is_built_in FROM test_suites WHERE id = ?").get(id) as { is_built_in: number } | undefined;
  if (suite?.is_built_in === 1) {
    db.prepare("INSERT OR REPLACE INTO deleted_builtins (suite_id, deleted_at) VALUES (?, ?)").run(id, new Date().toISOString());
  }
  // Delete all runs referencing this suite first (FK constraint)
  const runs = db.prepare("SELECT id FROM test_runs WHERE suite_id = ?").all(id) as Array<{ id: string }>;
  for (const run of runs) {
    deleteRun(db, run.id);
  }
  db.prepare("DELETE FROM test_suites WHERE id = ?").run(id);
}

/**
 * Restore all built-in starter suites (including any the user had previously
 * deleted). Clears the deleted_builtins tombstone table and re-seeds. Safe
 * to call repeatedly — existing suites are preserved via INSERT OR IGNORE.
 */
export function restoreBuiltinSuites(db: Database.Database): { beforeCount: number; afterCount: number; restored: number } {
  const beforeCount = (db.prepare("SELECT COUNT(*) as c FROM test_suites WHERE is_built_in = 1").get() as { c: number }).c;
  db.prepare("DELETE FROM deleted_builtins").run();
  seedStarterSuites(db, { force: true });
  const afterCount = (db.prepare("SELECT COUNT(*) as c FROM test_suites WHERE is_built_in = 1").get() as { c: number }).c;
  return { beforeCount, afterCount, restored: Math.max(0, afterCount - beforeCount) };
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

// ─── Coding Scenario Queries ────────────────────────────────────────────────

export function getCodingScenarios(db: Database.Database, suiteId: string) {
  return db.prepare("SELECT * FROM coding_scenarios WHERE suite_id = ? ORDER BY sort_order").all(suiteId) as {
    id: string; suite_id: string; name: string; description: string;
    language: string; function_signature: string; test_cases: string;
    setup_code: string | null; difficulty: string; time_limit_ms: number;
    sort_order: number; created_at: string;
  }[];
}

export function createCodingScenario(db: Database.Database, s: {
  id: string; suiteId: string; name: string; description: string;
  language: string; functionSignature: string; testCases: unknown[];
  setupCode?: string | null; difficulty: string; timeLimitMs: number; order: number;
}) {
  db.prepare(`
    INSERT INTO coding_scenarios (id, suite_id, name, description, language, function_signature, test_cases, setup_code, difficulty, time_limit_ms, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(s.id, s.suiteId, s.name, s.description, s.language, s.functionSignature,
    JSON.stringify(s.testCases ?? []), s.setupCode ?? null,
    s.difficulty, s.timeLimitMs, s.order, new Date().toISOString());
}

export function deleteCodingScenario(db: Database.Database, id: string) {
  db.prepare("DELETE FROM coding_scenarios WHERE id = ?").run(id);
}

export function updateCodingScenario(db: Database.Database, id: string, data: Partial<{
  name: string; description: string; language: string; functionSignature: string;
  testCases: unknown[]; setupCode: string | null; difficulty: string; timeLimitMs: number; order: number;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
  if (data.language !== undefined) { fields.push("language = ?"); values.push(data.language); }
  if (data.functionSignature !== undefined) { fields.push("function_signature = ?"); values.push(data.functionSignature); }
  if (data.testCases !== undefined) { fields.push("test_cases = ?"); values.push(JSON.stringify(data.testCases)); }
  if (data.setupCode !== undefined) { fields.push("setup_code = ?"); values.push(data.setupCode); }
  if (data.difficulty !== undefined) { fields.push("difficulty = ?"); values.push(data.difficulty); }
  if (data.timeLimitMs !== undefined) { fields.push("time_limit_ms = ?"); values.push(data.timeLimitMs); }
  if (data.order !== undefined) { fields.push("sort_order = ?"); values.push(data.order); }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE coding_scenarios SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

// ─── Vision Scenario Queries ────────────────────────────────────────────────

export function getVisionScenarios(db: Database.Database, suiteId: string) {
  return db.prepare("SELECT * FROM vision_scenarios WHERE suite_id = ? ORDER BY sort_order").all(suiteId) as {
    id: string; suite_id: string; name: string; image_data: string; image_mime: string;
    question: string; category: string; expected_answer: string | null; rubric: string;
    difficulty: string; sort_order: number; created_at: string;
  }[];
}

export function createVisionScenario(db: Database.Database, s: {
  id: string; suiteId: string; name: string; imageData: string; imageMime: string;
  question: string; category: string; expectedAnswer?: string | null; rubric?: string;
  difficulty: string; order: number;
}) {
  db.prepare(`
    INSERT INTO vision_scenarios (id, suite_id, name, image_data, image_mime, question, category, expected_answer, rubric, difficulty, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(s.id, s.suiteId, s.name, s.imageData, s.imageMime, s.question, s.category,
    s.expectedAnswer ?? null, s.rubric ?? "", s.difficulty, s.order, new Date().toISOString());
}

export function updateVisionScenario(db: Database.Database, id: string, data: Partial<{
  name: string; imageData: string; imageMime: string; question: string;
  category: string; expectedAnswer: string | null; rubric: string; difficulty: string; order: number;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.imageData !== undefined) { fields.push("image_data = ?"); values.push(data.imageData); }
  if (data.imageMime !== undefined) { fields.push("image_mime = ?"); values.push(data.imageMime); }
  if (data.question !== undefined) { fields.push("question = ?"); values.push(data.question); }
  if (data.category !== undefined) { fields.push("category = ?"); values.push(data.category); }
  if (data.expectedAnswer !== undefined) { fields.push("expected_answer = ?"); values.push(data.expectedAnswer); }
  if (data.rubric !== undefined) { fields.push("rubric = ?"); values.push(data.rubric); }
  if (data.difficulty !== undefined) { fields.push("difficulty = ?"); values.push(data.difficulty); }
  if (data.order !== undefined) { fields.push("sort_order = ?"); values.push(data.order); }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE vision_scenarios SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteVisionScenario(db: Database.Database, id: string) {
  db.prepare("DELETE FROM vision_scenarios WHERE id = ?").run(id);
}

// ─── RAG Scenario Queries ───────────────────────────────────────────────────

export function getRagDocuments(db: Database.Database, suiteId: string) {
  return db.prepare("SELECT * FROM rag_documents WHERE suite_id = ? ORDER BY created_at DESC").all(suiteId) as {
    id: string; suite_id: string; filename: string; mime_type: string; content: string; created_at: string;
  }[];
}

export function getRagChunks(db: Database.Database, documentId: string) {
  return db.prepare("SELECT * FROM rag_chunks WHERE document_id = ? ORDER BY sort_order").all(documentId) as {
    id: string; document_id: string; text: string; source: string; token_count: number; sort_order: number;
  }[];
}

export function getRagScenarios(db: Database.Database, suiteId: string) {
  return db.prepare("SELECT * FROM rag_scenarios WHERE suite_id = ? ORDER BY sort_order").all(suiteId) as {
    id: string; suite_id: string; document_id: string; question: string; ground_truth_answer: string;
    relevant_chunk_ids: string; distractor_chunk_ids: string; answer_not_in_document: number;
    difficulty: string; sort_order: number; created_at: string;
  }[];
}

export function createRagScenario(db: Database.Database, s: {
  id: string; suiteId: string; documentId: string; question: string; groundTruthAnswer: string;
  relevantChunkIds: string[]; distractorChunkIds: string[]; answerNotInDocument: boolean;
  difficulty: string; order: number;
}) {
  db.prepare(`
    INSERT INTO rag_scenarios (id, suite_id, document_id, question, ground_truth_answer, relevant_chunk_ids, distractor_chunk_ids, answer_not_in_document, difficulty, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(s.id, s.suiteId, s.documentId, s.question, s.groundTruthAnswer,
    JSON.stringify(s.relevantChunkIds), JSON.stringify(s.distractorChunkIds),
    s.answerNotInDocument ? 1 : 0, s.difficulty, s.order, new Date().toISOString());
}

export function updateRagScenario(db: Database.Database, id: string, data: Partial<{
  question: string; groundTruthAnswer: string; relevantChunkIds: string[];
  distractorChunkIds: string[]; answerNotInDocument: boolean; difficulty: string; order: number;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.question !== undefined) { fields.push("question = ?"); values.push(data.question); }
  if (data.groundTruthAnswer !== undefined) { fields.push("ground_truth_answer = ?"); values.push(data.groundTruthAnswer); }
  if (data.relevantChunkIds !== undefined) { fields.push("relevant_chunk_ids = ?"); values.push(JSON.stringify(data.relevantChunkIds)); }
  if (data.distractorChunkIds !== undefined) { fields.push("distractor_chunk_ids = ?"); values.push(JSON.stringify(data.distractorChunkIds)); }
  if (data.answerNotInDocument !== undefined) { fields.push("answer_not_in_document = ?"); values.push(data.answerNotInDocument ? 1 : 0); }
  if (data.difficulty !== undefined) { fields.push("difficulty = ?"); values.push(data.difficulty); }
  if (data.order !== undefined) { fields.push("sort_order = ?"); values.push(data.order); }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE rag_scenarios SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteRagScenario(db: Database.Database, id: string) {
  db.prepare("DELETE FROM rag_scenarios WHERE id = ?").run(id);
}

// ─── Adversarial Updates ────────────────────────────────────────────────────

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

/**
 * Re-aggregate a model's overall score for a given run, taking human votes into
 * account via computeCompositeScore. Called after a vote changes.
 *
 * Reads all prompt results for (run_id, model_name), blends gate/judge/vote
 * into per-prompt composites, then averages. Kept inline (not in scoring.ts)
 * because it needs DB access and scoring.ts stays pure.
 *
 * Synthetic rows (conversation/adversarial-mode placeholders) are skipped
 * because those modes' overall_score is a mode-specific score (robustness,
 * quality decay, etc.) that shouldn't be clobbered by a generic vote average.
 */
export function recomputeModelOverallWithVotes(db: Database.Database, runId: string, modelResultId: string): void {
  const rows = db.prepare(`
    SELECT pr.id, pr.auto_scores, pr.judge_scores, pr.manual_vote
    FROM prompt_results pr
    WHERE pr.run_id = ? AND pr.model_result_id = ?
  `).all(runId, modelResultId) as Array<{ id: string; auto_scores: string; judge_scores: string | null; manual_vote: string | null }>;

  if (rows.length === 0) return;

  let sum = 0;
  let count = 0;
  for (const row of rows) {
    let auto: { rubricScore?: number; gatePass?: boolean; gateFlag?: string | null; synthetic?: string } = {};
    try { auto = JSON.parse(row.auto_scores); } catch { /* treat as empty */ }

    // Synthetic rows belong to conversation/adversarial runs whose overall
    // score is set by mode-specific engines; don't include them in the
    // vote-weighted average.
    if (auto.synthetic) continue;

    let judge: { score?: number } | null = null;
    if (row.judge_scores) {
      try { judge = JSON.parse(row.judge_scores); } catch { judge = null; }
    }

    const gateScore = typeof auto.rubricScore === "number" ? auto.rubricScore : 0;
    const gatePass = auto.gatePass !== false; // default true if unset
    const judgeScore = typeof judge?.score === "number" ? judge.score : undefined;
    const vote = row.manual_vote === "better" || row.manual_vote === "worse" ? row.manual_vote : null;

    // Inline the composite math to avoid importing scoring.ts into db.ts.
    let composite: number;
    if (!gatePass) composite = 0;
    else {
      const base = judgeScore !== undefined && judgeScore > 0
        ? Math.max(0, Math.min(100, judgeScore))
        : gateScore;
      if (vote === "better") composite = Math.min(100, base + 5);
      else if (vote === "worse") composite = Math.max(0, base - 5);
      else composite = base;
    }
    sum += composite;
    count++;
  }

  // If there were no non-synthetic rows, don't touch overall_score — it's
  // owned by the conversation/adversarial engines.
  if (count === 0) return;

  const overall = Math.round(sum / count);
  db.prepare("UPDATE model_results SET overall_score = ? WHERE id = ?").run(overall, modelResultId);
}

/** Find the model_result_id that owns a given prompt_result. */
export function getModelResultIdForPrompt(db: Database.Database, promptResultId: string): { runId: string; modelResultId: string } | null {
  const row = db.prepare("SELECT run_id, model_result_id FROM prompt_results WHERE id = ?").get(promptResultId) as { run_id: string; model_result_id: string } | undefined;
  return row ? { runId: row.run_id, modelResultId: row.model_result_id } : null;
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

// The legacy `api_keys` table (and its getApiKeys / upsertApiKey / addApiKeySpend
// helpers) was replaced by `cloud_providers` with proper AES-256-GCM encryption
// and spend tracking. The table row still exists in initSchema for backwards
// compatibility with existing DBs but no code reads it anymore. See
// migrateCloudProviderSpendColumns / incrementCloudSpend below.

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
  spend_limit_usd: number;
  spend_used_usd: number;
  spend_month: string;
  created_at: string;
  updated_at: string;
}

export function getCloudProviders(db: Database.Database): CloudProviderRow[] {
  const rows = db.prepare("SELECT * FROM cloud_providers ORDER BY created_at ASC").all() as CloudProviderRow[];
  return rows.map((r) => ({ ...r, api_key: safeDecrypt(r.api_key) }));
}

export function getCloudProviderById(db: Database.Database, id: string): CloudProviderRow | undefined {
  const row = db.prepare("SELECT * FROM cloud_providers WHERE id = ?").get(id) as CloudProviderRow | undefined;
  if (!row) return undefined;
  return { ...row, api_key: safeDecrypt(row.api_key) };
}

/**
 * Get the raw (still-encrypted) api_key for a provider. Used only by the
 * migration helper so we can detect plaintext rows — callers doing real work
 * should use getCloudProviderById and receive the decrypted key.
 */
function getRawApiKey(db: Database.Database, id: string): string | null {
  const row = db.prepare("SELECT api_key FROM cloud_providers WHERE id = ?").get(id) as { api_key: string } | undefined;
  return row?.api_key ?? null;
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
  if (data.apiKey !== undefined) {
    fields.push("api_key = ?");
    values.push(data.apiKey);
  }
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

/**
 * One-time migration: decrypt any encrypted api_key values back to plaintext.
 */
function migrateCloudProviderKeys(db: Database.Database) {
  const rows = db.prepare("SELECT id, api_key FROM cloud_providers").all() as Array<{ id: string; api_key: string }>;
  const needsMigration = rows.filter((r) => isLikelyEncrypted(r.api_key));
  if (needsMigration.length === 0) return;
  // Try to decrypt, if fails just clear the key (user will re-enter)
  for (const r of needsMigration) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { decryptApiKey } = require("./crypto");
      const plain = decryptApiKey(r.api_key);
      db.prepare("UPDATE cloud_providers SET api_key = ? WHERE id = ?").run(plain, r.id);
    } catch {
      // Can't decrypt — clear it so user re-enters
      db.prepare("UPDATE cloud_providers SET api_key = '', status = 'not_set' WHERE id = ?").run(r.id);
    }
  }
}

/** Add spend-tracking columns to cloud_providers if they don't already exist. */
function migrateCloudProviderSpendColumns(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(cloud_providers)").all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("spend_limit_usd")) {
    db.exec("ALTER TABLE cloud_providers ADD COLUMN spend_limit_usd REAL NOT NULL DEFAULT 5.0");
  }
  if (!names.has("spend_used_usd")) {
    db.exec("ALTER TABLE cloud_providers ADD COLUMN spend_used_usd REAL NOT NULL DEFAULT 0.0");
  }
  if (!names.has("spend_month")) {
    db.exec("ALTER TABLE cloud_providers ADD COLUMN spend_month TEXT NOT NULL DEFAULT ''");
  }
}

function currentYyyyMm(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Returns whether another cloud call is allowed for this provider this month,
 * plus the remaining budget in USD. Resets the counter transparently if the
 * month has rolled over.
 */
export function checkCloudSpendAllowed(db: Database.Database, providerId: string): { allowed: boolean; remaining: number; limit: number; used: number } {
  const row = db.prepare(
    "SELECT spend_limit_usd, spend_used_usd, spend_month FROM cloud_providers WHERE id = ?"
  ).get(providerId) as { spend_limit_usd: number; spend_used_usd: number; spend_month: string } | undefined;
  if (!row) return { allowed: false, remaining: 0, limit: 0, used: 0 };
  const month = currentYyyyMm();
  const used = row.spend_month === month ? row.spend_used_usd : 0;
  const remaining = Math.max(0, row.spend_limit_usd - used);
  return { allowed: used < row.spend_limit_usd, remaining, limit: row.spend_limit_usd, used };
}

/**
 * Record a cloud API call's cost. Resets the monthly counter if we've rolled
 * into a new month. Safe to call concurrently — `better-sqlite3` is synchronous.
 */
export function incrementCloudSpend(db: Database.Database, providerId: string, costUsd: number): void {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  const month = currentYyyyMm();
  const row = db.prepare("SELECT spend_used_usd, spend_month FROM cloud_providers WHERE id = ?").get(providerId) as { spend_used_usd: number; spend_month: string } | undefined;
  if (!row) return;
  const currentUsed = row.spend_month === month ? row.spend_used_usd : 0;
  const newUsed = currentUsed + costUsd;
  db.prepare("UPDATE cloud_providers SET spend_used_usd = ?, spend_month = ?, updated_at = ? WHERE id = ?")
    .run(newUsed, month, new Date().toISOString(), providerId);
}

/** Admin: set or update the monthly spend limit for a provider. */
export function setCloudSpendLimit(db: Database.Database, providerId: string, limitUsd: number): void {
  if (!Number.isFinite(limitUsd) || limitUsd < 0) return;
  db.prepare("UPDATE cloud_providers SET spend_limit_usd = ?, updated_at = ? WHERE id = ?")
    .run(limitUsd, new Date().toISOString(), providerId);
}

// Suppress unused warning for getRawApiKey — it's kept for future admin tooling.
void getRawApiKey;

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

// ─── Peer Votes ──────────────────────────────────────────────────────────────

export function savePeerVotes(
  db: Database.Database,
  runId: string,
  promptId: string,
  modelA: string,
  modelB: string,
  votes: Array<{ judge: string; winner: "A" | "B"; reason?: string }>
) {
  // Ensure reason column exists (migration for existing DBs)
  try { db.prepare("ALTER TABLE peer_votes ADD COLUMN reason TEXT").run(); } catch { /* already exists */ }

  const now = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO peer_votes (run_id, prompt_id, model_a, model_b, judge, vote, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const v of votes) {
    stmt.run(runId, promptId, modelA, modelB, v.judge, v.winner, v.reason || null, now);
  }
}

export function getPeerVotesForRun(db: Database.Database, runId: string) {
  return db.prepare("SELECT * FROM peer_votes WHERE run_id = ? ORDER BY created_at").all(runId) as Array<{
    id: number; run_id: string; prompt_id: string;
    model_a: string; model_b: string; judge: string; vote: string; reason: string | null;
  }>;
}

export function getJudgeEvaluationsForRun(db: Database.Database, runId: string) {
  return db.prepare(`
    SELECT je.*, pr.model_name, pr.prompt_id
    FROM judge_evaluations je
    JOIN prompt_results pr ON pr.id = je.prompt_result_id
    WHERE pr.run_id = ?
    ORDER BY je.id
  `).all(runId) as Array<{
    prompt_result_id: string; judge_model: string; model_name: string; prompt_id: string;
    accuracy: number; helpfulness: number; clarity: number; instruction_following: number;
    strengths: string | null; weaknesses: string | null;
    is_winner: number; winner_reasoning: string | null; judge_score: number;
  }>;
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
