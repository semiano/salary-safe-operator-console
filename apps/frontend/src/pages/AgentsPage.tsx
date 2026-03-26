import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost, apiPut } from "../api/client";
import type { PromptSetSummary } from "../types/api";

type PromptSetUpdatePayload = {
  name?: string;
  version?: string;
  description?: string | null;
  candidate_rep_prompt?: string;
  company_rep_prompt?: string;
  arbitrator_prompt?: string;
  intake_prompt?: string;
  policy_prompt?: string;
};

type PromptField =
  | "intake_prompt"
  | "candidate_rep_prompt"
  | "company_rep_prompt"
  | "policy_prompt"
  | "arbitrator_prompt";

const AGENT_DESCRIPTIONS = [
  {
    name: "IntakeNormalizerAgent",
    icon: "IN",
    promptField: "intake_prompt" as PromptField,
    purpose: "Transforms raw candidate/company inputs into normalized negotiation facts.",
  },
  {
    name: "CandidateRepAgent",
    icon: "CA",
    promptField: "candidate_rep_prompt" as PromptField,
    purpose: "Advocates candidate outcomes with structured proposals and rationales.",
  },
  {
    name: "CompanyRepAgent",
    icon: "CO",
    promptField: "company_rep_prompt" as PromptField,
    purpose: "Protects company budget/equity constraints while seeking feasible agreement.",
  },
  {
    name: "PolicyGuardAgent",
    icon: "PG",
    promptField: "policy_prompt" as PromptField,
    purpose: "Reviews confidentiality, compliance, and policy safety each major phase.",
  },
  {
    name: "ArbitratorAgent",
    icon: "AR",
    promptField: "arbitrator_prompt" as PromptField,
    purpose: "Controls round flow, resolves deadlock risk, and produces final synthesis.",
  },
];

