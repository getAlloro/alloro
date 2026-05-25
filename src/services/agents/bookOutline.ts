/**
 * Book Outline Generator Agent
 *
 * Uses the Ghost Writer agent's accumulated material, Knowledge Lattice
 * heuristics, and Corey's frameworks to generate a structured 12-chapter
 * book outline. Stores the result as a dream_team_task for Corey's review.
 */

import { db } from "../../database/connection";
import Anthropic from "@anthropic-ai/sdk";
import { prependSubstrate } from "../prompt/alloroSubstrate";

// -- Types ------------------------------------------------------------------

interface ChapterOutline {
  number: number;
  title: string;
  thesis: string;
  keyStories: string[];
  dataPointsNeeded: string[];
  estimatedWordCount: number;
}

export interface BookOutline {
  bookTitle: string;
  subtitle: string;
  generatedAt: string;
  totalEstimatedWords: number;
  chapters: ChapterOutline[];
}

// -- Constants --------------------------------------------------------------

const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

const CHAPTER_SCAFFOLDING: { number: number; title: string; theme: string }[] = [
  { number: 1, title: "The Second Job", theme: "the problem: you bought freedom and got a second job" },
  { number: 2, title: "What Business Clarity Actually Is", theme: "the category definition: seeing your business the way your customers see it" },
  { number: 3, title: "The Score", theme: "how the Business Clarity Score works and why it matters" },
  { number: 4, title: "The Monday Morning", theme: "the habit loop: one brief, one action, compounding results" },
  { number: 5, title: "Your Competitor Knows Something You Don't", theme: "competitive intelligence that changes decisions" },
  { number: 6, title: "The Referral Network You Can't See", theme: "referral patterns hidden in your data" },
  { number: 7, title: "The $2 Hot Dog", theme: "unreasonable hospitality applied to business intelligence" },
  { number: 8, title: "Three People and an Army", theme: "the AI team model: 3 humans + 47 agents" },
  { number: 9, title: "We All Rise Together", theme: "the Foundation: giving clarity to businesses that cannot afford it" },
  { number: 10, title: "The First Year", theme: "what changes in 365 days of Business Clarity" },
  { number: 11, title: "The Owner's Identity", theme: "the shift from operator to strategist" },
  { number: 12, title: "The Life You Set Out to Build", theme: "the mission: every owner gets the freedom they earned" },
];

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// -- Core -------------------------------------------------------------------

/**
 * Generate a 12-chapter book outline from Ghost Writer extracts
 * and Knowledge Lattice heuristics.
 */
export async function generateBookOutline(): Promise<{
  success: boolean;
  outline: BookOutline;
}> {
  try {
    // 1. Gather Ghost Writer passages
    const passages = await getGhostWriterPassages();

    // 2. Gather Knowledge Lattice heuristics
    const heuristics = await getHeuristics();

    // 3. Generate outline via Claude
    const outline = await synthesizeOutline(passages, heuristics);

    // 4. Store as dream_team_task for Corey's review
    await createReviewTask(outline);

    console.log(
      `[BookOutline] Outline generated: ${outline.chapters.length} chapters, ~${outline.totalEstimatedWords} words.`
    );

    return { success: true, outline };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BookOutline] Failed to generate outline:", message);

    const fallbackOutline: BookOutline = {
      bookTitle: "What Your Business Has Been Trying to Tell You",
      subtitle: "A Business Clarity Manifesto",
      generatedAt: new Date().toISOString(),
      totalEstimatedWords: 0,
      chapters: CHAPTER_SCAFFOLDING.map((ch) => ({
        number: ch.number,
        title: ch.title,
        thesis: ch.theme,
        keyStories: [],
        dataPointsNeeded: [],
        estimatedWordCount: 0,
      })),
    };

    return { success: false, outline: fallbackOutline };
  }
}

// -- Data Gathering ---------------------------------------------------------

async function getGhostWriterPassages(): Promise<
  { summary: string; bookNumber: number; candidateChapter: string; emotionalWeight: number }[]
> {
  const events = await db("behavioral_events")
    .where("event_type", "content.ghost_writer_extract")
    .orderBy("created_at", "desc")
    .limit(50)
    .select("properties")
    .catch(() => [] as { properties: string | Record<string, unknown> }[]);

  const allPassages: {
    summary: string;
    bookNumber: number;
    candidateChapter: string;
    emotionalWeight: number;
  }[] = [];

  for (const evt of events) {
    try {
      const props =
        typeof evt.properties === "string"
          ? JSON.parse(evt.properties)
          : evt.properties;

      if (Array.isArray(props?.passages)) {
        for (const p of props.passages) {
          allPassages.push({
            summary: p.summary || "",
            bookNumber: p.book_number || 1,
            candidateChapter: p.candidate_chapter || "Unassigned",
            emotionalWeight: p.emotional_weight || 3,
          });
        }
      }
    } catch {
      // skip malformed
    }
  }

  return allPassages;
}

async function getHeuristics(): Promise<
  { name: string; description: string; confidence: string }[]
> {
  const rows = await db("heuristics")
    .select("name", "description", "confidence")
    .orderBy("created_at", "desc")
    .limit(27)
    .catch(() => [] as { name: string; description: string; confidence: string }[]);

  return rows;
}

