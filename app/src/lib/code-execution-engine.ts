/**
 * Code Execution Sandbox Engine
 *
 * Uses Docker to safely execute model-generated code against test cases.
 * Supports Python, JavaScript, Go, and Rust.
 */

import Docker from "dockerode";

// ── Types ──────────────────────────────────────────────────────────────────

export type CodingLanguage = "python" | "javascript" | "go" | "rust";

export interface TestCase {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  description?: string;
}

export interface CodingScenario {
  id: string;
  suiteId: string;
  name: string;
  description: string;
  language: CodingLanguage;
  functionSignature: string;
  testCases: TestCase[];
  setupCode?: string;
  difficulty: "easy" | "medium" | "hard";
  timeLimitMs: number;
  order: number;
}

export interface TestCaseResult {
  testCaseId: string;
  passed: boolean;
  actualOutput: string;
  expectedOutput: string;
  error?: string;
  executionTimeMs: number;
}

export interface CodingResult {
  scenarioId: string;
  modelName: string;
  extractedCode: string;
  testResults: TestCaseResult[];
  score: number;          // 0-100: (passed/total) * 100
  totalExecutionMs: number;
  containerError?: string;
}

// ── Language Configs ───────────────────────────────────────────────────────

const LANGUAGE_CONFIGS: Record<CodingLanguage, {
  image: string;
  extension: string;
  runCommand: (filename: string) => string[];
}> = {
  python: {
    image: "python:3.11-slim",
    extension: ".py",
    runCommand: (f) => ["python", f],
  },
  javascript: {
    image: "node:20-slim",
    extension: ".js",
    runCommand: (f) => ["node", f],
  },
  go: {
    image: "golang:1.21-slim",
    extension: ".go",
    runCommand: (f) => ["go", "run", f],
  },
  rust: {
    image: "rust:1.74-slim",
    extension: ".rs",
    runCommand: () => ["sh", "-c", "rustc /tmp/code/solution.rs -o /tmp/code/solution && /tmp/code/solution"],
  },
};

// ── Runner Templates ───────────────────────────────────────────────────────

/**
 * Extract the function name from a signature like "def solve(x: int)" or "function reverseString(s) { }"
 */
