import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { apiGet, apiPost } from "../api/client";
import { useCases } from "../hooks/useCases";
import type { RunConfigSummary } from "../types/api";

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <label className="text-sm font-medium" title={help}>
      {label}
      <span
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-ink/20 text-[10px] text-slate"
        title={help}
        aria-label={help}
      >
        ?
      </span>
    </label>
  );
}

export function RunConfigsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: cases } = useCases();
  const [selectedCaseId, setSelectedCaseId] = useState(searchParams.get("case_id") ?? "");
  const [name, setName] = useState("baseline_hybrid_guided");
  const [provider, setProvider] = useState<"openai" | "azure_openai">("openai");
  const [modelName, setModelName] = useState("gpt-5.4");
  const [maxRounds, setMaxRounds] = useState(5);
  const [maxTurnsPerRound, setMaxTurnsPerRound] = useState(3);
  const [deadlockRepeatThreshold, setDeadlockRepeatThreshold] = useState(2);
  const [conversationMode, setConversationMode] = useState("hybrid_guided_groupchat");
  const [enablePolicyGuard, setEnablePolicyGuard] = useState(true);
  const [enableAdminTrace, setEnableAdminTrace] = useState(true);
  const [requireStructuredProposals, setRequireStructuredProposals] = useState(true);
  const [allowTitleTradeoffs, setAllowTitleTradeoffs] = useState(true);
  const [allowEquityTradeoffs, setAllowEquityTradeoffs] = useState(true);
  const [allowReviewCycleTradeoffs, setAllowReviewCycleTradeoffs] = useState(true);
  const [tempIntake, setTempIntake] = useState(0.1);
  const [tempCandidate, setTempCandidate] = useState(0.55);
  const [tempCompany, setTempCompany] = useState(0.45);
  const [tempPolicy, setTempPolicy] = useState(0.0);
  const [tempArbitrator, setTempArbitrator] = useState(0.25);
  const [rerunCount, setRerunCount] = useState(3);
  const [turnDelaySeconds, setTurnDelaySeconds] = useState(1.5);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const caseIdFromUrl = searchParams.get("case_id") ?? "";
    if (caseIdFromUrl !== selectedCaseId) {
      setSelectedCaseId(caseIdFromUrl);
    }
  }, [searchParams, selectedCaseId]);

  const caseTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    (cases ?? []).forEach((item) => map.set(item.id, item.title));
    return map;
  }, [cases]);

  const { data: runConfigs, isLoading } = useQuery({
    queryKey: ["run-configs-admin", selectedCaseId],
    queryFn: () =>
      apiGet<RunConfigSummary[]>(selectedCaseId ? `/configs?case_id=${selectedCaseId}` : "/configs"),
  });

  const createRunConfig = useMutation({
    mutationFn: (caseId: string) =>
      apiPost<RunConfigSummary>(`/configs?case_id=${caseId}`, {
        name,
        config: {
          provider,
          model_name: modelName,
          temperature_profile: {
            intake: tempIntake,
            candidate_rep: tempCandidate,
            company_rep: tempCompany,
            policy_guard: tempPolicy,
            arbitrator: tempArbitrator,
          },
          conversation_mode: conversationMode,
          max_rounds: maxRounds,
          max_turns_per_round: maxTurnsPerRound,
          enable_policy_guard: enablePolicyGuard,
          enable_admin_trace: enableAdminTrace,
          require_structured_proposals: requireStructuredProposals,
          allow_title_tradeoffs: allowTitleTradeoffs,
          allow_equity_tradeoffs: allowEquityTradeoffs,
          allow_review_cycle_tradeoffs: allowReviewCycleTradeoffs,
          deadlock_repeat_threshold: deadlockRepeatThreshold,
          rerun_count: rerunCount,
          turn_delay_seconds: turnDelaySeconds,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["run-configs-admin"] });
      queryClient.invalidateQueries({ queryKey: ["run-configs", selectedCaseId] });
    },
  });

  async function onCreate() {
    if (!selectedCaseId) {
      setErrorMessage("Select a case before creating a run config.");
      return;
    }

    try {
      setErrorMessage(null);
      await createRunConfig.mutateAsync(selectedCaseId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create run config.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Run Configs</h2>
      </div>

      {errorMessage ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p> : null}

      <div className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm lg:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel label="Case" help="Target case this run config belongs to." />
          <select
            className="rounded-lg border border-ink/20 px-3 py-2"
            value={selectedCaseId}
            onChange={(event) => {
              const nextCaseId = event.target.value;
              setSelectedCaseId(nextCaseId);
              if (nextCaseId) {
                setSearchParams({ case_id: nextCaseId });
              } else {
                setSearchParams({});
              }
            }}
          >
            <option value="">Select case</option>
            {(cases ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Config Name" help="Human-readable name used to identify this config in run selectors." />
          <input className="rounded-lg border border-ink/20 px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Provider" help="LLM provider used for all agents in this run." />
          <select
            className="rounded-lg border border-ink/20 px-3 py-2"
            value={provider}
            onChange={(event) => setProvider(event.target.value as "openai" | "azure_openai")}
          >
            <option value="openai">openai</option>
            <option value="azure_openai">azure_openai</option>
          </select>
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Model Name" help="Exact model or deployment name sent to the provider." />
          <input className="rounded-lg border border-ink/20 px-3 py-2" value={modelName} onChange={(event) => setModelName(event.target.value)} />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Conversation Mode" help="Orchestration strategy used by the negotiation runtime." />
          <select className="rounded-lg border border-ink/20 px-3 py-2" value={conversationMode} onChange={(event) => setConversationMode(event.target.value)}>
            <option value="hybrid_guided_groupchat">hybrid_guided_groupchat</option>
            <option value="guided_turn_by_turn">guided_turn_by_turn</option>
          </select>
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Max Rounds" help="Upper bound of round cycles before synthesis/deadlock decisions." />
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            type="number"
            min={1}
            max={20}
            value={maxRounds}
            onChange={(event) => setMaxRounds(Number(event.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Max Turns / Round" help="Per-round exchange limit between candidate and company reps." />
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            type="number"
            min={1}
            max={10}
            value={maxTurnsPerRound}
            onChange={(event) => setMaxTurnsPerRound(Number(event.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Deadlock Repeat Threshold" help="How many repeated positions trigger deadlock escalation logic." />
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            type="number"
            min={1}
            max={10}
            value={deadlockRepeatThreshold}
            onChange={(event) => setDeadlockRepeatThreshold(Number(event.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Candidate Temp" help="Creativity/variance for candidate representative responses." />
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={tempCandidate}
            onChange={(event) => setTempCandidate(Number(event.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Company Temp" help="Creativity/variance for company representative responses." />
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={tempCompany}
            onChange={(event) => setTempCompany(Number(event.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Arbitrator Temp" help="Variance in arbitration/synthesis language and decision framing." />
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={tempArbitrator}
            onChange={(event) => setTempArbitrator(Number(event.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Intake Temp" help="Variance during intake normalization and initial interpretation." />
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={tempIntake}
            onChange={(event) => setTempIntake(Number(event.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Policy Temp" help="Variance for policy/compliance phrasing; typically kept low." />
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={tempPolicy}
            onChange={(event) => setTempPolicy(Number(event.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Rerun Count" help="Number of stochastic reruns performed for report selection/aggregation." />
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            type="number"
            min={1}
            max={20}
            value={rerunCount}
            onChange={(event) => setRerunCount(Number(event.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Turn Delay (seconds)" help="Delay between emitted run events/messages for paced replay." />
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={turnDelaySeconds}
            onChange={(event) => setTurnDelaySeconds(Number(event.target.value))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Enable Policy Guard" help="Runs policy/compliance checks during negotiation phases." />
          <label className="inline-flex items-center gap-2 rounded-lg border border-ink/20 px-3 py-2">
            <input type="checkbox" checked={enablePolicyGuard} onChange={(event) => setEnablePolicyGuard(event.target.checked)} />
            <span className="text-sm">Enabled</span>
          </label>
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Enable Admin Trace" help="Stores additional internal trace artifacts for diagnostics." />
          <label className="inline-flex items-center gap-2 rounded-lg border border-ink/20 px-3 py-2">
            <input type="checkbox" checked={enableAdminTrace} onChange={(event) => setEnableAdminTrace(event.target.checked)} />
            <span className="text-sm">Enabled</span>
          </label>
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Require Structured Proposals" help="Forces proposal payloads to follow structured schema fields." />
          <label className="inline-flex items-center gap-2 rounded-lg border border-ink/20 px-3 py-2">
            <input
              type="checkbox"
              checked={requireStructuredProposals}
              onChange={(event) => setRequireStructuredProposals(event.target.checked)}
            />
            <span className="text-sm">Enabled</span>
          </label>
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Allow Title Tradeoffs" help="Lets negotiation include title-level tradeoff options." />
          <label className="inline-flex items-center gap-2 rounded-lg border border-ink/20 px-3 py-2">
            <input type="checkbox" checked={allowTitleTradeoffs} onChange={(event) => setAllowTitleTradeoffs(event.target.checked)} />
            <span className="text-sm">Enabled</span>
          </label>
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Allow Equity Tradeoffs" help="Lets negotiation include equity mix tradeoffs." />
          <label className="inline-flex items-center gap-2 rounded-lg border border-ink/20 px-3 py-2">
            <input type="checkbox" checked={allowEquityTradeoffs} onChange={(event) => setAllowEquityTradeoffs(event.target.checked)} />
            <span className="text-sm">Enabled</span>
          </label>
        </div>

        <div className="grid gap-2">
          <FieldLabel label="Allow Review Cycle Tradeoffs" help="Lets negotiation use timeline/review-cycle compromises." />
          <label className="inline-flex items-center gap-2 rounded-lg border border-ink/20 px-3 py-2">
            <input
              type="checkbox"
              checked={allowReviewCycleTradeoffs}
              onChange={(event) => setAllowReviewCycleTradeoffs(event.target.checked)}
            />
            <span className="text-sm">Enabled</span>
          </label>
        </div>

        <p className="text-xs text-slate lg:col-span-2">
          Higher temperatures increase stochastic movement during negotiation rounds, which can produce slightly different outcomes across runs.
        </p>

        <button
          className="inline-flex w-fit rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper"
          onClick={onCreate}
          disabled={createRunConfig.isPending}
          type="button"
        >
          {createRunConfig.isPending ? "Creating..." : "Create Run Config"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink text-paper">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Case</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-3 text-slate" colSpan={5}>
                  Loading run configs...
                </td>
              </tr>
            ) : (
              (runConfigs ?? []).map((config) => {
                const providerValue = typeof config.config_json.provider === "string" ? config.config_json.provider : "-";
                const modelValue = typeof config.config_json.model_name === "string" ? config.config_json.model_name : "-";
                return (
                  <tr key={config.id} className="border-t border-ink/10">
                    <td className="px-4 py-3">{config.name}</td>
                    <td className="px-4 py-3">{caseTitleMap.get(config.case_id) ?? config.case_id}</td>
                    <td className="px-4 py-3">{providerValue}</td>
                    <td className="px-4 py-3">{modelValue}</td>
                    <td className="px-4 py-3">{new Date(config.created_at).toLocaleString()}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
