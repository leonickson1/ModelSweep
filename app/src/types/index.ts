// ─── Model Types ────────────────────────────────────────────────────────────

export type ModelFamily =
  | "llama"
  | "qwen"
  | "mistral"
  | "deepseek"
  | "gemma"
  | "phi"
  | "other";

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaRunningModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
  expires_at: string;
  size_vram: number;
}

export interface OllamaModelDetails {
  modelfile: string;
  parameters: string;
  template: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
  model_info: Record<string, unknown>;
}

// ─── Suite Types ────────────────────────────────────────────────────────────

export type SuiteType = "standard" | "tool_calling" | "conversation" | "adversarial";

// ─── Test Suite Types ───────────────────────────────────────────────────────

export type PromptCategory =
  | "coding"
  | "creative"
  | "reasoning"
  | "instruction"
  | "custom"
  // Agentic categories
  | "tool_selection"
  | "tool_params"
  | "tool_restraint"
  | "multi_tool"
  | "context_memory"
  | "persona_stability"
  | "robustness"
  | "error_recovery";

export type PromptDifficulty = "easy" | "medium" | "hard";

export type ExpectedBehavior =
  | "format_compliance"
  | "correctness"
  | "no_hallucination"
  | "code_runs"
  | "general";

export interface PromptVariable {
  [key: string]: string;
}

export interface Prompt {
  id: string;
  suiteId: string;
  text: string;
  category: PromptCategory;
  difficulty: PromptDifficulty;
  expectedBehavior: ExpectedBehavior;
  rubric: string;
  variables: PromptVariable;
  maxTokens: number;
  order: number;
  createdAt: string;
}

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  suiteType: SuiteType;
  prompts: Prompt[];
  createdAt: string;
  lastRunAt: string | null;
  isBuiltIn: boolean;
}

// ─── Tool Calling Types ─────────────────────────────────────────────────────

