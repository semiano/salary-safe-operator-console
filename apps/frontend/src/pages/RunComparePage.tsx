import { Link, useParams } from "react-router-dom";

import { useCaseRuns, useRunDetail, useRunReport } from "../hooks/useRunViews";

export function RunComparePage() {
  const { runId = "" } = useParams();
  const { data: currentRun, isLoading: isLoadingRun } = useRunDetail(runId);
  const caseId = currentRun?.case_id ?? "";
  const { data: runs, isLoading: isLoadingRuns } = useCaseRuns(caseId);
  const { data: currentReport } = useRunReport(runId);

  if (isLoadingRun || isLoadingRuns) {
    return <p className="text-slate">Loading runs for comparison...</p>;
  }

  if (!currentRun || !runs) {
    return <p className="text-red-700">Unable to load comparison data.</p>;
  }

  const comparableRuns = runs.slice(0, 5);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <div>
          <h2 className="font-display text-2xl">Run Comparison</h2>
          <p className="text-sm text-slate">Case {caseId} | showing latest {comparableRuns.length} runs</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-full border border-slate/20 px-4 py-2 text-sm" to={`/runs/${runId}`}>
            Back to Run
          </Link>
          <Link className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white" to={`/runs/${runId}/report`}>
            Open Report
          </Link>
        </div>
      </header>

      {currentReport ? (
        <article className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h3 className="font-display text-lg">Current Run Snapshot</h3>
          <p className="mt-2 text-sm text-slate">{currentReport.summary.public_summary}</p>
          <p className="mt-2 text-sm">
            Recommended base: ${currentReport.recommended_package.base_salary.toLocaleString()} ({currentReport.status})
          </p>
        </article>
      ) : null}

      <article className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <h3 className="font-display text-lg">Run Grid</h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink text-paper">
              <tr>
                <th className="px-4 py-3 font-medium">Run</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {comparableRuns.map((run) => (
                <tr key={run.id} className="border-t border-ink/10">
                  <td className="px-4 py-3 font-mono text-xs">{run.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3">{run.status}</td>
                  <td className="px-4 py-3">{run.provider}</td>
                  <td className="px-4 py-3">{run.model_name}</td>
                  <td className="px-4 py-3">{new Date(run.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Link className="font-medium text-accent hover:underline" to={`/runs/${run.id}/report`}>
                      View Report
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
