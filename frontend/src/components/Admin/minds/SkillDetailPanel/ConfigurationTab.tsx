import { Send, Save } from "lucide-react";
import { ActionButton } from "../../../ui/DesignSystem";
import {
  type WorkCreationType,
  type TriggerType,
  type PipelineMode,
  type PublishChannel,
} from "../../../../api/minds";

interface ConfigurationTabProps {
  cfgStatus: "active" | "paused";
  setCfgStatus: (value: "active" | "paused") => void;
  cfgWorkType: WorkCreationType | "";
  setCfgWorkType: (value: WorkCreationType | "") => void;
  cfgOutputCount: number;
  setCfgOutputCount: (value: number) => void;
  cfgAttachmentType: WorkCreationType | "";
  setCfgAttachmentType: (value: WorkCreationType | "") => void;
  cfgTriggerType: TriggerType;
  setCfgTriggerType: (value: TriggerType) => void;
  cfgTriggerDay: string;
  setCfgTriggerDay: (value: string) => void;
  cfgTriggerTime: string;
  setCfgTriggerTime: (value: string) => void;
  cfgTriggerTimezone: string;
  setCfgTriggerTimezone: (value: string) => void;
  cfgPipelineMode: PipelineMode;
  setCfgPipelineMode: (value: PipelineMode) => void;
  cfgPublishChannelId: string;
  setCfgPublishChannelId: (value: string) => void;
  channels: PublishChannel[];
  testQuery: string;
  setTestQuery: (value: string) => void;
  testingPortal: boolean;
  testPortalResponse: { response: string } | null;
  savingConfig: boolean;
  handleTestSkillPortal: () => void;
  handleSaveConfig: () => void;
}

