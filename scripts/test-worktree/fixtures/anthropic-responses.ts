export interface AnthropicFixtureMessage {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<{
    type: "text";
    text: string;
  }>;
  stop_reason: "end_turn";
  stop_sequence: null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export const GBP_POST_FIXTURE_OUTPUT = {
  summary:
    "Clear communication and a thoughtful team experience can make every visit feel more comfortable. One Endodontics is proud to serve the local community with attentive support and straightforward guidance.",
  topicType: "STANDARD",
  callToAction: null,
  imageGuidance: "Use the seeded practice image.",
} as const;

export function createGbpPostAnthropicFixture(): AnthropicFixtureMessage {
  return {
    id: "msg_alloro_worktree_gbp_post_fixture",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5-20251001",
    content: [
      {
        type: "text",
        text: JSON.stringify(GBP_POST_FIXTURE_OUTPUT),
      },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 128,
      output_tokens: 48,
    },
  };
}
