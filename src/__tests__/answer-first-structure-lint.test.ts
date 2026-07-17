import { describe, expect, it } from "vitest";
import { lintAnswerFirstStructure } from "../services/ai-seo-audit/answerFirstStructureLint";

const LONG_ANSWER =
  "Bright Smiles Dental is a family dental practice in Austin, Texas, offering routine cleanings, fillings, crowns, implants, and teeth whitening, with same week appointments available for new patients who need urgent care.";
const QUESTION_HEADING = "<h1>Is Bright Smiles Dental accepting new patients?</h1>";

describe("answer-first structure lint — collapsed content belongs to the candidate answer", () => {
  it("does not flag normal collapsed navigation when the candidate answer is visible", () => {
    const result = lintAnswerFirstStructure(`<html><body>
      <nav>
        <button aria-expanded="false">Menu</button>
        <div class="collapse"><a href="/services">Services</a></div>
      </nav>
      ${QUESTION_HEADING}
      <p>${LONG_ANSWER}</p>
    </body></html>`);

    expect(result.flags).not.toContain("answer_behind_accordion");
    expect(result.details.isAnswerInsideCollapsedContent).toBe(false);
  });

  it("does not flag an unrelated collapsed section after a visible candidate answer", () => {
    const result = lintAnswerFirstStructure(`<html><body>
      ${QUESTION_HEADING}
      <p>${LONG_ANSWER}</p>
      <details><summary>Insurance details</summary><p>Call us to confirm your plan.</p></details>
    </body></html>`);

    expect(result.flags).not.toContain("answer_behind_accordion");
  });

  it("flags the candidate answer when it is inside collapsed details", () => {
    const result = lintAnswerFirstStructure(`<html><body>
      ${QUESTION_HEADING}
      <details>
        <summary>Read the answer</summary>
        <p>${LONG_ANSWER}</p>
      </details>
    </body></html>`);

    expect(result.flags).toContain("answer_behind_accordion");
    expect(result.details.isAnswerInsideCollapsedContent).toBe(true);
  });

  it("flags a Bootstrap-collapsed candidate but not the same visible accordion panel", () => {
    const collapsed = lintAnswerFirstStructure(`<html><body>
      ${QUESTION_HEADING}
      <div class="accordion">
        <div class="accordion-collapse collapse"><p>${LONG_ANSWER}</p></div>
      </div>
    </body></html>`);
    const visible = lintAnswerFirstStructure(`<html><body>
      ${QUESTION_HEADING}
      <div class="accordion">
        <div class="accordion-collapse collapse show"><p>${LONG_ANSWER}</p></div>
      </div>
    </body></html>`);

    expect(collapsed.flags).toContain("answer_behind_accordion");
    expect(visible.flags).not.toContain("answer_behind_accordion");
  });
});