export function ConfigurationTab({
  cfgStatus,
  setCfgStatus,
  cfgWorkType,
  setCfgWorkType,
  cfgOutputCount,
  setCfgOutputCount,
  cfgAttachmentType,
  setCfgAttachmentType,
  cfgTriggerType,
  setCfgTriggerType,
  cfgTriggerDay,
  setCfgTriggerDay,
  cfgTriggerTime,
  setCfgTriggerTime,
  cfgTriggerTimezone,
  setCfgTriggerTimezone,
  cfgPipelineMode,
  setCfgPipelineMode,
  cfgPublishChannelId,
  setCfgPublishChannelId,
  channels,
  testQuery,
  setTestQuery,
  testingPortal,
  testPortalResponse,
  savingConfig,
  handleTestSkillPortal,
  handleSaveConfig,
}: ConfigurationTabProps) {
  return (
          <div className="space-y-6">
            {/* Status toggle */}
            <div className="rounded-xl border border-white/8 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-[#eaeaea]">Skill Status</h4>
                  <p className="text-xs text-[#6a6a75] mt-0.5">
                    Active skills run on their schedule. Paused skills are dormant.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCfgStatus("paused")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      cfgStatus === "paused"
                        ? "bg-white/10 text-[#eaeaea]"
                        : "text-[#6a6a75] hover:text-[#a0a0a8]"
                    }`}
                  >
                    Paused
                  </button>
                  <button
                    onClick={() => setCfgStatus("active")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      cfgStatus === "active"
                        ? "bg-green-500/20 text-green-400"
                        : "text-[#6a6a75] hover:text-[#a0a0a8]"
                    }`}
                  >
                    Active
                  </button>
                </div>
              </div>
            </div>

            {/* Work Creation Type + Output Count */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                  Work Creation Type
                </label>
                <select
                  value={cfgWorkType}
                  onChange={(e) => setCfgWorkType(e.target.value as WorkCreationType | "")}
                  className="w-full rounded-lg border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                >
                  <option value="">Not set</option>
                  <option value="text">Text</option>
                  <option value="markdown">Markdown</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">DOCX</option>
                  <option value="audio">Audio</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                  Output Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={cfgOutputCount}
                  onChange={(e) => setCfgOutputCount(parseInt(e.target.value) || 1)}
                  className="w-full rounded-lg border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                />
                <p className="text-[10px] text-[#6a6a75] mt-1">How many work items per run</p>
              </div>
            </div>

            {/* Artifact Attachment */}
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                Artifact Attachment
              </label>
              <p className="text-xs text-[#6a6a75] mb-2">
                If this skill produces both content and a media attachment (e.g. text + image), set the attachment type.
              </p>
              <select
                value={cfgAttachmentType}
                onChange={(e) => setCfgAttachmentType(e.target.value as WorkCreationType | "")}
                className="w-full rounded-lg border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50"
                style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
              >
                <option value="">None</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="pdf">PDF</option>
              </select>
            </div>

            {/* Trigger */}
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                Trigger Type
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {(["manual", "daily", "weekly", "day_of_week"] as TriggerType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setCfgTriggerType(t)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      cfgTriggerType === t
                        ? "bg-alloro-navy text-white border-alloro-navy"
                        : "border-white/10 text-[#a0a0a8] hover:border-white/20"
                    }`}
                  >
                    {t.replace(/_/g, " ")}
                  </button>
                ))}
              </div>

              {cfgTriggerType !== "manual" && (
                <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/8 bg-white/[0.04] p-4">
                  {(cfgTriggerType === "weekly" || cfgTriggerType === "day_of_week") && (
                    <div>
                      <label className="block text-[10px] font-medium text-[#a0a0a8] mb-1">Day</label>
                      <select
                        value={cfgTriggerDay}
                        onChange={(e) => setCfgTriggerDay(e.target.value)}
                        className="w-full rounded-lg border border-white/8 px-2 py-1.5 text-xs text-[#c2c0b6] focus:border-alloro-orange focus:outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                      >
                        <option value="">Select</option>
                        <option value="monday">Monday</option>
                        <option value="tuesday">Tuesday</option>
                        <option value="wednesday">Wednesday</option>
                        <option value="thursday">Thursday</option>
                        <option value="friday">Friday</option>
                        <option value="saturday">Saturday</option>
                        <option value="sunday">Sunday</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-medium text-[#a0a0a8] mb-1">Time</label>
                    <input
                      type="time"
                      value={cfgTriggerTime}
                      onChange={(e) => setCfgTriggerTime(e.target.value)}
                      className="w-full rounded-lg border border-white/8 px-2 py-1.5 text-xs text-[#c2c0b6] focus:border-alloro-orange focus:outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[#a0a0a8] mb-1">Timezone</label>
                    <select
                      value={cfgTriggerTimezone}
                      onChange={(e) => setCfgTriggerTimezone(e.target.value)}
                      className="w-full rounded-lg border border-white/8 px-2 py-1.5 text-xs text-[#c2c0b6] focus:border-alloro-orange focus:outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                    >
                      <option value="America/New_York">Eastern</option>
                      <option value="America/Chicago">Central</option>
                      <option value="America/Denver">Mountain</option>
                      <option value="America/Los_Angeles">Pacific</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/London">London</option>
                      <option value="Europe/Berlin">Berlin</option>
                      <option value="Asia/Tokyo">Tokyo</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Pipeline Mode */}
            <div>
              <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                Pipeline Mode
              </label>
              <div className="space-y-2">
                {([
                  { value: "review_and_stop", label: "Review & Stop", desc: "Work is created, reviewed, then stops. No auto-publish." },
                  { value: "review_then_publish", label: "Review then Publish", desc: "Work is reviewed. If approved, auto-publishes to the target." },
                  { value: "auto_pipeline", label: "Auto Pipeline", desc: "Fully automated. Work is created and published without review." },
                ] as const).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      cfgPipelineMode === opt.value
                        ? "border-alloro-orange bg-alloro-orange/10"
                        : "border-white/8 hover:border-white/15"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pipeline-mode"
                      value={opt.value}
                      checked={cfgPipelineMode === opt.value}
                      onChange={() => setCfgPipelineMode(opt.value)}
                      className="mt-0.5 accent-alloro-orange"
                    />
                    <div>
                      <span className="text-sm font-medium text-[#eaeaea]">{opt.label}</span>
                      <p className="text-xs text-[#6a6a75] mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Publish Channel */}
            {cfgPipelineMode !== "review_and_stop" && (
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a8] mb-1.5">
                  Publish Channel
                </label>
                <select
                  value={cfgPublishChannelId}
                  onChange={(e) => setCfgPublishChannelId(e.target.value)}
                  className="w-full rounded-lg border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                >
                  <option value="">No channel (internal only)</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}{ch.status === "disabled" ? " (disabled)" : ""}
                    </option>
                  ))}
                </select>
                {channels.length === 0 && (
                  <p className="text-[10px] text-[#6a6a75] mt-1">
                    No channels configured. Add one in the Publish Channels tab.
                  </p>
                )}
              </div>
            )}

            {/* Test Skill Portal */}
            <div className="rounded-xl border border-white/8 bg-white/[0.04] p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Send className="h-4 w-4 text-[#a0a0a8]" />
                  <h4 className="text-sm font-semibold text-[#eaeaea]">Test Skill Portal</h4>
                </div>
                <p className="text-xs text-[#6a6a75] mb-3">
                  Test the Skill Portal response using JWT auth.
                </p>
                <textarea
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  rows={3}
                  placeholder="Ask this skill portal a question..."
                  className="w-full rounded-lg border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] placeholder-[#6a6a75] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange/50 resize-none mb-3"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                />
                <div className="flex justify-end mb-3">
                  <ActionButton
                    label="Test"
                    icon={<Send className="h-4 w-4" />}
                    onClick={handleTestSkillPortal}
                    variant="primary"
                    size="sm"
                    loading={testingPortal}
                    disabled={!testQuery.trim()}
                  />
                </div>
                {testPortalResponse && (
                  <div className="rounded-lg border border-white/8 bg-white/[0.04] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-medium text-[#a0a0a8] uppercase tracking-wider">Response</span>
                    </div>
                    <p className="text-sm text-[#c2c0b6] whitespace-pre-wrap leading-relaxed">
                      {testPortalResponse.response}
                    </p>
                  </div>
                )}
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <ActionButton
                label="Save Configuration"
                icon={<Save className="h-4 w-4" />}
                onClick={handleSaveConfig}
                variant="primary"
                loading={savingConfig}
              />
            </div>
          </div>
  );
}
