/**
 * RAG Evaluation Engine
 *
 * Handles document parsing, chunking, retrieval, and faithfulness scoring
 * for Retrieval-Augmented Generation evaluation.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface RagDocument {
  id: string;
  suiteId: string;
  filename: string;
  mimeType: string;
  content: string;
}

export interface RagChunk {
  id: string;
  documentId: string;
  text: string;
  source: string;          // e.g. "page 3, paragraph 2"
  tokenCount: number;
  order: number;
}

export interface RagScenario {
  id: string;
  suiteId: string;
  documentId: string;
  question: string;
  groundTruthAnswer: string;
  relevantChunkIds: string[];
  distractorChunkIds: string[];
  answerNotInDocument: boolean;
  difficulty: "easy" | "medium" | "hard";
  order: number;
}

export interface RagResult {
  scenarioId: string;
  modelName: string;
  response: string;
  faithfulness: number;       // 0-100
  abstention: number | null;  // 0 or 100, null if not applicable
  answerCorrectness: number;  // 0-100 (judge-evaluated)
  citationAccuracy: number;   // 0-100 (optional)
  overallScore: number;       // 0-100
  sentenceGrounding: SentenceGrounding[];
  tokensPerSec: number;
  duration: number;
}

export interface SentenceGrounding {
  sentence: string;
  grounded: boolean;
  groundingScore: number;   // 0-1
  matchedChunkId?: string;
}

// ── Document Parsing ───────────────────────────────────────────────────────

export async function parseDocument(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return buffer.toString("utf-8");
  }

  throw new Error(`Unsupported document type: ${mimeType}`);
}

// ── Chunking ───────────────────────────────────────────────────────────────

export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 64
): Array<{ text: string; source: string; tokenCount: number }> {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: Array<{ text: string; source: string; tokenCount: number }> = [];
  let currentChunk = "";
  let currentTokens = 0;
  let paragraphIndex = 0;

  for (const paragraph of paragraphs) {
    paragraphIndex++;
    const paraTokens = estimateTokens(paragraph);

    if (currentTokens + paraTokens > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        source: `paragraph ${paragraphIndex - 1}`,
        tokenCount: currentTokens,
      });

      // Overlap: keep last portion
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 1.3));
      currentChunk = overlapWords.join(" ") + "\n\n" + paragraph;
      currentTokens = estimateTokens(currentChunk);
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      currentTokens += paraTokens;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      source: `paragraph ${paragraphIndex}`,
      tokenCount: currentTokens,
    });
  }

  return chunks;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ── Retrieval (keyword-based TF-IDF approximation) ─────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "because", "but", "and", "or", "if", "while", "that", "this", "it",
  "its", "what", "which", "who", "whom", "these", "those",
]);

function extractKeyTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

export function retrieveChunks(
  query: string,
  chunks: RagChunk[],
  topK = 5
): RagChunk[] {
  const queryTerms = new Set(extractKeyTerms(query));
  if (queryTerms.size === 0) return chunks.slice(0, topK);

  const scored = chunks.map(chunk => {
    const chunkTerms = extractKeyTerms(chunk.text);
    const matchCount = chunkTerms.filter(t => queryTerms.has(t)).length;
    const score = chunkTerms.length > 0 ? matchCount / chunkTerms.length : 0;
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(s => s.chunk);
}

// ── Faithfulness Scoring ───────────────────────────────────────────────────

export function scoreFaithfulness(
  response: string,
  sourceChunks: RagChunk[]
): { score: number; sentenceGrounding: SentenceGrounding[] } {
  const sentences = response
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length === 0) return { score: 0, sentenceGrounding: [] };

  const allChunkText = sourceChunks.map(c => c.text.toLowerCase()).join(" ");
  const sentenceGrounding: SentenceGrounding[] = [];
  let groundedCount = 0;

  for (const sentence of sentences) {
    const keyTerms = extractKeyTerms(sentence);
    if (keyTerms.length === 0) {
      sentenceGrounding.push({ sentence, grounded: true, groundingScore: 1 });
      groundedCount++;
      continue;
    }

    const groundedTerms = keyTerms.filter(t => allChunkText.includes(t));
    const groundingScore = groundedTerms.length / keyTerms.length;
    const grounded = groundingScore > 0.5;

    // Find best matching chunk
    let bestChunkId: string | undefined;
    let bestMatch = 0;
    for (const chunk of sourceChunks) {
      const chunkLower = chunk.text.toLowerCase();
      const matches = keyTerms.filter(t => chunkLower.includes(t)).length;
      if (matches > bestMatch) {
        bestMatch = matches;
        bestChunkId = chunk.id;
      }
    }

    sentenceGrounding.push({
      sentence,
      grounded,
      groundingScore,
      matchedChunkId: grounded ? bestChunkId : undefined,
    });

    if (grounded) groundedCount++;
  }

  const score = Math.round((groundedCount / sentences.length) * 100);
  return { score, sentenceGrounding };
}

// ── Abstention Scoring ─────────────────────────────────────────────────────

const ABSTENTION_PATTERNS = [
  /(?:don't|do not|doesn't|does not) (?:have|contain|mention|include|provide) (?:information|details|data)/i,
  /not (?:mentioned|found|stated|included|present) in/i,
  /(?:cannot|can't) (?:determine|find|answer|confirm)/i,
  /(?:the|this) (?:document|text|passage|context) (?:doesn't|does not|don't)/i,
  /(?:I don't know|not sure|uncertain|no information)/i,
  /(?:based on|according to) the (?:provided|given) (?:context|text|document), (?:there is no|I cannot)/i,
];

export function scoreAbstention(response: string): boolean {
  return ABSTENTION_PATTERNS.some(p => p.test(response));
}

// ── Build RAG Prompt ───────────────────────────────────────────────────────

export function buildRagPrompt(
  question: string,
  chunks: RagChunk[]
): string {
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.text}`)
    .join("\n\n");

  return `Answer the following question using ONLY the provided context. If the answer is not in the context, say "I don't know" or "The document doesn't contain this information."

CONTEXT:
${context}

QUESTION: ${question}

ANSWER:`;
}

// ── Run RAG Scenario ───────────────────────────────────────────────────────

export async function runRagScenario(
  ollamaUrl: string,
  model: string,
  scenario: RagScenario,
  allChunks: RagChunk[]
): Promise<RagResult> {
  // Get relevant + distractor chunks
  const relevantChunks = allChunks.filter(c => scenario.relevantChunkIds.includes(c.id));
  const distractorChunks = allChunks.filter(c => scenario.distractorChunkIds.includes(c.id));

  // Shuffle relevant and distractor chunks together
  const contextChunks = [...relevantChunks, ...distractorChunks]
    .sort(() => Math.random() - 0.5);

  const prompt = buildRagPrompt(scenario.question, contextChunks);

  // Call model
  const startTime = performance.now();
  let responseText = "";
  let totalTokens = 0;

  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { temperature: 0.3, num_predict: 1024 },
    }),
  });

  const data = await res.json();
  responseText = (data.message?.content ?? "").trim();
  totalTokens = data.eval_count ?? responseText.split(/\s+/).length;
  const duration = (performance.now() - startTime) / 1000;
  const tokensPerSec = duration > 0 ? totalTokens / duration : 0;

  // Score
  const { score: faithfulness, sentenceGrounding } = scoreFaithfulness(responseText, contextChunks);

  let abstention: number | null = null;
  if (scenario.answerNotInDocument) {
    abstention = scoreAbstention(responseText) ? 100 : 0;
  }

  // Answer correctness: simplified keyword overlap with ground truth
  let answerCorrectness = 0;
  if (scenario.groundTruthAnswer) {
    const truthTerms = new Set(extractKeyTerms(scenario.groundTruthAnswer));
    const responseTerms = extractKeyTerms(responseText);
    const matched = responseTerms.filter(t => truthTerms.has(t)).length;
    answerCorrectness = truthTerms.size > 0
      ? Math.round((matched / truthTerms.size) * 100)
      : 50;
  }

  // Overall score
  const scores = [faithfulness, answerCorrectness];
  if (abstention !== null) scores.push(abstention);
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  return {
    scenarioId: scenario.id,
    modelName: model,
    response: responseText,
    faithfulness,
    abstention,
    answerCorrectness,
    citationAccuracy: 0,  // TODO: implement citation checking
    overallScore,
    sentenceGrounding,
    tokensPerSec,
    duration,
  };
}
