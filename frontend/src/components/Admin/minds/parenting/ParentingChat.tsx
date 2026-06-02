import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ActionButton } from "../../../ui/DesignSystem";
import {
  sendParentingChatStream,
  type ParentingMessage,
} from "../../../../api/minds";


const CHAT_FONT = "'Spectral', Georgia, serif";

interface ParentingChatProps {
  mindId: string;
  sessionId: string;
  messages: ParentingMessage[];
  onNewMessage: (msg: ParentingMessage) => void;
  readOnly: boolean;
  onTriggerReading: () => void;
  sendChatStream?: (mindId: string, sessionId: string, message: string) => Promise<Response>;
}

const THINKING_WORDS = [
  "Thinking",
  "Pondering",
  "Absorbing",
  "Processing",
  "Reflecting",
  "Considering",
];

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
  "prose prose-invert max-w-none overflow-x-auto prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-3 prose-blockquote:my-2 prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/4 prose-code:text-alloro-orange prose-table:w-full prose-th:px-3 prose-th:py-1.5 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-th:border prose-th:border-white/8 prose-th:bg-white/[0.035] prose-td:px-3 prose-td:py-1.5 prose-td:text-xs prose-td:border prose-td:border-white/6";

export function ParentingChat({
  mindId,
  sessionId,
  messages,
  onNewMessage,
  readOnly,
  onTriggerReading,
  sendChatStream,
}: ParentingChatProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const replySoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    replySoundRef.current = new Audio("/blip.mp3");
    replySoundRef.current.preload = "auto";
  }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [animatingMsgId, setAnimatingMsgId] = useState<string | null>(null);
  const followingStream = useRef(true);

  useEffect(() => {
    if (followingStream.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, streamingText]);

  // Scroll to bottom on initial load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 80;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
    if (!atBottom) {
      followingStream.current = false;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    followingStream.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!isLoading && !readOnly) {
      inputRef.current?.focus();
    }
  }, [isLoading, readOnly]);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || isStreaming || readOnly) return;

    const userMessage: ParentingMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    followingStream.current = true;
    setAnimatingMsgId(userMessage.id);
    onNewMessage(userMessage);
    setInput("");
    setIsLoading(true);
    setStreamingText("");

    // Animate textarea back to original height
    if (inputRef.current) {
      const textarea = inputRef.current;
      textarea.style.transition = "height 0.2s ease";
      textarea.style.height = "44px";
      setTimeout(() => { textarea.style.transition = ""; }, 200);
    }

    try {
      const doSend = sendChatStream || sendParentingChatStream;
      const response = await doSend(mindId, sessionId, trimmed);

      if (!response.ok) {
        throw new Error("Stream request failed");
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let hasReceivedText = false;

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
              throw new Error(parsed.error);
            }

            if (parsed.text) {
              if (!hasReceivedText) {
                hasReceivedText = true;
                setIsLoading(false);
                setIsStreaming(true);
              }
              accumulated += parsed.text;
              setStreamingText(accumulated);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      if (accumulated) {
        const assistantMessage: ParentingMessage = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          role: "assistant",
          content: accumulated,
          created_at: new Date().toISOString(),
        };
        onNewMessage(assistantMessage);
        if (localStorage.getItem("minds-sound-enabled") === "true" && replySoundRef.current) {
          replySoundRef.current.currentTime = 0;
          replySoundRef.current.play().catch(() => {});
        }
      }
    } catch {
      const errorMessage: ParentingMessage = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        created_at: new Date().toISOString(),
      };
      onNewMessage(errorMessage);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) handleSubmit();
    }
  };

  const handleTriggerReading = () => {
    onTriggerReading();
  };

  return (
    <div className="flex flex-col h-[600px] rounded-xl overflow-hidden" style={{ backgroundColor: "#262624" }}>
      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto p-4 space-y-4 minds-chat-scrollbar"
      >
        {messages
          .filter((m) => m.role !== "system")
          .map((msg) => {
            const isAnimating = msg.role === "user" && msg.id === animatingMsgId;
            const Wrapper = isAnimating ? motion.div : "div";
            const wrapperProps = isAnimating
              ? {
                  initial: { opacity: 0, y: 20, scale: 0.97 },
                  animate: { opacity: 1, y: 0, scale: 1 },
                  transition: { duration: 0.3, ease: "easeOut" as const },
                  onAnimationComplete: () => setAnimatingMsgId(null),
                }
              : {};

            return (
              <Wrapper
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                {...wrapperProps}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 overflow-hidden ${
                    msg.role === "user"
                      ? "rounded-br-md"
                      : "rounded-bl-md border border-white/4"
                  }`}
                  style={{ fontFamily: CHAT_FONT, fontSize: "18px", lineHeight: 1.5, color: "#c2c0b6", backgroundColor: msg.role === "user" ? "#141413" : "rgba(255,255,255,0.035)" }}
                >
                  {msg.role === "assistant" ? (
                    <div className={PROSE_CLASSES} style={{ fontFamily: CHAT_FONT, fontSize: "18px", color: "#c2c0b6" }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </Wrapper>
            );
          })}

        {isLoading && <ThinkingIndicator />}

        {isStreaming && streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 border border-white/4" style={{ fontFamily: CHAT_FONT, fontSize: "18px", lineHeight: 1.5, color: "#c2c0b6", backgroundColor: "rgba(255,255,255,0.035)" }}>
              <div className={PROSE_CLASSES} style={{ fontFamily: CHAT_FONT, fontSize: "18px", color: "#c2c0b6" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingText}
                </ReactMarkdown>
                <span className="inline-block w-2 h-4 bg-alloro-orange/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to latest */}
      {!isAtBottom && messages.length > 0 && (
        <div className="relative">
          <button
            onClick={scrollToBottom}
            className="absolute -top-12 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-white/[0.06] px-4 py-1.5 text-xs font-medium text-[#eaeaea] shadow-lg hover:bg-white/[0.1] transition-colors backdrop-blur-sm border border-white/6"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Scroll to latest
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-white/4 p-3" style={{ backgroundColor: "#1e1e1c" }}>
        {readOnly ? (
          <div className="text-center py-2">
            <p className="text-xs text-[#6a6a75]">
              This session has ended. Start a new one to teach more.
            </p>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Teach something..."
              rows={1}
              disabled={isLoading || isStreaming}
              className="flex-1 resize-none rounded-xl border border-white/8 px-4 py-2.5 placeholder-[#6a6a75] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50 disabled:opacity-50"
              style={{ fontFamily: CHAT_FONT, fontSize: "17px", lineHeight: 1.5, minHeight: "44px", maxHeight: "140px", backgroundColor: "#1a1a18", color: "#c2c0b6" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
              }}
            />
            <button
              onClick={handleSubmit}
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
            <div style={{ height: "44px", display: "flex", alignItems: "stretch" }}>
              <ActionButton
                label="Ready to Learn"
                icon={<BookOpen className="h-4 w-4" />}
                onClick={handleTriggerReading}
                variant="secondary"
                size="sm"
                disabled={isLoading || isStreaming || messages.length < 2}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
