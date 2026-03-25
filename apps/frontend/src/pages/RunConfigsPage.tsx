import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { apiGet, apiPost } from "../api/client";
import { useCases } from "../hooks/useCases";
import type { RunConfigSummary } from "../types/api";

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
          conversation_mode: "hybrid_guided_groupchat",
          max_rounds: maxRounds,
          max_turns_per_round: maxTurnsPerRound,
          enable_policy_guard: true,
          enable_admin_trace: true,
          require_structured_proposals: true,
          allow_title_tradeoffs: true,
          allow_equity_tradeoffs: true,
          allow_review_cycle_tradeoffs: true,
          deadlock_repeat_threshold: 2,
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
          <label className="text-sm font-medium">Case</label>
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
          <label className="text-sm font-medium">Config Name</label>
          <input className="rounded-lg border border-ink/20 px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Provider</label>
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
          <label className="text-sm font-medium">Model Name</label>
          <input className="rounded-lg border border-ink/20 px-3 py-2" value={modelName} onChange={(event) => setModelName(event.target.value)} />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Max Rounds</label>
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
          <label className="text-sm font-medium">Max Turns / Round</label>
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
          <label className="text-sm font-medium">Candidate Temp</label>
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
          <label className="text-sm font-medium">Company Temp</label>
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
          <label className="text-sm font-medium">Arbitrator Temp</label>
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
          <label className="text-sm font-medium">Intake Temp</label>
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
          <label className="text-sm font-medium">Policy Temp</label>
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
          <label className="text-sm font-medium">Rerun Count</label>
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
          <label className="text-sm font-medium">Turn Delay (seconds)</label>
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