export function AgentsPage() {
  const queryClient = useQueryClient();

  const { data: promptSets, isLoading } = useQuery({
    queryKey: ["prompt-sets-admin"],
    queryFn: () => apiGet<PromptSetSummary[]>("/prompts"),
  });

  const [selectedPromptSetId, setSelectedPromptSetId] = useState("");
  const selectedPromptSet = useMemo(
    () => (promptSets ?? []).find((item) => item.id === selectedPromptSetId) ?? null,
    [promptSets, selectedPromptSetId],
  );

  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [intakePrompt, setIntakePrompt] = useState("");
  const [candidatePrompt, setCandidatePrompt] = useState("");
  const [companyPrompt, setCompanyPrompt] = useState("");
  const [policyPrompt, setPolicyPrompt] = useState("");
  const [arbitratorPrompt, setArbitratorPrompt] = useState("");
  const [selectedAgentName, setSelectedAgentName] = useState(AGENT_DESCRIPTIONS[0].name);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedAgent = useMemo(
    () => AGENT_DESCRIPTIONS.find((agent) => agent.name === selectedAgentName) ?? AGENT_DESCRIPTIONS[0],
    [selectedAgentName],
  );

  function getPromptByField(field: PromptField): string {
    if (field === "intake_prompt") return intakePrompt;
    if (field === "candidate_rep_prompt") return candidatePrompt;
    if (field === "company_rep_prompt") return companyPrompt;
    if (field === "policy_prompt") return policyPrompt;
    return arbitratorPrompt;
  }

  function setPromptByField(field: PromptField, value: string): void {
    if (field === "intake_prompt") {
      setIntakePrompt(value);
      return;
    }
    if (field === "candidate_rep_prompt") {
      setCandidatePrompt(value);
      return;
    }
    if (field === "company_rep_prompt") {
      setCompanyPrompt(value);
      return;
    }
    if (field === "policy_prompt") {
      setPolicyPrompt(value);
      return;
    }
    setArbitratorPrompt(value);
  }

  useEffect(() => {
    if (!selectedPromptSetId && (promptSets ?? []).length > 0) {
      setSelectedPromptSetId(promptSets![0].id);
    }
  }, [selectedPromptSetId, promptSets]);

  useEffect(() => {
    if (!selectedPromptSet) {
      return;
    }
    setName(selectedPromptSet.name);
    setVersion(selectedPromptSet.version);
    setDescription(selectedPromptSet.description ?? "");
    setIntakePrompt(selectedPromptSet.intake_prompt);
    setCandidatePrompt(selectedPromptSet.candidate_rep_prompt);
    setCompanyPrompt(selectedPromptSet.company_rep_prompt);
    setPolicyPrompt(selectedPromptSet.policy_prompt);
    setArbitratorPrompt(selectedPromptSet.arbitrator_prompt);
  }, [selectedPromptSet]);

  const updatePromptSet = useMutation({
    mutationFn: (payload: PromptSetUpdatePayload) =>
      apiPut<PromptSetSummary>(`/prompts/${selectedPromptSetId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-sets-admin"] });
    },
  });

  const createPromptSet = useMutation({
    mutationFn: () =>
      apiPost<PromptSetSummary>("/prompts", {
        name,
        version,
        description: description || null,
        intake_prompt: intakePrompt,
        candidate_rep_prompt: candidatePrompt,
        company_rep_prompt: companyPrompt,
        policy_prompt: policyPrompt,
        arbitrator_prompt: arbitratorPrompt,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-sets-admin"] });
    },
  });

  async function handleSavePromptSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPromptSetId) {
      setErrorMessage("Select a prompt set first.");
      return;
    }

    try {
      setErrorMessage(null);
      setSuccessMessage(null);
      await updatePromptSet.mutateAsync({
        name,
        version,
        description: description || null,
        intake_prompt: intakePrompt,
        candidate_rep_prompt: candidatePrompt,
        company_rep_prompt: companyPrompt,
        policy_prompt: policyPrompt,
        arbitrator_prompt: arbitratorPrompt,
      });
      setSuccessMessage("Prompt set updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update prompt set.");
    }
  }

  async function handleCreatePromptSetFromCurrent() {
    try {
      setErrorMessage(null);
      setSuccessMessage(null);
      const created = await createPromptSet.mutateAsync();
      setSelectedPromptSetId(created.id);
      setSuccessMessage("New prompt set created.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create prompt set.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Agents</h2>
      </div>

      {errorMessage ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p> : null}
      {successMessage ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</p> : null}

      <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg">Agent Overview</h3>
        <p className="text-sm text-slate">
          SalarySafe currently runs a 5-agent negotiation model. Intake normalizes facts, candidate/company agents negotiate,
          policy guard checks compliance, and arbitrator controls rounds and final synthesis. Select an agent card to edit its
          system prompt.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {AGENT_DESCRIPTIONS.map((agent) => (
            <button
              key={agent.name}
              type="button"
              onClick={() => setSelectedAgentName(agent.name)}
              className={`flex h-52 flex-col justify-between rounded-2xl border p-4 text-left shadow-sm transition ${
                selectedAgentName === agent.name
                  ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                  : "border-ink/10 bg-white hover:border-ink/25"
              }`}
            >
              <div className="space-y-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ink/20 bg-paper text-xs font-semibold">
                  {agent.icon}
                </div>
                <p className="font-medium leading-snug">{agent.name}</p>
                <p className="text-xs text-slate">{agent.purpose}</p>
              </div>
              <p className="text-xs font-medium text-accent">
                {selectedAgentName === agent.name ? "Editing this prompt" : "Click to edit prompt"}
              </p>
            </button>
          ))}
        </div>
      </div>

      <form className="space-y-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm" onSubmit={handleSavePromptSet}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <label className="text-xs font-medium">Active Prompt Set</label>
            <select
              className="rounded-lg border border-ink/20 px-3 py-2 text-sm"
              value={selectedPromptSetId}
              onChange={(event) => setSelectedPromptSetId(event.target.value)}
              disabled={isLoading}
            >
              {(promptSets ?? []).map((setItem) => (
                <option key={setItem.id} value={setItem.id}>
                  {setItem.name} v{setItem.version}
                </option>
              ))}
            </select>
          </div>

          <button
            className="rounded-full border border-ink/20 px-4 py-2 text-xs"
            type="button"
            onClick={handleCreatePromptSetFromCurrent}
            disabled={createPromptSet.isPending}
          >
            {createPromptSet.isPending ? "Creating..." : "Create New Prompt Set From Current"}
          </button>
        </div>

        <h3 className="font-display text-lg">System Prompts</h3>
        <p className="text-xs text-slate">
          Prompt set names are data labels only. If you see "PoC Baseline", that is simply the seeded set name and can be edited here.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Name</label>
            <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Version</label>
            <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={version} onChange={(event) => setVersion(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Description</label>
            <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-ink/10 bg-paper p-4">
          <p className="text-xs font-medium text-slate">Selected Agent</p>
          <p className="font-medium">{selectedAgent.name}</p>
          <label className="mb-1 mt-3 block text-xs font-medium">System Prompt</label>
          <textarea
            className="min-h-56 w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-xs"
            value={getPromptByField(selectedAgent.promptField)}
            onChange={(event) => setPromptByField(selectedAgent.promptField, event.target.value)}
          />
        </div>

        <button
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper"
          type="submit"
          disabled={updatePromptSet.isPending || !selectedPromptSetId}
        >
          {updatePromptSet.isPending ? "Saving..." : "Save Prompt Set"}
        </button>
      </form>

      <div className="space-y-3 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg">Generalized Agent Flow</h3>
        <p className="text-xs text-slate">
          Runtime tuning is managed in Run Configs. This diagram shows the high-level process: normalize input, negotiate in rounds,
          apply policy checks, and synthesize outcomes.
        </p>

        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-paper p-4">
          <svg viewBox="0 0 980 360" className="min-w-[880px]" role="img" aria-label="SalarySafe multi-agent flow diagram">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#1f2937" />
              </marker>
            </defs>

            <rect x="30" y="120" width="170" height="88" rx="14" fill="#ffffff" stroke="#cbd5e1" />
            <text x="115" y="150" textAnchor="middle" fontSize="13" fill="#0f172a">IntakeNormalizer</text>
            <text x="115" y="170" textAnchor="middle" fontSize="11" fill="#475569">Standardize facts</text>

            <rect x="280" y="42" width="180" height="88" rx="14" fill="#ffffff" stroke="#cbd5e1" />
            <text x="370" y="73" textAnchor="middle" fontSize="13" fill="#0f172a">CandidateRep</text>
            <text x="370" y="93" textAnchor="middle" fontSize="11" fill="#475569">Proposals + asks</text>

            <rect x="280" y="228" width="180" height="88" rx="14" fill="#ffffff" stroke="#cbd5e1" />
            <text x="370" y="258" textAnchor="middle" fontSize="13" fill="#0f172a">CompanyRep</text>
            <text x="370" y="278" textAnchor="middle" fontSize="11" fill="#475569">Constraints + offers</text>

            <rect x="560" y="42" width="180" height="88" rx="14" fill="#ffffff" stroke="#cbd5e1" />
            <text x="650" y="73" textAnchor="middle" fontSize="13" fill="#0f172a">PolicyGuard</text>
            <text x="650" y="93" textAnchor="middle" fontSize="11" fill="#475569">Compliance checks</text>

            <rect x="560" y="228" width="180" height="88" rx="14" fill="#ffffff" stroke="#cbd5e1" />
            <text x="650" y="258" textAnchor="middle" fontSize="13" fill="#0f172a">Arbitrator</text>
            <text x="650" y="278" textAnchor="middle" fontSize="11" fill="#475569">Round control + synthesis</text>

            <rect x="800" y="120" width="150" height="88" rx="14" fill="#ffffff" stroke="#cbd5e1" />
            <text x="875" y="150" textAnchor="middle" fontSize="13" fill="#0f172a">Final Report</text>
            <text x="875" y="170" textAnchor="middle" fontSize="11" fill="#475569">Package + rationale</text>

            <path d="M 200 164 L 280 86" stroke="#1f2937" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
            <path d="M 200 164 L 280 272" stroke="#1f2937" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
            <path d="M 460 86 L 560 86" stroke="#1f2937" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
            <path d="M 460 272 L 560 272" stroke="#1f2937" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
            <path d="M 650 130 L 650 228" stroke="#1f2937" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
            <path d="M 740 272 L 800 164" stroke="#1f2937" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />

            <text x="507" y="188" textAnchor="middle" fontSize="11" fill="#334155">iterative negotiation rounds</text>
          </svg>
        </div>
      </div>
    </section>
  );
}
