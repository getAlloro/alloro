import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  PILOT_EMBED_EXPIRED_MESSAGE,
  PILOT_EMBED_LOGOUT_MESSAGE,
  PILOT_EMBED_READY_MESSAGE,
  PILOT_EMBED_TOKEN_MESSAGE,
} from "../../../utils/embeddedPilotSession";

export type EmbeddedPilotFrameSession = {
  email: string;
  role: string;
  token: string;
  userId: number;
};

type EmbeddedPilotFrameProps = {
  onEnded: () => void;
  session: EmbeddedPilotFrameSession;
};

export function EmbeddedPilotFrame({
  onEnded,
  session,
}: EmbeddedPilotFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  const postSession = useCallback(() => {
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow) return;

    targetWindow.postMessage(
      {
        email: session.email,
        role: session.role,
        token: session.token,
        type: PILOT_EMBED_TOKEN_MESSAGE,
        userId: session.userId,
      },
      window.location.origin
    );
  }, [session.email, session.role, session.token, session.userId]);

  useEffect(() => {
    setIsReady(false);
  }, [session.token]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;

      const type = (event.data as { type?: unknown }).type;
      if (type === PILOT_EMBED_READY_MESSAGE) {
        setIsReady(true);
        postSession();
      }
      if (
        type === PILOT_EMBED_EXPIRED_MESSAGE ||
        type === PILOT_EMBED_LOGOUT_MESSAGE
      ) {
        onEnded();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onEnded, postSession]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="relative h-[630px] max-w-full overflow-hidden bg-white">
        {!isReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 text-sm font-semibold text-gray-600">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting pilot session
          </div>
        )}
        <iframe
          ref={iframeRef}
          title={`Pilot session for ${session.email}`}
          src="/pilot-embed"
          className="h-[768px] w-[121.951%] origin-top-left scale-[0.82] border-0"
          onLoad={postSession}
        />
      </div>
    </div>
  );
}
