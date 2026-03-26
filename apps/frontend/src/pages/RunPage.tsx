import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";

import { apiPost } from "../api/client";
import { useCaseDetail } from "../hooks/useCaseEditor";
import { useRunArtifacts, useRunMessages } from "../hooks/useRunMessages";
import { useRunStream } from "../hooks/useRunStream";
import { useCaseRuns, useRunDetail } from "../hooks/useRunViews";
import { extractCaseMeta } from "../utils/caseMeta";

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function RunPage() {
  const navigate = useNavigate();
  const { runId = "" } = useParams();
  const { data: runDetail } = useRunDetail(runId);
  const caseId = runDetail?.case_id ?? "";
  const { data: caseDetail } = useCaseDetail(caseId);
  const { data: caseRuns } = useCaseRuns(caseId);
  const { data: queriedMessages } = useRunMessages(runId);
  const { data: queriedArtifacts } = useRunArtifacts(runId);
  const { status, messages: streamedMessages, artifacts: streamedArtifacts } = useRunStream(runId);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [dots, setDots] = useState(".");
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [expandedRawPayloads, setExpandedRawPayloads] = useState<Record<string, boolean>>({});

  const rerunMutation = useMutation({
    mutationFn: async () => {
      if (!caseId || !runDetail?.run_config_id || !runDetail?.prompt_set_id) {
        throw new Error("Run context is not loaded yet.");
      }
      return apiPost<{ id: string }>(`/cases/${caseId}/runs`, {
        run_config_id: runDetail.run_config_id,
        prompt_set_id: runDetail.prompt_set_id,
      });
    },
    onSuccess: (newRun) => {
      navigate(`/runs/${newRun.id}`);
    },
  });

  const messages = streamedMessages.length > 0 ? streamedMessages : (queriedMessages ?? []);
  const artifacts = streamedArtifacts.length > 0 ? streamedArtifacts : (queriedArtifacts ?? []);

  const activeStep = useMemo(() => {
    if (messages.length === 0) {
      return status;
    }
    return messages[messages.length - 1].phase;
  }, [messages, status]);

  const isProcessing = useMemo(() => {
    const normalized = (runDetail?.status ?? status ?? "").toLowerCase();
    return !["completed", "failed", "error"].includes(normalized);
  }, [runDetail?.status, status]);

  useEffect(() => {
    if (!runDetail?.started_at) {
      return;
    }

    const start = new Date(runDetail.started_at).getTime();
    const end = runDetail.completed_at ? new Date(runDetail.completed_at).getTime() : null;
    const computeElapsed = () => {
      const now = Date.now();
      const effectiveEnd = end ?? now;
      return Math.max(0, Math.floor((effectiveEnd - start) / 1000));
    };

    setElapsedSeconds(computeElapsed());
    if (end) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedSeconds(computeElapsed());
    }, 1000);

    return () => clearInterval(timer);
  }, [runDetail?.started_at, runDetail?.completed_at]);

  useEffect(() => {
    if (!isProcessing) {
      setDots(".");
      return;
    }

    const timer = setInterval(() => {
      setDots((current) => (current.length >= 3 ? "." : `${current}.`));
    }, 450);

    return () => clearInterval(timer);
  }, [isProcessing]);

  const caseMeta = caseDetail ? extractCaseMeta(caseDetail) : null;

  function toggleRawPayload(messageId: string) {
    setExpandedRawPayloads((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  }

  return (
    <section className="relative">
      <aside
        className="fixed right-0 top-1/2 z-30 -translate-y-1/2"
        aria-label="Admin debug launcher"
      >
        <div
          className="group flex cursor-pointer items-center gap-3 rounded-l-2xl border border-r-0 border-ink/15 bg-gradient-to-r from-ink to-slate px-3 py-4 text-paper shadow-lg"
          onClick={() => setIsDebugOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsDebugOpen((current) => !current);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-paper/20 text-sm font-semibold">DBG</div>
          <div className="pr-1">
            <p className="text-[11px] uppercase tracking-wide text-paper/80">Admin Debug</p>
            <p className="text-xs font-medium text-paper">Artifacts {artifacts.length} | Msgs {messages.length}</p>
            <p className="text-[11px] text-paper/80">{isDebugOpen ? "Collapse panel" : "Open live panel"}</p>
          </div>
        </div>
      </aside>

      <article className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <div className="mb-4 rounded-xl border border-ink/10 bg-paper p-4">
          <h2 className="font-display text-xl">Case Context</h2>
          <p className="text-sm text-slate">Case id: {caseId || "loading..."}</p>
          <p className="mt-2 text-sm">
            <span className="font-medium">Job Title:</span> {caseMeta?.jobTitle ?? "Loading"}
          </p>
          <p className="text-sm">
            <span className="font-medium">Job Description:</span> {caseMeta?.jobDescription ?? "Loading"}
          </p>
          <p className="text-sm">
            <span className="font-medium">Responsibilities:</span>{" "}
            {caseMeta && caseMeta.responsibilities.length > 0
              ? caseMeta.responsibilities.join(", ")
              : "Not provided"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {caseId ? (
              <Link className="rounded-full border border-ink/20 px-3 py-1.5 text-xs" to={`/cases/${caseId}`}>
                Open Case Editor
              </Link>
            ) : null}
            <button
              className="rounded-full border border-ink/20 px-3 py-1.5 text-xs"
              disabled={rerunMutation.isPending || !caseId}
              onClick={() => rerunMutation.mutate()}
              type="button"
            >
              {rerunMutation.isPending ? "Starting..." : "Start New Run"}
            </button>
          </div>
        </div>

        <h2 className="font-display text-xl">Live Negotiation Chat</h2>
        <p className="mb-4 text-sm text-slate">Run id: {runId}</p>
        <p className="text-sm text-slate">Status: {runDetail?.status ?? status}</p>
        <p className="mb-4 text-sm text-slate">
          Step: {activeStep}
          {isProcessing ? dots : ""} | Duration: {formatDuration(elapsedSeconds)}
        </p>
        <div className="mb-4 flex gap-2">
          <Link className="rounded-full border border-slate/20 px-4 py-1.5 text-xs" to={`/runs/${runId}/report`}>
            Report
          </Link>
          <Link className="rounded-full border border-slate/20 px-4 py-1.5 text-xs" to={`/runs/${runId}/compare`}>
            Compare
          </Link>
        </div>
        <div className="space-y-3">
          {messages.map((message) => (
            <div key={message.id} className="rounded-xl border border-ink/10 p-3">
              <div className="mb-1 text-xs text-slate">
                {message.speaker_agent} | {message.phase} | round {message.round_number} | {message.visibility}
                {message.created_at ? ` | ${new Date(message.created_at).toLocaleTimeString()}` : ""}
              </div>
              <p className="text-sm">{message.content}</p>
              {message.structured_payload ? (
                <div className="mt-2">
                  <button
                    className="rounded-full border border-ink/20 px-3 py-1 text-xs"
                    type="button"
                    onClick={() => toggleRawPayload(message.id)}
                  >
                    {expandedRawPayloads[message.id] ? "Hide raw payload" : "Inspect raw payload"}
                  </button>
                  {expandedRawPayloads[message.id] ? (
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-ink/10 bg-paper p-2 text-xs">
                      {JSON.stringify(message.structured_payload, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </article>

      {isDebugOpen ? (
        <button
          aria-label="Close admin debug panel"
          className="fixed inset-0 z-20 bg-ink/15"
          onClick={() => setIsDebugOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={`fixed right-0 top-0 z-30 h-full w-full max-w-xl transform overflow-y-auto border-l border-ink/10 bg-white p-6 shadow-2xl transition-transform duration-200 ease-out ${
          isDebugOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-ink to-slate p-3 text-paper">
          <div>
            <h3 className="font-display text-lg">Admin Debug Panel</h3>
            <p className="text-xs text-paper/80">Artifacts {artifacts.length} | Messages {messages.length}</p>
          </div>
          <button
            className="rounded-full border border-paper/40 px-3 py-1 text-xs"
            onClick={() => setIsDebugOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="space-y-3 text-sm">
          {artifacts.map((artifact) => (
            <div key={artifact.id} className="rounded-xl border border-ink/10 p-3">
              <p className="font-medium">{artifact.artifact_type}</p>
              {artifact.created_at ? (
                <p className="text-xs text-slate">{new Date(artifact.created_at).toLocaleTimeString()}</p>
              ) : null}
              <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(artifact.payload, null, 2)}</pre>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <h4 className="font-display text-base">Case Run History</h4>
          {(caseRuns ?? []).length === 0 ? (
            <p className="text-xs text-slate">No run history found for this case.</p>
          ) : (
            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto text-xs">
              {(caseRuns ?? []).map((run) => (
                <div key={run.id} className="rounded-xl border border-ink/10 p-3">
                  <p className="font-medium">
                    {run.id === runId ? "Current Run" : "Run"}: {run.status}
                  </p>
                  <p className="text-slate">Created: {new Date(run.created_at).toLocaleString()}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link className="rounded-full border border-ink/20 px-2 py-1" to={`/runs/${run.id}`}>
                      Chat
                    </Link>
                    <Link className="rounded-full border border-ink/20 px-2 py-1" to={`/runs/${run.id}/report`}>
                      Report
                    </Link>
                    <Link className="rounded-full border border-ink/20 px-2 py-1" to={`/runs/${run.id}/compare`}>
                      Compare
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