// -- Synthesis --------------------------------------------------------------

async function synthesizeOutline(
  passages: { summary: string; bookNumber: number; candidateChapter: string; emotionalWeight: number }[],
  heuristics: { name: string; description: string; confidence: string }[]
): Promise<BookOutline> {
  const client = getAnthropic();

  const passageSummary =
    passages.length > 0
      ? passages
          .filter((p) => p.emotionalWeight >= 4)
          .map(
            (p) =>
              `[Book ${p.bookNumber}, Ch: ${p.candidateChapter}, Weight: ${p.emotionalWeight}] ${p.summary}`
          )
          .join("\n")
      : "No Ghost Writer passages available yet.";

  const heuristicSummary =
    heuristics.length > 0
      ? heuristics
          .map((h) => `- ${h.name}: ${h.description} (confidence: ${h.confidence})`)
          .join("\n")
      : "No heuristics loaded yet.";

  const scaffolding = CHAPTER_SCAFFOLDING.map(
    (ch) => `Chapter ${ch.number}: "${ch.title}" -- ${ch.theme}`
  ).join("\n");

  const response = await client.messages.create({
    model: LLM_MODEL,
    max_tokens: 6000,
    system: prependSubstrate(`You are the Book Outline Generator for Alloro. You structure Corey's ideas, Ghost Writer extracts, and Knowledge Lattice heuristics into a compelling 12-chapter book outline.

Rules:
- No em-dashes. Use commas or periods instead.
- Each chapter thesis must be exactly one sentence.
- Key stories should reference specific anecdotes from the passages when available, or describe the type of story needed.
- Data points needed should be specific and researchable.
- Estimated word count per chapter should be 4,000-7,000 words (total book: 50,000-70,000).
- The book is for business owners who trained in a craft, bought a business to have freedom, and discovered they bought a second job.
- Tone: authoritative but warm. Think Daniel Pink meets Will Guidara.

Return valid JSON:
{
  "bookTitle": "string",
  "subtitle": "string",
  "chapters": [
    {
      "number": 1,
      "title": "string",
      "thesis": "one sentence",
      "keyStories": ["string"],
      "dataPointsNeeded": ["string"],
      "estimatedWordCount": number
    }
  ]
}`),
    messages: [
      {
        role: "user",
        content: `Generate the book outline.

Chapter structure:
${scaffolding}

High-weight Ghost Writer passages:
${passageSummary}

Knowledge Lattice heuristics:
${heuristicSummary}

All passages count: ${passages.length}
High-weight passages: ${passages.filter((p) => p.emotionalWeight >= 4).length}`,
      },
    ],
  });

  const responseText =
    response.content[0]?.type === "text" ? response.content[0].text : "{}";

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

  const chapters: ChapterOutline[] = Array.isArray(parsed.chapters)
    ? parsed.chapters.map((ch: Record<string, unknown>) => ({
        number: Number(ch.number) || 0,
        title: String(ch.title || ""),
        thesis: String(ch.thesis || ""),
        keyStories: Array.isArray(ch.keyStories)
          ? (ch.keyStories as string[])
          : [],
        dataPointsNeeded: Array.isArray(ch.dataPointsNeeded)
          ? (ch.dataPointsNeeded as string[])
          : [],
        estimatedWordCount: Number(ch.estimatedWordCount) || 5000,
      }))
    : CHAPTER_SCAFFOLDING.map((ch) => ({
        number: ch.number,
        title: ch.title,
        thesis: ch.theme,
        keyStories: [],
        dataPointsNeeded: [],
        estimatedWordCount: 5000,
      }));

  const totalWords = chapters.reduce(
    (sum, ch) => sum + ch.estimatedWordCount,
    0
  );

  return {
    bookTitle:
      parsed.bookTitle || "What Your Business Has Been Trying to Tell You",
    subtitle: parsed.subtitle || "A Business Clarity Manifesto",
    generatedAt: new Date().toISOString(),
    totalEstimatedWords: totalWords,
    chapters,
  };
}

// -- Task Creation ----------------------------------------------------------

async function createReviewTask(outline: BookOutline): Promise<void> {
  const chapterList = outline.chapters
    .map(
      (ch) =>
        `  ${ch.number}. "${ch.title}" (~${ch.estimatedWordCount} words): ${ch.thesis}`
    )
    .join("\n");

  try {
    await db("dream_team_tasks").insert({
      owner_name: "Corey",
      title: `Book Outline: "${outline.bookTitle}" (${outline.chapters.length} chapters, ~${outline.totalEstimatedWords} words)`,
      description: [
        `Book outline generated from ${outline.chapters.length} chapters.`,
        `Subtitle: ${outline.subtitle}`,
        `Total estimated word count: ${outline.totalEstimatedWords.toLocaleString()}`,
        "",
        "Chapters:",
        chapterList,
        "",
        "Review this outline and provide direction on which chapters to prioritize.",
      ].join("\n"),
      status: "open",
      priority: "normal",
      source_type: "book_outline_generator",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BookOutline] Failed to create review task:", message);
  }
}
