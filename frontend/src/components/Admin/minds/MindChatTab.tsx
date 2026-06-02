import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Layers,
  Download,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useConfirm } from "../../ui/ConfirmModal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  sendChatMessageStream,
  getConversation,
  listConversations,
  deleteConversation,
  renameConversation,
  type MindMessage,
  type MindConversation,
  type CompactionMessage,
} from "../../../api/minds";

interface MindChatTabProps {
  mindId: string;
  mindName: string;
}

const CHAT_FONT = "'Spectral', Georgia, serif";

const THINKING_WORDS = [
  "Thinking",
  "Pondering",
  "Analyzing",
  "Reflecting",
  "Processing",
  "Contemplating",
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

function parseCompaction(msg: MindMessage): CompactionMessage | null {
  if (msg.role !== "system") return null;
  try {
    const parsed = JSON.parse(msg.content);
    if (parsed.type === "compaction") return parsed as CompactionMessage;
  } catch {
    // Not a compaction message
  }
  return null;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function CompactionBubble({ data }: { data: CompactionMessage }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex justify-center my-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group max-w-[90%] text-center"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-dashed border-purple-400/20 bg-purple-500/8 px-4 py-1.5 text-xs text-purple-300 hover:bg-purple-500/12 transition-colors">
          <Layers className="h-3 w-3" />
          <span>Conversation condensed ({data.message_count} messages)</span>
        </div>
        {expanded && (
          <div className="mt-2 rounded-xl border border-purple-400/15 bg-purple-500/5 p-4 text-left text-sm text-purple-200 whitespace-pre-wrap">
            {data.summary}
          </div>
        )}
      </button>
    </div>
  );
}

const SOUND_PREF_KEY = "minds-sound-enabled";

function useReplySound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean | null>(() => {
    const stored = localStorage.getItem(SOUND_PREF_KEY);
    return stored === null ? null : stored === "true";
  });
  const [showSoundPrompt, setShowSoundPrompt] = useState(() => {
    return localStorage.getItem(SOUND_PREF_KEY) === null;
  });

  useEffect(() => {
    audioRef.current = new Audio("/blip.mp3");
    audioRef.current.preload = "auto";
  }, []);

  const play = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [soundEnabled]);

  const accept = useCallback(() => {
    setSoundEnabled(true);
    localStorage.setItem(SOUND_PREF_KEY, "true");
    setShowSoundPrompt(false);
  }, []);

  const dismiss = useCallback(() => {
    setSoundEnabled(false);
    localStorage.setItem(SOUND_PREF_KEY, "false");
    setShowSoundPrompt(false);
  }, []);

  return { play, showSoundPrompt, accept, dismiss };
}

