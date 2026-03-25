import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  useCreateBaselineRunConfig,
  useCaseDetail,
  useCreateRun,
  usePromptSets,
  useRunConfigs,
  useUpdateCase,
} from "../hooks/useCaseEditor";
import { useCaseRuns } from "../hooks/useRunViews";
import { extractCaseMeta } from "../utils/caseMeta";
import { formatJson, safeParseJson } from "../utils/json";

export function CaseEditorPage() {
  const navigate = useNavigate();
  const { caseId } = useParams();
  const stableCaseId = caseId ?? "";

  const { data: caseDetail, isLoading } = useCaseDetail(stableCaseId);
  const { data: promptSets } = usePromptSets();
  const { data: runConfigs } = useRunConfigs(stableCaseId);
  const { data: caseRuns } = useCaseRuns(stableCaseId);
  const updateCase = useUpdateCase(stableCaseId);
  const createRun = useCreateRun(stableCaseId);
  const createRunConfig = useCreateBaselineRunConfig(stableCaseId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [candidatePublicJson, setCandidatePublicJson] = useState("{}");
  const [candidateConfidentialJson, setCandidateConfidentialJson] = useState("{}");
  const [companyPublicJson, setCompanyPublicJson] = useState("{}");
  const [companyConfidentialJson, setCompanyConfidentialJson] = useState("{}");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [responsibilitiesText, setResponsibilitiesText] = useState("");
  const [selectedPromptSetId, setSelectedPromptSetId] = useState("");
  const [selectedRunConfigId, setSelectedRunConfigId] = useState("");
  const [runConfigProvider, setRunConfigProvider] = useState<"openai" | "azure_openai">("openai");
  const [runConfigModelName, setRunConfigModelName] = useState("gpt-5.4");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasRunConfig = (runConfigs?.length ?? 0) > 0;
  const hasPromptSet = (promptSets?.length ?? 0) > 0;
  const canLaunchRun = hasRunConfig && Boolean(selectedRunConfigId) && hasPromptSet && Boolean(selectedPromptSetId);

  const candidateParty = useMemo(
    () => caseDetail?.parties.find((party) => party.party_type === "candidate"),
    [caseDetail],
  );
  const companyParty = useMemo(
    () => caseDetail?.parties.find((party) => party.party_type === "company"),
    [caseDetail],
  );

  useEffect(() => {
    if (!caseDetail) {
      return;
    }

    setTitle(caseDetail.title);
    setDescription(caseDetail.description ?? "");
    setStatus(caseDetail.status);
    setCandidatePublicJson(formatJson(candidateParty?.public_payload));
    setCandidateConfidentialJson(formatJson(candidateParty?.confidential_payload));
    setCompanyPublicJson(formatJson(companyParty?.public_payload));
    setCompanyConfidentialJson(formatJson(companyParty?.confidential_payload));

    const meta = extractCaseMeta(caseDetail);
    setJobTitle(meta.jobTitle);
    setJobDescription(meta.jobDescription === "Not provided" ? "" : meta.jobDescription);
    setResponsibilitiesText(meta.responsibilities.join("\n"));
  }, [caseDetail, candidateParty, companyParty]);

  useEffect(() => {
    if (!selectedPromptSetId && (promptSets?.length ?? 0) > 0) {
      setSelectedPromptSetId(promptSets?.[0].id ?? "");
    }
  }, [promptSets, selectedPromptSetId]);

  useEffect(() => {
    if (!selectedRunConfigId && (runConfigs?.length ?? 0) > 0) {
      setSelectedRunConfigId(runConfigs?.[0].id ?? "");
    }
  }, [runConfigs, selectedRunConfigId]);

  if (!stableCaseId) {
    return <p className="text-red-700">Missing case id.</p>;
  }

  if (isLoading) {
    return <p className="text-slate">Loading case...</p>;
  }

  async function handleSave() {
    try {
      setErrorMessage(null);

      const candidatePublic = safeParseJson(candidatePublicJson);
      candidatePublic.job_title = jobTitle;
      candidatePublic.job_description = jobDescription;
      candidatePublic.responsibilities = responsibilitiesText
        .split("\n")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      await updateCase.mutateAsync({
        title,
        description,
        status,
        candidate: {
          public_payload: candidatePublic,
          confidential_payload: safeParseJson(candidateConfidentialJson),
        },
        company: {
          public_payload: safeParseJson(companyPublicJson),
          confidential_payload: safeParseJson(companyConfidentialJson),
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save case.");
    }
  }

  async function handleLaunchRun() {
    if (!selectedPromptSetId || !selectedRunConfigId) {
      setErrorMessage("Select both prompt set and run config before launching.");
      return;
    }

    try {
      setErrorMessage(null);
      const run = await createRun.mutateAsync({
        run_config_id: selectedRunConfigId,
        prompt_set_id: selectedPromptSetId,
      });
      navigate(`/runs/${run.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to launch run.");
    }
  }

  async function handleCreateMissingRunConfig() {
    try {
      setErrorMessage(null);
      await createRunConfig.mutateAsync({
        provider: runConfigProvider,
        model_name: runConfigModelName,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create run config.");
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <article className="space-y-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="font-display text-xl">Case Editor</h2>
        <p className="text-sm text-slate">Case id: {caseId}</p>

        {errorMessage ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p> : null}

        <div className="grid gap-3">
          <label className="text-sm font-medium">Title</label>
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">Description</label>
          <textarea
            className="min-h-24 rounded-lg border border-ink/20 px-3 py-2"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">Status</label>
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">Job Title</label>
          <input
            className="rounded-lg border border-ink/20 px-3 py-2"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            placeholder="Senior Software Engineer"
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">Job Description</label>
          <textarea
            className="min-h-24 rounded-lg border border-ink/20 px-3 py-2"
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            placeholder="Role summary and objectives"
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">Responsibilities (one per line)</label>
          <textarea
            className="min-h-24 rounded-lg border border-ink/20 px-3 py-2"
            value={responsibilitiesText}
            onChange={(event) => setResponsibilitiesText(event.target.value)}
            placeholder="Own architecture decisions"
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">Candidate Public Payload (JSON)</label>
          <textarea
            className="min-h-40 rounded-lg border border-ink/20 px-3 py-2 font-mono text-xs"
            value={candidatePublicJson}
            onChange={(event) => setCandidatePublicJson(event.target.value)}
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">Candidate Confidential Payload (JSON)</label>
          <textarea
            className="min-h-40 rounded-lg border border-ink/20 px-3 py-2 font-mono text-xs"
            value={candidateConfidentialJson}
            onChange={(event) => setCandidateConfidentialJson(event.target.value)}
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">Company Public Payload (JSON)</label>
          <textarea
            className="min-h-40 rounded-lg border border-ink/20 px-3 py-2 font-mono text-xs"
            value={companyPublicJson}
            onChange={(event) => setCompanyPublicJson(event.target.value)}
          />
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-medium">Company Confidential Payload (JSON)</label>
          <textarea
            className="min-h-40 rounded-lg border border-ink/20 px-3 py-2 font-mono text-xs"
            value={companyConfidentialJson}
            onChange={(event) => setCompanyConfidentialJson(event.target.value)}
          />
        </div>

        <button
          className="inline-flex w-fit rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper"
          disabled={updateCase.isPending}
          onClick={handleSave}
        >
          {updateCase.isPending ? "Saving..." : "Save Case"}
        </button>
      </article>

      <aside className="space-y-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <h3 className="font-display text-lg">Run Actions</h3>
        <div className="grid gap-2">
          <label className="text-sm font-medium">Prompt Set</label>
          <select
            className="rounded-lg border border-ink/20 px-3 py-2"
            value={selectedPromptSetId}
            onChange={(event) => setSelectedPromptSetId(event.target.value)}
          >
            {(promptSets ?? []).map((promptSet) => (
              <option key={promptSet.id} value={promptSet.id}>
                {promptSet.name} (v{promptSet.version})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Run Config</label>
          <select
            className="rounded-lg border border-ink/20 px-3 py-2"
            value={selectedRunConfigId}
            onChange={(event) => setSelectedRunConfigId(event.target.value)}
          >
            {(runConfigs ?? []).map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}
              </option>
            ))}
          </select>
        </div>

        {(runConfigs?.length ?? 0) === 0 ? (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">No run config found for this case. Create one to enable Launch Run.</p>
            <div className="grid gap-2">
              <label className="text-xs font-medium">Provider</label>
              <select
                className="rounded-lg border border-ink/20 px-3 py-2 text-sm"
                value={runConfigProvider}
                onChange={(event) => setRunConfigProvider(event.target.value as "openai" | "azure_openai")}
              >
                <option value="openai">openai</option>
                <option value="azure_openai">azure_openai</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium">Model Name</label>
              <input
                className="rounded-lg border border-ink/20 px-3 py-2 text-sm"
                value={runConfigModelName}
                onChange={(event) => setRunConfigModelName(event.target.value)}
              />
            </div>
            <button
              className="inline-flex w-fit rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper"
              type="button"
              onClick={handleCreateMissingRunConfig}
              disabled={createRunConfig.isPending}
            >
              {createRunConfig.isPending ? "Creating..." : "Create Baseline Run Config"}
            </button>
          </div>
        ) : null}

        <button
          className="inline-flex rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
          disabled={createRun.isPending || !canLaunchRun}
          onClick={handleLaunchRun}
        >
          {createRun.isPending ? "Launching..." : "Launch Run"}
        </button>
        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${
            canLaunchRun ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {canLaunchRun ? "Ready to Run" : "Setup Required"}
        </span>

        <Link className="inline-flex rounded-full bg-accent px-4 py-2 text-sm font-medium text-white" to="/cases">
          Back to Cases
        </Link>
        <Link
          className="inline-flex rounded-full border border-ink/20 px-4 py-2 text-sm font-medium"
          to={`/configs?case_id=${stableCaseId}`}
        >
          Manage Run Configs
        </Link>

        <div className="space-y-2 pt-2">
          <h4 className="font-display text-base">Previous Runs for This Case</h4>
          {(caseRuns ?? []).length === 0 ? (
            <p className="text-xs text-slate">No runs yet. Launch a new run to start history.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(caseRuns ?? []).map((run) => (
                <div key={run.id} className="rounded-xl border border-ink/10 p-3 text-xs">
                  <p className="font-medium">{run.status}</p>
                  <p className="text-slate">{new Date(run.created_at).toLocaleString()}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link className="rounded-full border border-ink/20 px-2 py-1" to={`/runs/${run.id}`}>
                      Open Chat
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
