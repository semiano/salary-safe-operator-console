import { useEffect, useState } from "react";

type StreamMessage = {
  id: string;
  run_id: string;
  phase: string;
  round_number: number;
  speaker_agent: string;
  visibility: string;
  message_type: string;
  content: string;
  structured_payload?: Record<string, unknown> | null;
  created_at?: string;
};

type StreamArtifact = {
  id: string;
  run_id?: string;
  artifact_type: string;
  payload: Record<string, unknown>;
  created_at?: string;
};

export function useRunStream(runId: string) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [artifacts, setArtifacts] = useState<StreamArtifact[]>([]);
  const [status, setStatus] = useState<string>("unknown");

  useEffect(() => {
    if (!runId) {
      return;
    }

    const eventSource = new EventSource(`/api/runs/${runId}/stream`);

    eventSource.addEventListener("status", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as { status: string };
      setStatus(payload.status);
    });

    eventSource.addEventListener("message", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as StreamMessage;
      setMessages((prev) => {
        if (prev.some((item) => item.id === payload.id)) {
          return prev;
        }
        return [...prev, payload];
      });
    });

    eventSource.addEventListener("artifact", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as StreamArtifact;
      setArtifacts((prev) => {
        if (prev.some((item) => item.id === payload.id)) {
          return prev;
        }
        return [...prev, payload];
      });
    });

    eventSource.addEventListener("completion", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as { status: string };
      setStatus(payload.status);
      eventSource.close();
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [runId]);

  return { status, messages, artifacts };
}