export interface ToolParameter {
  name: string;
  type: "string" | "integer" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  enum?: string[];
  /** Nested object properties (for type === "object") */
  properties?: ToolParameter[];
  /** Array item type definition (for type === "array") */
  items?: { type: string; properties?: ToolParameter[] };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

/** Mock return value for simulating tool responses */
export interface MockReturn {
  when?: Record<string, string>; // condition params, e.g. { city: "Tokyo" }
  returns: unknown; // JSON value the tool "sends back"
  error?: string; // simulate an error instead
}

/** Stored tool definition in DB */
export interface StoredToolDefinition {
  id: string;
  suiteId: string;
  name: string;
  description: string;
  parameters: ToolParameter[];
  mockReturns?: MockReturn[];
  order: number;
}

export type ParamMatchType = "exact" | "contains" | "any_value" | "type_check";

export interface ExpectedParam {
  matchType: ParamMatchType;
  value?: string;
  expectedType?: string;
  required?: boolean;
}

export interface ExpectedToolCall {
  toolName: string;
  expectedParams?: Record<string, ExpectedParam>;
}

export type ToolScenarioCategory =
  | "tool_selection"
  | "param_accuracy"
  | "restraint"
  | "multi_tool"
  | "error_recovery"
  | "hallucination"
  | "param_format"
  | "dependency_chain";

// ─── Dependency Chain Types ──────────────────────────────────────────────────

export interface ParamDependency {
  fromStep: number; // 0-indexed step number
  jsonPath: string; // path into that step's mock return, e.g. "results[0].id"
}

export interface ChainStep {
  expectedTool: string;
  expectedParams: Record<string, ExpectedParam>;
  mockReturn: unknown; // what this step returns
  paramDependencies?: Record<string, ParamDependency>;
}

export interface DependencyChain {
  steps: ChainStep[];
}

// ─────────────────────────────────────────────────────────────────────────────

export interface ToolScenario {
  id: string;
  suiteId: string;
  name: string;
  userMessage: string;
  systemPrompt?: string;
  shouldCallTool: boolean;
  expectedToolCalls: ExpectedToolCall[];
  category: ToolScenarioCategory;
  difficulty: PromptDifficulty;
  simulatedError?: string; // For error_recovery scenarios
  dependencyChain?: DependencyChain; // For dependency_chain scenarios
  order: number;
}

export interface ActualToolCall {
  functionName: string;
  arguments: Record<string, unknown>;
  rawArguments?: unknown;
  jsonMalformed?: boolean;
}

export interface ToolCallScore {
  toolSelection: number;    // 0-5
  paramAccuracy: number;    // 0-5
  toolRestraint: number;    // 0-5
  sequenceOrder: number;    // 0-5
  errorHandling: number;    // 0-5
  hallucinatedTool: boolean;
  calledWhenShouldNot: boolean;
  missingRequiredParam: boolean;
  jsonMalformed: boolean;
  jsonUnrecoverable: boolean;
  selectionLatencyMs: number;
}

export interface ToolCallResult {
  scenarioId: string;
  modelName: string;
  score: ToolCallScore;
  actualToolCalls: ActualToolCall[];
  textResponse: string;
  overallScore: number; // 0-100 computed from dimensions
}

// ─── Test Run Types ─────────────────────────────────────────────────────────

export interface AutoScores {
  formatCompliance: boolean;
  lengthCompliance: boolean;
  codeValidity: boolean | null;
  refusalDetected: boolean;
  repetitionScore: number;
  languageMatch: boolean;
}

export interface JudgeScores {
  accuracy: number;
  helpfulness: number;
  completeness: number;
  adherence: number;
}

export interface PromptResult {
  id: string;
  runId: string;
  modelName: string;
  promptId: string;
  response: string;
  tokensPerSec: number;
  ttft: number;
  totalTokens: number;
  duration: number;
  autoScores: AutoScores;
  judgeScores: JudgeScores | null;
  manualVote: "better" | "worse" | null;
  timedOut: boolean;
  error: string | null;
}

export interface CategoryScores {
  coding: number;
  creative: number;
  reasoning: number;
  instruction: number;
  speed: number;
}

export interface ModelResult {
  name: string;
  family: ModelFamily;
  parameterSize: string;
  quantization: string;
  overallScore: number;
  categoryScores: CategoryScores;
  avgTokensPerSec: number;
  avgTTFT: number;
  totalDuration: number;
  promptResults: PromptResult[];
  skipped: boolean;
  skipReason: string | null;
}

export interface HardwareInfo {
  class: string;
  gpu: string;
  ram: string;
}

export type RunStatus = "pending" | "running" | "completed" | "failed" | "paused";

export interface TestRun {
  id: string;
  suiteId: string;
  suiteName: string;
  startedAt: string;
  completedAt: string | null;
  status: RunStatus;
  models: ModelResult[];
  hardware: HardwareInfo;
  judgeModel: string | null;
  judgeEnabled: boolean;
  temperature: number;
  topP: number;
  maxTokens: number;
}

// ─── Live Run State ─────────────────────────────────────────────────────────

export type PromptRunStatus = "pending" | "running" | "done" | "error";

export interface LivePromptState {
  promptId: string;
  promptText: string;
  status: PromptRunStatus;
  response: string;
  tokensPerSec: number;
  ttft: number;
  totalTokens: number;
  duration: number;
}

export interface LiveModelState {
  name: string;
  family: ModelFamily;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  prompts: LivePromptState[];
  currentPromptIndex: number;
}

export interface LiveToolScenarioState {
  scenarioId: string;
  scenarioName: string;
  status: PromptRunStatus;
  score: ToolCallScore | null;
  actualToolCalls: ActualToolCall[];
  textResponse: string;
  overallScore: number;
  latencyMs: number;
}

export interface LiveModelToolState {
  name: string;
  family: ModelFamily;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  scenarios: LiveToolScenarioState[];
  currentScenarioIndex: number;
}

export interface LiveRunState {
  runId: string;
  suiteId: string;
  suiteType: SuiteType;
  models: LiveModelState[];
  currentModelIndex: number;
  status: "idle" | "running" | "paused" | "done";
  startedAt: number;
  elapsedSeconds: number;
  // Tool calling specific
  toolModels?: LiveModelToolState[];
  // Conversation specific
  conversationModels?: LiveModelConversationState[];
  // Adversarial specific
  adversarialModels?: LiveModelAdversarialState[];
}

// ─── Preferences ────────────────────────────────────────────────────────────

export interface UserPreferences {
  ollamaUrl: string;
  defaultTemperature: number;
  defaultTopP: number;
  defaultMaxTokens: number;
  judgeModel: string | null;
  communityEnabled: boolean;
  defaultJudgeEnabled: boolean;
  weightAuto: number;
  weightJudge: number;
  weightHuman: number;
}

export type CloudProvider = "openai" | "anthropic" | "google" | "custom";

export interface CloudProviderConfig {
  id: string;
  provider: CloudProvider;
  apiKey: string; // plaintext (never stored, only in transit)
  baseUrl?: string | null;
  modelId?: string | null;
  label?: string | null;
  useForJudging: boolean;
  useForBaseline: boolean;
  spendLimitUsd: number;
  spendUsedUsd: number;
  status: "connected" | "error" | "unchecked" | "not_set";
}

// ─── Scoring Engine v2 Types ────────────────────────────────────────────────

export type GateFlag =
  | "REFUSED"
  | "REPETITION_LOOP"
  | "EMPTY"
  | "GIBBERISH"
  | "TRUNCATED"
  | "CRASH";

/** Per-dimension rubric scores (0–5 each) */
export interface DimensionScores {
  relevance: number;
  depth: number;
  coherence: number;
  compliance: number;
  language: number;
}

/** Hard gate check result */
export interface GateResult {
  pass: boolean;
  flag: GateFlag | null;
}

/** Full rubric scoring result (Layer 1) */
export interface RubricResult {
  score: number;
  dimensions: DimensionScores;
  gate: GateResult;
  warnings: string[];
  breakdown: {
    [dim: string]: { raw: number; weight: number };
  };
  rubricResults?: RubricCheck[];
}

/** Parsed rubric check from prompt rubric field */
export interface RubricCheck {
  type: 'must_contain' | 'must_not_contain' | 'count_items' | 'valid_json' | 'unstructured';
  value: string;
  label: string;
  passed?: boolean;
}

/** Structured judge evaluation per response (Layer 2) */
export interface StructuredJudgeEvaluation {
  accuracy: number;              // 1–5
  helpfulness: number;           // 1–5
  clarity: number;               // 1–5
  instructionFollowing: number;  // 1–5
  strengths: string;
  weaknesses: string;
  judgeScore: number;            // 0–100 normalized
}

/** Elo rating for a model */
export interface EloRating {
  modelName: string;
  rating: number;
  matchCount: number;
  confidence: number;  // 0–1
  lastUpdated: string;
}

/** Elo match record */
export interface EloMatch {
  id: string;
  runId: string;
  promptId: string;
  winner: string;
  loser: string;
  isTie: boolean;
  winnerJudgeScore: number | null;
  loserJudgeScore: number | null;
  createdAt: string;
}

/** Category score with null for untested categories */
export interface CategoryScoreV2 {
  category: string;
  score: number | null;     // null = not tested
  promptCount: number;
  confidence: "high" | "medium" | "low" | "none";
}

/** Composite score breakdown */
export interface CompositeBreakdown {
  auto: number;
  judge: number | null;
  human: string | null;
  flag: GateFlag | null;
  layers: string[];
}

// ─── Conversation Types ─────────────────────────────────────────────────────

export interface StoredConversationScenario {
  id: string;
  suiteId: string;
  name: string;
  systemPrompt: string;
  userPersona: string;
  turnCount: number;
  turnInstructions?: Record<number, string>;
  evaluationCriteria: string[];
  difficulty: PromptDifficulty;
  temperature?: number;
  maxTokensPerTurn?: number;
  simulatorModel: string;
  simulatorMode: "cloud" | "local" | "scripted";
  scriptedMessages?: string[];
  order: number;
}

export interface LiveConversationTurnState {
  role: "user" | "assistant";
  content: string;
  turnNumber: number;
  tokensPerSec?: number;
  ttft?: number;
  quality?: number;
}

export interface LiveConversationScenarioState {
  scenarioId: string;
  scenarioName: string;
  status: PromptRunStatus;
  turns: LiveConversationTurnState[];
  overallScore: number;
  contextUsage: number;
  contextExhausted: boolean;
}

export interface LiveModelConversationState {
  name: string;
  family: ModelFamily;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  scenarios: LiveConversationScenarioState[];
  currentScenarioIndex: number;
}

// ─── Adversarial Types ──────────────────────────────────────────────────────

export type AttackStrategy =
  | "prompt_extraction"
  | "jailbreak"
  | "persona_break"
  | "data_exfiltration"
  | "custom";

export type BreachSeverity = "low" | "medium" | "critical";

export interface FailureCondition {
  type: "contains_verbatim" | "contains_secret" | "regex_match" | "character_break";
  secretValue?: string;
  pattern?: string;
  label?: string;
  severity?: BreachSeverity;
}

export interface StoredAdversarialScenario {
  id: string;
  suiteId: string;
  name: string;
  systemPrompt: string;
  attackStrategy: AttackStrategy;
  customAttackPersona?: string;
  maxTurns: number;
  attackIntensity: number; // 1-5
  failureConditions: FailureCondition[];
  difficulty: PromptDifficulty;
  attackerModel: string;
  attackerMode: "cloud" | "local" | "scripted";
  order: number;
}

export interface Breach {
  type: "prompt_leak" | "data_leak" | "policy_violation";
  severity: BreachSeverity;
  evidence: string;
  description: string;
  turn: number;
  attackMessage?: string;
  modelResponse?: string;
}

export interface AdversarialScore {
  robustness: number;          // 0-100
  turnsToFirstBreach: number | null;
  breachCount: number;
  breachSeverity: "none" | "low" | "medium" | "critical";
  defenseQuality: number;     // 0-5
  helpfulnessUnderPressure: number; // 0-5
  consistencyUnderPressure: number; // 0-5
}

export interface LiveAdversarialTurnState {
  role: "attacker" | "defender";
  content: string;
  turnNumber: number;
  breachDetected: boolean;
  breachType?: string;
  fallbackUsed?: boolean;
}

export interface LiveAdversarialScenarioState {
  scenarioId: string;
  scenarioName: string;
  status: PromptRunStatus;
  turns: LiveAdversarialTurnState[];
  breaches: Breach[];
  robustnessScore: number;
  survived: boolean;
}

export interface LiveModelAdversarialState {
  name: string;
  family: ModelFamily;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  scenarios: LiveAdversarialScenarioState[];
  currentScenarioIndex: number;
}

// ─── Community ──────────────────────────────────────────────────────────────

export interface CommunityScore {
  modelName: string;
  modelFamily: ModelFamily;
  overallScore: number;
  categoryScores: CategoryScores;
  avgTokensPerSec: number;
  hardwareClass: string;
  suiteCategory: string;
  promptCount: number;
  submittedAt: string;
}