export function extractFnName(signature: string): string {
  const pyMatch = signature.match(/def\s+(\w+)\s*\(/);
  if (pyMatch) return pyMatch[1];
  const jsMatch = signature.match(/function\s+(\w+)\s*\(/);
  if (jsMatch) return jsMatch[1];
  return "solve";
}

/**
 * Count the number of parameters in a function signature.
 * "def solve(s1: str, s2: str)" → 2
 * "function solve(board)" → 1
 */
function countParams(signature: string): number {
  const match = signature.match(/\(([^)]*)\)/);
  if (!match || !match[1].trim()) return 1;
  return match[1].split(",").length;
}

function buildRunnerScript(
  language: CodingLanguage,
  modelCode: string,
  testInput: string,
  setupCode?: string,
  entryFnName: string = "solve",
  paramCount: number = 1
): string {
  // If multi-param, the test input is a JSON array that should be spread
  // If single-param, pass as-is
  switch (language) {
    case "python":
      return `import json, sys
${setupCode || ""}
${modelCode}

if __name__ == "__main__":
    _input = json.loads('''${testInput}''')
${paramCount > 1
  ? `    result = ${entryFnName}(*_input) if isinstance(_input, list) else ${entryFnName}(_input)`
  : `    result = ${entryFnName}(_input)`}
    print(json.dumps(result))
`;

    case "javascript":
      return `${setupCode || ""}
${modelCode}

const _input = JSON.parse(\`${testInput}\`);
${paramCount > 1
  ? `const _result = Array.isArray(_input) ? ${entryFnName}(..._input) : ${entryFnName}(_input);`
  : `const _result = ${entryFnName}(_input);`}
console.log(JSON.stringify(_result));
`;

    case "go":
      return `package main

import (
\t"encoding/json"
\t"fmt"
\t"os"
)

${setupCode || ""}
${modelCode}

func main() {
\tvar input interface{}
\tjson.Unmarshal([]byte(\`${testInput}\`), &input)
\tresult := ${entryFnName}(input)
\toutput, _ := json.Marshal(result)
\tfmt.Println(string(output))
\t_ = os.Stdout.Sync()
}
`;

    case "rust":
      return `use std::io;
${setupCode || ""}
${modelCode}

fn main() {
    let input: serde_json::Value = serde_json::from_str(r#"${testInput}"#).unwrap();
    let result = ${entryFnName}(input);
    println!("{}", serde_json::to_string(&result).unwrap());
}
`;
  }
}

// ── Code Extraction ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function extractCode(response: string, language: CodingLanguage): string {
  // Strip <think>...</think> blocks so reasoning model chain-of-thought
  // doesn't interfere with code fence matching.
  const cleaned = response
    .replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, "")
    .trim();

  // Find ALL code blocks and pick the longest one (most likely the full solution).
  // Models often include a short usage example after the main block — we want the big one.
  const fencePattern = /```(?:\w*)\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  let m;
  while ((m = fencePattern.exec(cleaned)) !== null) {
    if (m[1]?.trim()) blocks.push(m[1].trim());
  }

  if (blocks.length > 0) {
    // Return the longest block (the full solution, not a usage example)
    return blocks.reduce((a, b) => a.length >= b.length ? a : b);
  }

  // No complete code blocks — model may have truncated mid-block (no closing ```).
  // Extract everything after the opening fence to the end
  const fenceMatch = cleaned.match(/```\w*\n([\s\S]+)$/i);
  if (fenceMatch?.[1]?.trim()) {
    return fenceMatch[1].replace(/```\s*$/, "").trim();
  }

  // Last resort: strip any orphaned fence markers
  return cleaned.replace(/```\w*\n?/g, "").trim();
}

/**
 * Remove console.log / print statements and example usage from model code.
 * Models often add "// Example usage:" or "console.log(solve(...))" at the end
 * which pollutes stdout when the runner executes.
 */
function sanitizeCode(code: string, language: CodingLanguage): string {
  const lines = code.split("\n");
  const cleaned: string[] = [];
  let inExampleBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Check if this line is at the top level (no indentation)
    const isTopLevel = line === trimmed || /^\S/.test(line);

    // Detect example/usage sections ONLY at top level (not indented comments inside functions)
    if (isTopLevel && (
        /^\/\/\s*(example|usage|test|demo)\s*(usage|code|cases)?/i.test(trimmed) ||
        /^#\s*(example|usage|test|demo)\s*(usage|code|cases)?/i.test(trimmed))) {
      inExampleBlock = true;
      continue;
    }

    // If we're in an example block and hit a top-level function def, we left the example
    if (inExampleBlock && isTopLevel && (/^function\s/.test(trimmed) || /^def\s/.test(trimmed) || /^class\s/.test(trimmed))) {
      inExampleBlock = false;
    }

    if (inExampleBlock) continue;

    // Strip standalone top-level console.log / print lines (not inside functions)
    if (isTopLevel && language === "javascript" && /^console\.log\s*\(/.test(trimmed)) continue;
    if (isTopLevel && language === "python" && /^print\s*\(/.test(trimmed)) continue;

    // Strip export statements
    if (isTopLevel && /^export\s+(default\s+)?/.test(trimmed)) continue;
    if (isTopLevel && /^module\.exports\s*=/.test(trimmed)) continue;

    cleaned.push(line);
  }

  return cleaned.join("\n").trim();
}

// ── Docker Execution ───────────────────────────────────────────────────────

async function runInDocker(
  docker: Docker,
  language: CodingLanguage,
  script: string,
  timeLimitMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  const config = LANGUAGE_CONFIGS[language];

  const startTime = Date.now();

  let container: Docker.Container | null = null;
  try {
    // Auto-pull the image on first use (subsequent calls are instant).
    await ensureImage(language);

    container = await docker.createContainer({
      Image: config.image,
      Cmd: ["sh", "-c", `cat > /tmp/code/solution${config.extension} << 'MODELSWEEP_EOF'\n${script}\nMODELSWEEP_EOF\n${config.runCommand(`/tmp/code/solution${config.extension}`).join(" ")}`],
      WorkingDir: "/tmp/code",
      HostConfig: {
        Memory: 512 * 1024 * 1024,   // 512MB
        NanoCpus: 1e9,               // 1 CPU
        NetworkMode: "none",          // No network
        ReadonlyRootfs: false,        // Need to write temp files
      },
      Tty: false,
    });

    await container.start();

    // Wait with timeout
    const waitPromise = container.wait();
    const timeoutPromise = new Promise<{ StatusCode: number }>((_, reject) =>
      setTimeout(() => reject(new Error("Execution timed out")), timeLimitMs)
    );

    let exitCode: number;
    try {
      const result = await Promise.race([waitPromise, timeoutPromise]);
      exitCode = result.StatusCode;
    } catch {
      // Timeout — kill the container
      try { await container.kill(); } catch { /* ignore */ }
      return {
        stdout: "",
        stderr: `Execution timed out after ${timeLimitMs}ms`,
        exitCode: 124,
        durationMs: Date.now() - startTime,
      };
    }

    // Get logs — Docker multiplexes stdout/stderr with 8-byte headers per frame.
    // Format: [stream_type(1) | 0x00(3) | payload_length_BE(4)] [payload]
    const logs = await container.logs({ stdout: true, stderr: true });
    const buf = Buffer.isBuffer(logs) ? logs : Buffer.from(logs as unknown as ArrayBuffer);

    let stdout = "";
    let stderr = "";
    let offset = 0;
    while (offset + 8 <= buf.length) {
      const streamType = buf[offset]; // 1 = stdout, 2 = stderr
      const payloadLen = buf.readUInt32BE(offset + 4);
      offset += 8;
      const payload = buf.slice(offset, offset + payloadLen).toString("utf-8");
      if (streamType === 1) stdout += payload;
      else if (streamType === 2) stderr += payload;
      offset += payloadLen;
    }

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode,
      durationMs: Date.now() - startTime,
    };
  } finally {
    if (container) {
      try { await container.remove({ force: true }); } catch { /* ignore */ }
    }
  }
}

// ── Run Coding Scenario ────────────────────────────────────────────────────

export async function runCodingScenario(
  modelResponse: string,
  scenario: CodingScenario,
  dockerSocket?: string
): Promise<CodingResult> {
  const docker = new Docker(dockerSocket ? { socketPath: dockerSocket } : undefined);
  const rawCode = extractCode(modelResponse, scenario.language);
  const extractedCode = sanitizeCode(rawCode, scenario.language);
  const entryFnName = extractFnName(scenario.functionSignature);
  const paramCount = countParams(scenario.functionSignature);
  const testResults: TestCaseResult[] = [];
  let totalExecMs = 0;

  for (const testCase of scenario.testCases) {
    const inputJson = JSON.stringify(testCase.input);
    const script = buildRunnerScript(
      scenario.language,
      extractedCode,
      inputJson,
      scenario.setupCode,
      entryFnName,
      paramCount
    );

    try {
      const result = await runInDocker(docker, scenario.language, script, scenario.timeLimitMs);
      totalExecMs += result.durationMs;

      const actualOutput = result.stdout.trim();
      const expectedStr = JSON.stringify(testCase.expectedOutput);

      // Compare outputs (normalize JSON)
      let passed = false;
      try {
        const actual = JSON.parse(actualOutput);
        const expected = testCase.expectedOutput;
        passed = JSON.stringify(actual) === JSON.stringify(expected);
      } catch {
        passed = actualOutput === expectedStr;
      }

      testResults.push({
        testCaseId: testCase.id,
        passed,
        actualOutput,
        expectedOutput: expectedStr,
        error: result.exitCode !== 0 ? result.stderr : undefined,
        executionTimeMs: result.durationMs,
      });
    } catch (err) {
      testResults.push({
        testCaseId: testCase.id,
        passed: false,
        actualOutput: "",
        expectedOutput: JSON.stringify(testCase.expectedOutput),
        error: String(err),
        executionTimeMs: 0,
      });
    }
  }

  const passed = testResults.filter(r => r.passed).length;
  const total = testResults.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  return {
    scenarioId: scenario.id,
    modelName: "",  // Set by caller
    extractedCode,
    testResults,
    score,
    totalExecutionMs: totalExecMs,
  };
}

// ── Check Docker Availability ──────────────────────────────────────────────

export async function checkDockerAvailable(): Promise<boolean> {
  try {
    const docker = new Docker();
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

/** Try to start Docker Desktop (macOS/Linux) */
export async function startDocker(): Promise<{ started: boolean; message: string }> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  // Check if already running
  if (await checkDockerAvailable()) {
    return { started: true, message: "Docker is already running" };
  }

  try {
    // macOS: open Docker Desktop
    await execAsync("open -a Docker");

    // Wait up to 30 seconds for Docker to start
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await checkDockerAvailable()) {
        return { started: true, message: "Docker started successfully" };
      }
    }
    return { started: false, message: "Docker Desktop launched but daemon not ready after 30s. Try again in a moment." };
  } catch {
    try {
      // Linux: try systemctl
      await execAsync("systemctl start docker");
      await new Promise(r => setTimeout(r, 3000));
      if (await checkDockerAvailable()) {
        return { started: true, message: "Docker daemon started" };
      }
    } catch { /* ignore */ }
    return { started: false, message: "Could not start Docker. Please start Docker Desktop manually." };
  }
}

export async function ensureImage(language: CodingLanguage): Promise<void> {
  const docker = new Docker();
  const image = LANGUAGE_CONFIGS[language].image;

  try {
    await docker.getImage(image).inspect();
  } catch {
    // Pull the image
    await new Promise<void>((resolve, reject) => {
      docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }
}
