import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import {
  useCases,
  useCreateBaselineRunConfig,
  useCreateCase,
  usePreviewCaseFromPrompt,
  useRandomCasePrompt,
} from "../hooks/useCases";
import { apiGet } from "../api/client";
import { extractCaseMeta } from "../utils/caseMeta";
import { safeParseJson } from "../utils/json";
import type { RunSummary } from "../types/api";

type JsonValidation = {
  valid: boolean;
  error: string | null;
  value: Record<string, unknown>;
};

type ManualTab = "basics" | "candidate" | "company" | "config";

function validateJsonObject(input: string): JsonValidation {
  try {
    return {
      valid: true,
      error: null,
      value: safeParseJson(input),
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid JSON object",
      value: {},
    };
  }
}

function extractRoundsCompleted(run: RunSummary): number {
  const reportMetrics = run.final_report_json?.run_metrics;
  if (
    typeof reportMetrics === "object" &&
    reportMetrics !== null &&
    typeof (reportMetrics as Record<string, unknown>).rounds_completed === "number"
  ) {
    return (reportMetrics as Record<string, number>).rounds_completed;
  }

  if (typeof run.summary_json?.rounds_completed === "number") {
    return run.summary_json.rounds_completed as number;
  }

  return 0;
}

export function CasesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useCases();
  const createCase = useCreateCase();
  const createRunConfig = useCreateBaselineRunConfig();
  const previewFromPrompt = usePreviewCaseFromPrompt();
  const randomCasePrompt = useRandomCasePrompt();

  const [manualTab, setManualTab] = useState<ManualTab>("basics");
  const [title, setTitle] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [responsibilitiesText, setResponsibilitiesText] = useState("");
  const [status, setStatus] = useState("ready");
  const [jurisdiction, setJurisdiction] = useState("US");
  const [currency, setCurrency] = useState("USD");
  const [candidateTargetBase, setCandidateTargetBase] = useState("");
  const [candidateTargetBonusPct, setCandidateTargetBonusPct] = useState("");
  const [candidateTargetEquityValue, setCandidateTargetEquityValue] = useState("");
  const [candidateWalkawayBase, setCandidateWalkawayBase] = useState("");
  const [candidateStrengthsText, setCandidateStrengthsText] = useState("");
  const [candidateConstraintsText, setCandidateConstraintsText] = useState("");
  const [companyRoleScope, setCompanyRoleScope] = useState("");
  const [companyBudgetContext, setCompanyBudgetContext] = useState("");
  const [companyBudgetFloor, setCompanyBudgetFloor] = useState("");
  const [companyBudgetTarget, setCompanyBudgetTarget] = useState("");
  const [companyBudgetCeiling, setCompanyBudgetCeiling] = useState("");
  const [companyConstraintsText, setCompanyConstraintsText] = useState("");
  const [configProvider, setConfigProvider] = useState<"openai" | "azure_openai">("openai");
  const [configModelName, setConfigModelName] = useState("gpt-5.4");
  const [nlPrompt, setNlPrompt] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftJobTitle, setDraftJobTitle] = useState("");
  const [draftJobDescription, setDraftJobDescription] = useState("");
  const [draftResponsibilitiesText, setDraftResponsibilitiesText] = useState("");
  const [draftStatus, setDraftStatus] = useState("ready");
  const [draftJurisdiction, setDraftJurisdiction] = useState("US");
  const [draftCurrency, setDraftCurrency] = useState("USD");
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftCandidateConfidentialJson, setDraftCandidateConfidentialJson] = useState("{}");
  const [draftCompanyPublicJson, setDraftCompanyPublicJson] = useState("{}");
  const [draftCompanyConfidentialJson, setDraftCompanyConfidentialJson] = useState("{}");
  const [createError, setCreateError] = useState<string | null>(null);

  const caseIds = (data ?? []).map((item) => item.id);
  const { data: caseRunsMap } = useQuery({
    queryKey: ["cases-run-stats", caseIds.join("|")],
    queryFn: async () => {
      const entries = await Promise.all(
        caseIds.map(async (caseId) => {
          const runs = await apiGet<RunSummary[]>(`/cases/${caseId}/runs`);
          return [caseId, runs] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, RunSummary[]>;
    },
    enabled: caseIds.length > 0,
  });

  const candidateConfidentialValidation = validateJsonObject(draftCandidateConfidentialJson);
  const companyPublicValidation = validateJsonObject(draftCompanyPublicJson);
  const companyConfidentialValidation = validateJsonObject(draftCompanyConfidentialJson);
  const draftJsonValid =
    candidateConfidentialValidation.valid && companyPublicValidation.valid && companyConfidentialValidation.valid;

  function parseNumber(input: string): number | undefined {
    const normalized = input.trim();
    if (!normalized) return undefined;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : undefined;
  }

  function parseLines(input: string): string[] {
    return input
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  async function handleCreateCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    try {
      const responsibilities = parseLines(responsibilitiesText);
      const strengths = parseLines(candidateStrengthsText);
      const candidateConstraints = parseLines(candidateConstraintsText);
      const companyConstraints = parseLines(companyConstraintsText);

      const candidatePublicPayload: Record<string, unknown> = {
        job_title: jobTitle || title,
        job_description: jobDescription,
        responsibilities,
        strengths,
      };
      const desiredCompensation: Record<string, unknown> = {};
      const baseTarget = parseNumber(candidateTargetBase);
      const bonusTarget = parseNumber(candidateTargetBonusPct);
      const equityTarget = parseNumber(candidateTargetEquityValue);
      if (baseTarget !== undefined) desiredCompensation.base_salary_target = baseTarget;
      if (bonusTarget !== undefined) desiredCompensation.bonus_pct_target = bonusTarget;
      if (equityTarget !== undefined) desiredCompensation.equity_value_target = equityTarget;
      if (Object.keys(desiredCompensation).length > 0) candidatePublicPayload.desired_compensation = desiredCompensation;

      const candidateConfidentialPayload: Record<string, unknown> = { constraints: candidateConstraints };
      const walkaway = parseNumber(candidateWalkawayBase);
      if (walkaway !== undefined) candidateConfidentialPayload.walkaway_base_salary = walkaway;

      const companyPublicPayload: Record<string, unknown> = {
        role_scope: companyRoleScope || jobTitle || title,
        budget_context: companyBudgetContext || "Not provided",
      };
      const companyConfidentialPayload: Record<string, unknown> = { constraints: companyConstraints };
      const floor = parseNumber(companyBudgetFloor);
      const target = parseNumber(companyBudgetTarget);
      const ceiling = parseNumber(companyBudgetCeiling);
      if (floor !== undefined) companyConfidentialPayload.budget_floor = floor;
      if (target !== undefined) companyConfidentialPayload.budget_target = target;
      if (ceiling !== undefined) companyConfidentialPayload.budget_ceiling = ceiling;

      const created = await createCase.mutateAsync({
        title,
        description: jobDescription || null,
        status,
        jurisdiction,
        currency,
        candidate: {
          public_payload: candidatePublicPayload,
          confidential_payload: candidateConfidentialPayload,
        },
        company: {
          public_payload: companyPublicPayload,
          confidential_payload: companyConfidentialPayload,
        },
      });

      await createRunConfig.mutateAsync({ caseId: created.id, provider: configProvider, modelName: configModelName });
      navigate(`/cases/${created.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create case.");
    }
  }

  async function handleCreateFromPrompt() {
    if (!nlPrompt.trim()) {
      setCreateError("Please provide a natural-language case prompt.");
      return;
    }
    setCreateError(null);
    try {
      const draft = await previewFromPrompt.mutateAsync({ prompt: nlPrompt, jurisdiction: "US", currency: "USD" });
      const candidatePublic = draft.candidate.public_payload ?? {};
      const companyPublic = draft.company.public_payload ?? {};
      const responsibilities = Array.isArray(candidatePublic.responsibilities)
        ? candidatePublic.responsibilities.filter((item): item is string => typeof item === "string")
        : [];
      setDraftTitle(draft.title);
      setDraftStatus(draft.status || "ready");
      setDraftJurisdiction(draft.jurisdiction || "US");
      setDraftCurrency(draft.currency || "USD");
      setDraftJobTitle(typeof candidatePublic.job_title === "string" ? candidatePublic.job_title : draft.title);
      setDraftJobDescription(
        typeof candidatePublic.job_description === "string"
          ? candidatePublic.job_description
          : typeof draft.description === "string"
            ? draft.description
            : "",
      );
      setDraftResponsibilitiesText(responsibilities.join("\n"));
      setDraftCandidateConfidentialJson(JSON.stringify(draft.candidate.confidential_payload ?? {}, null, 2));
      setDraftCompanyPublicJson(JSON.stringify(companyPublic, null, 2));
      setDraftCompanyConfidentialJson(JSON.stringify(draft.company.confidential_payload ?? {}, null, 2));
      setDraftOpen(true);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to generate case from prompt.");
    }
  }

  async function handleRandomGeneratePrompt() {
    setCreateError(null);
    try {
      const result = await randomCasePrompt.mutateAsync();
      setNlPrompt(result.prompt);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to generate random case prompt.");
    }
  }

  async function handleCreateFromDraft() {
    if (!draftJsonValid) {
      setCreateError("Fix invalid JSON fields in the draft before creating the case.");
      return;
    }
    try {
      setCreateError(null);
      const responsibilities = parseLines(draftResponsibilitiesText);
      const created = await createCase.mutateAsync({
        title: draftTitle,
        description: draftJobDescription || null,
        status: draftStatus || "ready",
        jurisdiction: draftJurisdiction || "US",
        currency: (draftCurrency || "USD").toUpperCase(),
        candidate: {
          public_payload: {
            job_title: draftJobTitle || draftTitle,
            job_description: draftJobDescription,
            responsibilities,
          },
          confidential_payload: candidateConfidentialValidation.value,
        },
        company: {
          public_payload: companyPublicValidation.value,
          confidential_payload: companyConfidentialValidation.value,
        },
      });
      await createRunConfig.mutateAsync({ caseId: created.id, provider: configProvider, modelName: configModelName });
      setDraftOpen(false);
      setNlPrompt("");
      navigate(`/cases/${created.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create case from draft.");
    }
  }

  function handleFormatCandidateConfidentialJson() {
    if (!candidateConfidentialValidation.valid) {
      setCreateError("Cannot format Candidate Confidential JSON until it is valid.");
      return;
    }
    setCreateError(null);
    setDraftCandidateConfidentialJson(JSON.stringify(candidateConfidentialValidation.value, null, 2));
  }

  function handleFormatCompanyPublicJson() {
    if (!companyPublicValidation.valid) {
      setCreateError("Cannot format Company Public JSON until it is valid.");
      return;
    }
    setCreateError(null);
    setDraftCompanyPublicJson(JSON.stringify(companyPublicValidation.value, null, 2));
  }

  function handleFormatCompanyConfidentialJson() {
    if (!companyConfidentialValidation.valid) {
      setCreateError("Cannot format Company Confidential JSON until it is valid.");
      return;
    }
    setCreateError(null);
    setDraftCompanyConfidentialJson(JSON.stringify(companyConfidentialValidation.value, null, 2));
  }

  if (isLoading) {
    return <p className="text-slate">Loading cases...</p>;
  }

  if (isError) {
    return <p className="text-red-700">Unable to load cases.</p>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Cases</h2>
      </div>

      {createError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{createError}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <form className="space-y-3 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm" onSubmit={handleCreateCase}>
          <h3 className="font-display text-lg">Create New Case</h3>
          <p className="text-xs text-slate">Tabbed intake captures candidate/company info and auto-creates a run config.</p>
          <div className="flex flex-wrap gap-2">
            {([
              ["basics", "Case Basics"],
              ["candidate", "Candidate"],
              ["company", "Company"],
              ["config", "Run Config"],
            ] as Array<[ManualTab, string]>).map(([tab, label]) => (
              <button
                key={tab}
                className={`rounded-full px-3 py-1.5 text-xs ${manualTab === tab ? "bg-ink text-paper" : "border border-ink/20"}`}
                type="button"
                onClick={() => setManualTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>

          {manualTab === "basics" ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Case Title</label>
                <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" required value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Job Title</label>
                <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Job Description</label>
                <textarea className="min-h-20 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Responsibilities (one per line)</label>
                <textarea className="min-h-20 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={responsibilitiesText} onChange={(event) => setResponsibilitiesText(event.target.value)} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Status</label>
                  <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Jurisdiction</label>
                  <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Currency</label>
                  <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={currency} onChange={(event) => setCurrency(event.target.value)} />
                </div>
              </div>
            </div>
          ) : null}

          {manualTab === "candidate" ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">Candidate Target Base Salary</label>
                  <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={candidateTargetBase} onChange={(event) => setCandidateTargetBase(event.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Candidate Target Bonus %</label>
                  <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={candidateTargetBonusPct} onChange={(event) => setCandidateTargetBonusPct(event.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">Candidate Target Equity Value</label>
                  <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={candidateTargetEquityValue} onChange={(event) => setCandidateTargetEquityValue(event.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Candidate Walkaway Base Salary</label>
                  <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={candidateWalkawayBase} onChange={(event) => setCandidateWalkawayBase(event.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Candidate Strengths (one per line)</label>
                <textarea className="min-h-20 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={candidateStrengthsText} onChange={(event) => setCandidateStrengthsText(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Candidate Constraints (one per line)</label>
                <textarea className="min-h-20 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={candidateConstraintsText} onChange={(event) => setCandidateConstraintsText(event.target.value)} />
              </div>
            </div>
          ) : null}

          {manualTab === "company" ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Company Role Scope</label>
                <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={companyRoleScope} onChange={(event) => setCompanyRoleScope(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Company Budget Context</label>
                <textarea className="min-h-20 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={companyBudgetContext} onChange={(event) => setCompanyBudgetContext(event.target.value)} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Budget Floor</label>
                  <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={companyBudgetFloor} onChange={(event) => setCompanyBudgetFloor(event.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Budget Target</label>
                  <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={companyBudgetTarget} onChange={(event) => setCompanyBudgetTarget(event.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Budget Ceiling</label>
                  <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={companyBudgetCeiling} onChange={(event) => setCompanyBudgetCeiling(event.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Company Constraints (one per line)</label>
                <textarea className="min-h-20 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={companyConstraintsText} onChange={(event) => setCompanyConstraintsText(event.target.value)} />
              </div>
            </div>
          ) : null}

          {manualTab === "config" ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Provider</label>
                <select className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={configProvider} onChange={(event) => setConfigProvider(event.target.value as "openai" | "azure_openai")}>
                  <option value="openai">openai</option>
                  <option value="azure_openai">azure_openai</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Model Name</label>
                <input className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" value={configModelName} onChange={(event) => setConfigModelName(event.target.value)} />
              </div>
            </div>
          ) : null}

          <button className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper" type="submit" disabled={createCase.isPending || createRunConfig.isPending}>
            {createCase.isPending || createRunConfig.isPending ? "Creating..." : "Create Ready-to-Run Case"}
          </button>
        </form>

        <section className="space-y-3 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="font-display text-lg">Create From Natural Language</h3>
          <p className="text-xs text-slate">
            Describe role, responsibilities, candidate expectations, and company constraints. The system will build a
            structured case draft.
          </p>

          <textarea
            className="min-h-48 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
            value={nlPrompt}
            onChange={(event) => setNlPrompt(event.target.value)}
            placeholder="Example: Hiring a Senior Backend Engineer in NYC. Candidate targets $220k base with sign-on and flexibility. Company budget ceiling is $205k base, can trade with bonus and equity."
          />

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
              type="button"
              disabled={previewFromPrompt.isPending}
              onClick={handleCreateFromPrompt}
            >
              {previewFromPrompt.isPending ? "Generating Draft..." : "Generate Draft"}
            </button>
            <button
              className="rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 px-4 py-2 text-sm font-semibold text-white shadow-sm"
              type="button"
              disabled={randomCasePrompt.isPending}
              onClick={handleRandomGeneratePrompt}
            >
              {randomCasePrompt.isPending ? "Generating..." : "🪄 Random Generate Draft"}
            </button>
          </div>
        </section>
      </div>

      {draftOpen ? (
        <section className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl">Review Generated Draft</h3>
                <p className="text-sm text-slate">Edit fields below, then create the case.</p>
              </div>
              <button
                className="rounded-full border border-ink/20 px-3 py-1 text-xs"
                type="button"
                onClick={() => setDraftOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Title</label>
                <input
                  className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Job Title</label>
                <input
                  className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                  value={draftJobTitle}
                  onChange={(event) => setDraftJobTitle(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Status</label>
                <input
                  className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                  value={draftStatus}
                  onChange={(event) => setDraftStatus(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Jurisdiction</label>
                <input
                  className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                  value={draftJurisdiction}
                  onChange={(event) => setDraftJurisdiction(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Currency</label>
                <input
                  className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                  value={draftCurrency}
                  onChange={(event) => setDraftCurrency(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Job Description</label>
              <textarea
                className="min-h-20 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                value={draftJobDescription}
                onChange={(event) => setDraftJobDescription(event.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Responsibilities (one per line)</label>
              <textarea
                className="min-h-20 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                value={draftResponsibilitiesText}
                onChange={(event) => setDraftResponsibilitiesText(event.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium">Candidate Confidential JSON</label>
                <button
                  className="rounded-full border border-ink/20 px-3 py-1 text-[11px]"
                  type="button"
                  onClick={handleFormatCandidateConfidentialJson}
                  disabled={!candidateConfidentialValidation.valid}
                >
                  Format JSON
                </button>
              </div>
              <p className={`mb-1 text-[11px] ${candidateConfidentialValidation.valid ? "text-green-700" : "text-red-700"}`}>
                {candidateConfidentialValidation.valid
                  ? "Valid JSON object"
                  : `Invalid JSON: ${candidateConfidentialValidation.error}`}
              </p>
              <textarea
                className="min-h-24 w-full rounded-lg border border-ink/20 px-3 py-2 font-mono text-xs"
                value={draftCandidateConfidentialJson}
                onChange={(event) => setDraftCandidateConfidentialJson(event.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium">Company Public JSON</label>
                <button
                  className="rounded-full border border-ink/20 px-3 py-1 text-[11px]"
                  type="button"
                  onClick={handleFormatCompanyPublicJson}
                  disabled={!companyPublicValidation.valid}
                >
                  Format JSON
                </button>
              </div>
              <p className={`mb-1 text-[11px] ${companyPublicValidation.valid ? "text-green-700" : "text-red-700"}`}>
                {companyPublicValidation.valid ? "Valid JSON object" : `Invalid JSON: ${companyPublicValidation.error}`}
              </p>
              <textarea
                className="min-h-24 w-full rounded-lg border border-ink/20 px-3 py-2 font-mono text-xs"
                value={draftCompanyPublicJson}
                onChange={(event) => setDraftCompanyPublicJson(event.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium">Company Confidential JSON</label>
                <button
                  className="rounded-full border border-ink/20 px-3 py-1 text-[11px]"
                  type="button"
                  onClick={handleFormatCompanyConfidentialJson}
                  disabled={!companyConfidentialValidation.valid}
                >
                  Format JSON
                </button>
              </div>
              <p
                className={`mb-1 text-[11px] ${companyConfidentialValidation.valid ? "text-green-700" : "text-red-700"}`}
              >
                {companyConfidentialValidation.valid
                  ? "Valid JSON object"
                  : `Invalid JSON: ${companyConfidentialValidation.error}`}
              </p>
              <textarea
                className="min-h-24 w-full rounded-lg border border-ink/20 px-3 py-2 font-mono text-xs"
                value={draftCompanyConfidentialJson}
                onChange={(event) => setDraftCompanyConfidentialJson(event.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <button
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper"
                disabled={createCase.isPending || !draftJsonValid}
                type="button"
                onClick={handleCreateFromDraft}
              >
                {createCase.isPending ? "Creating..." : "Create Case From Draft"}
              </button>
              <button
                className="rounded-full border border-ink/20 px-4 py-2 text-sm"
                type="button"
                onClick={() => setDraftOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink text-paper">
            <tr>
              <th className="px-4 py-3 font-medium">Case Title</th>
              <th className="px-4 py-3 font-medium">Job Title</th>
              <th className="px-4 py-3 font-medium">Job Description</th>
              <th className="px-4 py-3 font-medium">Responsibilities</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Runs / Rounds</th>
              <th className="px-4 py-3 font-medium">Currency</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((item) => {
              const meta = extractCaseMeta(item);
              const runs = caseRunsMap?.[item.id] ?? [];
              const totalRounds = runs.reduce((sum, run) => sum + extractRoundsCompleted(run), 0);
              return (
                <tr key={item.id} className="border-t border-ink/10 align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span>{item.title}</span>
                      <div className="group relative">
                        <button
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-ink/20 text-[11px] font-semibold text-slate"
                          type="button"
                        >
                          i
                        </button>
                        <div className="pointer-events-none invisible absolute left-6 top-0 z-20 w-96 rounded-xl border border-ink/10 bg-white p-3 text-xs text-ink shadow-lg group-hover:visible">
                          <p className="mb-2 font-medium">Full Case Details</p>
                          <div className="space-y-1 text-slate">
                            <p>
                              <span className="font-medium text-ink">Title:</span> {item.title}
                            </p>
                            <p>
                              <span className="font-medium text-ink">Status:</span> {item.status}
                            </p>
                            <p>
                              <span className="font-medium text-ink">Jurisdiction:</span> {item.jurisdiction ?? "Not provided"}
                            </p>
                            <p>
                              <span className="font-medium text-ink">Currency:</span> {item.currency}
                            </p>
                            <p>
                              <span className="font-medium text-ink">Description:</span> {item.description ?? meta.jobDescription}
                            </p>
                            <p>
                              <span className="font-medium text-ink">Job Title:</span> {meta.jobTitle}
                            </p>
                            <p>
                              <span className="font-medium text-ink">Responsibilities:</span>{" "}
                              {meta.responsibilities.length > 0 ? meta.responsibilities.join(", ") : "Not provided"}
                            </p>
                            <p>
                              <span className="font-medium text-ink">Case ID:</span> {item.id}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{meta.jobTitle}</td>
                  <td className="max-w-xs px-4 py-3 text-xs text-slate">{meta.jobDescription}</td>
                  <td className="max-w-xs px-4 py-3 text-xs text-slate">
                    {meta.responsibilities.length > 0 ? meta.responsibilities.join(", ") : "Not provided"}
                  </td>
                  <td className="px-4 py-3">{item.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>
                        {runs.length} / {totalRounds}
                      </span>
                      <div className="group relative">
                        <button
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-ink/20 text-[11px] font-semibold text-slate"
                          type="button"
                        >
                          i
                        </button>
                        <div className="pointer-events-none invisible absolute left-6 top-0 z-20 w-72 rounded-xl border border-ink/10 bg-white p-3 text-xs text-ink shadow-lg group-hover:visible">
                          <p className="mb-2 font-medium">Case Run Summary</p>
                          {runs.length === 0 ? (
                            <p className="text-slate">No runs created yet.</p>
                          ) : (
                            <div className="space-y-1">
                              {runs.slice(0, 5).map((run) => (
                                <p key={run.id} className="text-slate">
                                  {run.status} | rounds: {extractRoundsCompleted(run)} | {new Date(run.created_at).toLocaleString()}
                                </p>
                              ))}
                              {runs.length > 5 ? <p className="text-slate">+{runs.length - 5} more runs</p> : null}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{item.currency}</td>
                  <td className="px-4 py-3">{new Date(item.updated_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Link className="font-medium text-accent hover:underline" to={`/cases/${item.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