export function MindChatTab({ mindId, mindName }: MindChatTabProps) {
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const { play: playReplySound, showSoundPrompt, accept: acceptSound, dismiss: dismissSound } = useReplySound();
  const [conversations, setConversations] = useState<MindConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MindMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [animatingMsgId, setAnimatingMsgId] = useState<string | null>(null);
  const followingStream = useRef(true);

  // Auto-scroll only when following the stream
  useEffect(() => {
    if (followingStream.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, streamingText]);

  // Track scroll position — if user scrolls away, stop following
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
    if (!isLoading && !loadingMessages) {
      inputRef.current?.focus();
    }
  }, [isLoading, loadingMessages]);

  const fetchConversations = useCallback(async () => {
    setLoadingConversations(true);
    const data = await listConversations(mindId);
    setConversations(data);
    setLoadingConversations(false);
    return data;
  }, [mindId]);

  const updateConvParam = useCallback((convId: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (convId) {
        next.set("conv", convId);
      } else {
        next.delete("conv");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    (async () => {
      const convs = await fetchConversations();
      const urlConvId = searchParams.get("conv");
      if (urlConvId && convs.some((c) => c.id === urlConvId)) {
        selectConversation(urlConvId);
      } else if (convs.length > 0) {
        selectConversation(convs[0].id);
      }
    })();
  }, [mindId]);

  const selectConversation = async (convId: string) => {
    setActiveConvId(convId);
    updateConvParam(convId);
    setLoadingMessages(true);
    const msgs = await getConversation(mindId, convId);
    setMessages(msgs);
    setLoadingMessages(false);
  };

  const handleNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    updateConvParam(null);
    inputRef.current?.focus();
  };

  const handleDeleteConversation = async (convId: string) => {
    const ok = await deleteConversation(mindId, convId);
    if (ok) {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
      toast.success("Conversation deleted");
    } else {
      toast.error("Failed to delete conversation");
    }
  };

  const startEditing = (conv: MindConversation) => {
    setEditingConvId(conv.id);
    setEditingTitle(conv.title || "");
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const cancelEditing = () => {
    setEditingConvId(null);
    setEditingTitle("");
  };

  const saveTitle = async () => {
    if (!editingConvId) return;
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      cancelEditing();
      return;
    }
    const ok = await renameConversation(mindId, editingConvId, trimmed);
    if (ok) {
      setConversations((prev) =>
        prev.map((c) => (c.id === editingConvId ? { ...c, title: trimmed } : c))
      );
    } else {
      toast.error("Failed to rename conversation");
    }
    cancelEditing();
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || isStreaming) return;

    const userMessage: MindMessage = {
      id: crypto.randomUUID(),
      conversation_id: activeConvId || "",
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    followingStream.current = true;
    setAnimatingMsgId(userMessage.id);
    setMessages((prev) => [...prev, userMessage]);
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
      const response = await sendChatMessageStream(
        mindId,
        trimmed,
        activeConvId || undefined
      );

      if (!response.ok) {
        throw new Error("Stream request failed");
      }

      // Keep isLoading=true (ThinkingIndicator visible) until first text token
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let streamConvId = activeConvId;
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

            if (parsed.conversationId && !streamConvId) {
              streamConvId = parsed.conversationId;
              setActiveConvId(streamConvId);
              updateConvParam(streamConvId);
              fetchConversations();
            }

            if (parsed.text) {
              // Transition from thinking → streaming on first text token
              if (!hasReceivedText) {
                hasReceivedText = true;
                setIsLoading(false);
                setIsStreaming(true);
              }
              accumulated += parsed.text;
              setStreamingText(accumulated);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue; // Partial JSON, skip
            throw e;
          }
        }
      }

      // Stream complete — finalize the assistant message
      if (accumulated) {
        const assistantMessage: MindMessage = {
          id: crypto.randomUUID(),
          conversation_id: streamConvId || "",
          role: "assistant",
          content: accumulated,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        playReplySound();
      }
    } catch {
      const errorMessage: MindMessage = {
        id: crypto.randomUUID(),
        conversation_id: activeConvId || "",
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingText("");
    }
  };

  const handleExportConversation = () => {
    if (messages.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    let md = `# Conversation with ${mindName}\n\n_Exported ${new Date().toLocaleString()}_\n\n---\n\n`;
    for (const msg of messages) {
      const compaction = parseCompaction(msg);
      if (compaction) {
        md += `> **[Context from earlier conversation]**\n> ${compaction.summary.replace(/\n/g, "\n> ")}\n\n---\n\n`;
        continue;
      }
      if (msg.role === "system") continue;
      const label = msg.role === "user" ? "You" : mindName;
      md += `**${label}:**\n\n${msg.content}\n\n---\n\n`;
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mindName.toLowerCase().replace(/\s+/g, "-")}-conversation-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) handleSubmit();
    }
  };

  return (
    <div className="flex h-[600px] rounded-xl overflow-hidden" style={{ backgroundColor: "#262624" }}>
      {/* Sidebar */}
      <div
        className={`border-r border-white/4 bg-[#0e0e14] flex flex-col transition-all duration-200 ${
          sidebarOpen ? "w-60" : "w-0"
        } overflow-hidden shrink-0`}
      >
        {/* Sidebar header */}
        <div className="p-3 border-b border-white/4 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#6a6a75] uppercase tracking-wider">
            Chats
          </span>
          <button
            onClick={handleNewChat}
            className="rounded-lg p-1.5 text-[#6a6a75] hover:text-alloro-orange hover:bg-alloro-orange/10 transition-colors"
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto minds-chat-scrollbar">
          {loadingConversations ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-[#6a6a75]" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-[#6a6a75] text-center py-6 px-3">
              No conversations yet
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                  activeConvId === conv.id
                    ? "bg-white/[0.04] border-r-2 border-alloro-orange"
                    : "hover:bg-white/[0.03]"
                }`}
                onClick={() => editingConvId !== conv.id && selectConversation(conv.id)}
              >
                <div className="min-w-0 flex-1">
                  {editingConvId === conv.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={editInputRef}
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveTitle();
                          if (e.key === "Escape") cancelEditing();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-sm bg-white/[0.06] border border-white/10 rounded px-1.5 py-0.5 text-[#eaeaea] outline-none focus:border-alloro-orange"
                        style={{ fontFamily: CHAT_FONT }}
                      />
                      <button onClick={(e) => { e.stopPropagation(); saveTitle(); }} className="p-0.5 text-green-400 hover:text-green-300" title="Save">
                        <Check className="h-3 w-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); cancelEditing(); }} className="p-0.5 text-[#6a6a75] hover:text-[#a0a0a8]" title="Cancel">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <p
                      className={`text-sm truncate ${
                        activeConvId === conv.id
                          ? "text-[#eaeaea] font-medium"
                          : "text-[#a0a0a8]"
                      }`}
                      style={{ fontFamily: CHAT_FONT }}
                      onDoubleClick={(e) => { e.stopPropagation(); startEditing(conv); }}
                    >
                      {conv.title || "New conversation"}
                    </p>
                  )}
                  <p className="text-[10px] text-[#6a6a75]">
                    {timeAgo(conv.updated_at)}
                  </p>
                </div>
                {editingConvId !== conv.id && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditing(conv); }}
                      className="rounded p-1 text-[#6a6a75] hover:text-alloro-orange transition-colors"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await confirm({ title: "Delete this conversation?", confirmLabel: "Delete", variant: "danger" });
                        if (ok) {
                          handleDeleteConversation(conv.id);
                        }
                      }}
                      className="rounded p-1 text-[#6a6a75] hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Toggle sidebar */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="w-5 flex items-center justify-center bg-[#0e0e14] hover:bg-white/[0.03] border-r border-white/4 transition-colors shrink-0"
        title={sidebarOpen ? "Collapse" : "Expand"}
      >
        {sidebarOpen ? (
          <ChevronLeft className="h-3 w-3 text-[#6a6a75]" />
        ) : (
          <ChevronRight className="h-3 w-3 text-[#6a6a75]" />
        )}
      </button>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sound prompt */}
        {showSoundPrompt && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/4" style={{ backgroundColor: "#1e1e1c" }}>
            <span className="text-xs text-[#a0a0a8]">Enable sound notifications for agent replies?</span>
            <div className="flex items-center gap-2">
              <button onClick={acceptSound} className="text-[10px] font-semibold text-alloro-orange hover:underline">Enable</button>
              <button onClick={dismissSound} className="text-[10px] text-[#6a6a75] hover:text-[#a0a0a8]">No thanks</button>
            </div>
          </div>
        )}
        {/* Export button */}
        {messages.length > 0 && (
          <div className="flex justify-end px-3 pt-2">
            <button
              onClick={handleExportConversation}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] text-[#6a6a75] hover:text-[#eaeaea] hover:bg-white/[0.04] transition-colors"
              title="Export to continue somewhere else"
            >
              <Download className="h-3.5 w-3.5" />
              Save
            </button>
          </div>
        )}
        {/* Messages */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="relative flex-1 overflow-y-auto p-4 space-y-4"
        >
          {loadingMessages ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-[#6a6a75]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="h-10 w-10 mb-3 text-[#2a2a2a]" />
              <p className="text-sm font-medium text-[#6a6a75]">Start a conversation</p>
              <p className="text-xs mt-1 text-[#6a6a75]">Send a message to begin.</p>
            </div>
          ) : (
            messages.map((msg) => {
              // Check for compaction message
              const compaction = parseCompaction(msg);
              if (compaction) {
                return <CompactionBubble key={msg.id} data={compaction} />;
              }

              // Skip unknown system messages
              if (msg.role === "system") return null;

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
                      <div className="prose prose-invert max-w-none overflow-x-auto prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-3 prose-blockquote:my-2 prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/4 prose-code:text-alloro-orange prose-table:w-full prose-th:px-3 prose-th:py-1.5 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-th:border prose-th:border-white/8 prose-th:bg-white/[0.035] prose-td:px-3 prose-td:py-1.5 prose-td:text-xs prose-td:border prose-td:border-white/6" style={{ fontFamily: CHAT_FONT, fontSize: "18px", color: "#c2c0b6" }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </Wrapper>
              );
            })
          )}

          {isLoading && <ThinkingIndicator />}

          {isStreaming && streamingText && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 border border-white/4" style={{ fontFamily: CHAT_FONT, fontSize: "18px", lineHeight: 1.5, color: "#c2c0b6", backgroundColor: "rgba(255,255,255,0.035)" }}>
                <div className="prose prose-invert max-w-none overflow-x-auto prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-3 prose-blockquote:my-2 prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/4 prose-code:text-alloro-orange prose-table:w-full prose-th:px-3 prose-th:py-1.5 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-th:border prose-th:border-white/8 prose-th:bg-white/[0.035] prose-td:px-3 prose-td:py-1.5 prose-td:text-xs prose-td:border prose-td:border-white/6" style={{ fontFamily: CHAT_FONT, fontSize: "18px", color: "#c2c0b6" }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                  <span className="inline-block w-2 h-4 bg-alloro-orange/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to latest floating button */}
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

        {/* Input */}
        <div className="border-t border-white/4 p-3" style={{ backgroundColor: "#1e1e1c" }}>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
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
          </div>
        </div>
      </div>
    </div>
  );
}
