import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Loader2,
  Send,
  Check,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ActionButton } from "../../ui/DesignSystem";
import {
  sendSkillBuilderChatStream,
  createSkill,
  updateSkill,
  listPublishChannels,
  type SkillBuilderMessage,
  type ResolvedFields,
  type WorkCreationType,
  type TriggerType,
  type PipelineMode,
} from "../../../api/minds";

const CHAT_FONT = "'Spectral', Georgia, serif";

const THINKING_WORDS = [
  "Thinking",
  "Pondering",
  "Analyzing",
  "Reflecting",
  "Processing",
  "Contemplating",
];

interface SkillBuilderChatProps {
  mindId: string;
  mindName: string;
  onClose: () => void;
  onSkillCreated: (skillId: string) => void;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  definition: "Definition",
  work_creation_type: "Output Type",
  work_publish_to: "Publish To",
  trigger_type: "Trigger",
  trigger_config: "Schedule",
  pipeline_mode: "Pipeline",
  output_count: "Output Count",
};

const TOTAL_FIELDS = 8;

function ThinkingIndicator() {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((i) => (i + 1) % THINKING_WORDS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex justify-start">
      <div className="bg-white/[0.06] rounded-2xl rounded-bl-md px-5 py-3.5 border border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-alloro-orange minds-thinking-dot" />
            <span className="h-1.5 w-1.5 rounded-full bg-alloro-orange minds-thinking-dot" />
            <span className="h-1.5 w-1.5 rounded-full bg-alloro-orange minds-thinking-dot" />
          </div>
          <AnimatePresence mode="wait">
            <motion.span
              key={wordIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
              className="text-xs text-[#a0a0a8] italic tracking-wide"
            >
              {THINKING_WORDS[wordIndex]}...
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

const PROSE_CLASSES =
  "prose prose-invert max-w-none overflow-x-auto prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-3 prose-blockquote:my-2 prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/4 prose-code:text-alloro-orange";

export function SkillBuilderChat({
  mindId,
  mindName,
  onClose,
  onSkillCreated,
}: SkillBuilderChatProps) {
  const [messages, setMessages] = useState<SkillBuilderMessage[]>([
    { role: "assistant", content: `What's on the menu today? Tell me what skill I should pick up and I'll start figuring out the details.` },
  ]);
  const [resolvedFields, setResolvedFields] = useState<ResolvedFields>({});
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [saving, setSaving] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const replySoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    replySoundRef.current = new Audio("/blip.mp3");
    replySoundRef.current.preload = "auto";
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isLoading || isStreaming) return;

    setInput("");
    setIsLoading(true);
    setStreamingText("");

    const displayMessages: SkillBuilderMessage[] = [...messages, { role: "user", content: msg }];
    setMessages(displayMessages);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const response = await sendSkillBuilderChatStream(mindId, msg, displayMessages, resolvedFields);

      if (!response.ok) {
        toast.error("Failed to get response");
        setIsLoading(false);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);

            if (parsed.error) {
              toast.error(parsed.error);
              setIsLoading(false);
              setIsStreaming(false);
              return;
            }

            if (parsed.text) {
              if (!isStreaming) {
                setIsLoading(false);
                setIsStreaming(true);
              }
              fullReply += parsed.text;
              setStreamingText(fullReply);
            }

            if (parsed.done) {
              setResolvedFields(parsed.resolvedFields);
              setIsComplete(!!parsed.isComplete);
              setMessages([
                ...displayMessages,
                { role: "assistant", content: fullReply },
              ]);
              setStreamingText("");
              setIsStreaming(false);
              if (localStorage.getItem("minds-sound-enabled") === "true" && replySoundRef.current) {
                replySoundRef.current.currentTime = 0;
                replySoundRef.current.play().catch(() => {});
              }
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } catch {
      toast.error("Failed to get response");
    }

    setIsLoading(false);
    setIsStreaming(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreateSkill = async () => {
    if (!resolvedFields.name) {
      toast.error("Skill name is required");
      return;
    }
    setSaving(true);

    const skill = await createSkill(
      mindId,
      resolvedFields.name,
      resolvedFields.definition || "",
      null,
    );

    if (!skill) {
      toast.error("Failed to create skill");
      setSaving(false);
      return;
    }

    // Resolve publish channel name → UUID (LLM resolves name, DB expects UUID)
    let publishChannelId: string | null = null;
    const publishTo = resolvedFields.work_publish_to;
    if (publishTo && publishTo !== "internal_only") {
      const channels = await listPublishChannels();
      const match = channels.find(
        (ch) => ch.name.toLowerCase() === publishTo.toLowerCase() || ch.id === publishTo,
      );
      publishChannelId = match?.id || null;
    }

    await updateSkill(mindId, skill.id, {
      work_creation_type: (resolvedFields.work_creation_type as WorkCreationType | undefined) || null,
      artifact_attachment_type: (resolvedFields.artifact_attachment_type as WorkCreationType | undefined) || null,
      output_count: resolvedFields.output_count || 1,
      trigger_type: (resolvedFields.trigger_type as TriggerType | undefined) || "manual",
      trigger_config: resolvedFields.trigger_config || {},
      pipeline_mode: (resolvedFields.pipeline_mode as PipelineMode | undefined) || "review_and_stop",
      publish_channel_id: publishChannelId,
    });

    toast.success(`Skill "${resolvedFields.name}" created`);
    setSaving(false);
    onSkillCreated(skill.id);
  };

  const resolvedCount = Object.entries(resolvedFields).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  ).length;
  const progress = Math.min((resolvedCount / TOTAL_FIELDS) * 100, 100);

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#262624" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-alloro-orange text-white">
            <Wand2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#eaeaea]">Skill Builder</h3>
            <p className="text-[11px] text-[#6a6a75]">
              Building a skill for {mindName}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-[#6a6a75] hover:text-[#a0a0a8] hover:bg-white/[0.05] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex h-[500px]">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 minds-chat-scrollbar">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 overflow-hidden ${
                    msg.role === "user"
                      ? "rounded-br-md"
                      : "rounded-bl-md border border-white/4"
                  }`}
                  style={{
                    fontFamily: CHAT_FONT,
                    fontSize: "18px",
                    lineHeight: 1.5,
                    color: "#c2c0b6",
                    backgroundColor: msg.role === "user" ? "#141413" : "rgba(255,255,255,0.035)",
                  }}
                >
                  {msg.role === "assistant" ? (
                    <div
                      className={PROSE_CLASSES}
                      style={{ fontFamily: CHAT_FONT, fontSize: "18px", color: "#c2c0b6" }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isLoading && <ThinkingIndicator />}

            {isStreaming && streamingText && (
              <div className="flex justify-start">
                <div
                  className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 border border-white/4"
                  style={{
                    fontFamily: CHAT_FONT,
                    fontSize: "18px",
                    lineHeight: 1.5,
                    color: "#c2c0b6",
                    backgroundColor: "rgba(255,255,255,0.035)",
                  }}
                >
                  <div
                    className={PROSE_CLASSES}
                    style={{ fontFamily: CHAT_FONT, fontSize: "18px", color: "#c2c0b6" }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                    <span className="inline-block w-2 h-4 bg-alloro-orange/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/4 p-3" style={{ backgroundColor: "#1e1e1c" }}>
            {isComplete ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 text-sm text-green-400 font-medium flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  All fields resolved
                </div>
                <ActionButton
                  label="Create Skill"
                  icon={<Wand2 className="h-4 w-4" />}
                  onClick={handleCreateSkill}
                  variant="primary"
                  loading={saving}
                />
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your response..."
                  rows={1}
                  disabled={isLoading || isStreaming}
                  className="flex-1 resize-none rounded-xl border border-white/8 px-4 py-2.5 placeholder-[#6a6a75] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50 disabled:opacity-50"
                  style={{
                    fontFamily: CHAT_FONT,
                    fontSize: "17px",
                    lineHeight: 1.5,
                    minHeight: "44px",
                    maxHeight: "140px",
                    backgroundColor: "#1a1a18",
                    color: "#c2c0b6",
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading || isStreaming}
                  className="flex shrink-0 items-center justify-center rounded-xl bg-alloro-orange text-white transition-all hover:bg-alloro-orange/90 hover:shadow-[0_0_20px_rgba(214,104,83,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ height: "44px", width: "44px" }}
                >
                  {isLoading || isStreaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Resolved fields sidebar */}
        <div className="w-56 border-l border-white/6 p-4 overflow-y-auto" style={{ backgroundColor: "#1e1e1c" }}>
          <h4 className="text-[10px] font-semibold text-[#6a6a75] uppercase tracking-wider mb-3">
            Resolved Fields
          </h4>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-alloro-orange transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-[#6a6a75] mt-1">
              {resolvedCount}/{TOTAL_FIELDS} fields
            </p>
          </div>

          <div className="space-y-2.5">
            {Object.entries(FIELD_LABELS).map(([key, label]) => {
              const value = resolvedFields[key as keyof ResolvedFields];
              const isResolved = value !== undefined && value !== null && value !== "";
              const displayValue =
                typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value || "");

              return (
                <div key={key}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        isResolved ? "bg-green-400" : "bg-white/10"
                      }`}
                    />
                    <span className="text-[10px] font-medium text-[#a0a0a8]">
                      {label}
                    </span>
                  </div>
                  {isResolved && (
                    <p className="text-[10px] text-[#c2c0b6] pl-3.5 truncate">
                      {displayValue}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
