import { Link, useParams } from "react-router-dom";

import { useRunDetail, useRunReport } from "../hooks/useRunViews";

export function RunReportPage() {
  const { runId = "" } = useParams();
  const { data: report, isLoading, isError } = useRunReport(runId);
  const { data: runDetail } = useRunDetail(runId);

  if (isLoading) {
    return <p className="text-slate">Loading report...</p>;
  }

  if (isError || !report) {
    return <p className="text-red-700">Unable to load final report for this run.</p>;
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <div>
          <h2 className="font-display text-2xl">Run Report</h2>
          <p className="text-sm text-slate">Run {runId} | status: {report.status}</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-full border border-slate/20 px-4 py-2 text-sm" to={`/runs/${runId}`}>
            Back to Run
          </Link>
          {runDetail ? (
            <Link className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white" to={`/runs/${runId}/compare`}>
              Compare Runs
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h3 className="font-display text-lg">Summary</h3>
          <p className="mt-2 text-sm text-slate">{report.summary.public_summary}</p>
          <p className="mt-2 text-sm text-slate">{report.summary.executive_summary}</p>
        </article>

        <article className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h3 className="font-display text-lg">Recommended Package</h3>
          <ul className="mt-3 space-y-1 text-sm">
            <li>Base salary: ${report.recommended_package.base_salary.toLocaleString()}</li>
            <li>Bonus: {report.recommended_package.bonus_pct}%</li>
            <li>Equity: ${report.recommended_package.equity_value.toLocaleString()}</li>
            <li>Sign-on: ${report.recommended_package.sign_on_bonus.toLocaleString()}</li>
            <li>Title: {report.recommended_package.title}</li>
          </ul>
        </article>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h3 className="font-display text-lg">Range and Metrics</h3>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              Base range: ${report.recommended_range.base_salary_min.toLocaleString()} - ${report.recommended_range.base_salary_max.toLocaleString()} {report.recommended_range.currency}
            </li>
            <li>Rounds completed: {report.run_metrics.rounds_completed}</li>
            <li>Deadlock risk: {report.run_metrics.deadlock_risk_final}</li>
            <li>Candidate concessions: {report.run_metrics.candidate_concession_count}</li>
            <li>Company concessions: {report.run_metrics.company_concession_count}</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h3 className="font-display text-lg">Confidence</h3>
          <ul className="mt-3 space-y-1 text-sm">
            <li>Overall: {(report.confidence.overall_confidence * 100).toFixed(0)}%</li>
            <li>Data completeness: {(report.confidence.data_completeness_score * 100).toFixed(0)}%</li>
            <li>Market alignment: {(report.confidence.market_alignment_score * 100).toFixed(0)}%</li>
            <li>Internal equity: {(report.confidence.internal_equity_confidence * 100).toFixed(0)}%</li>
          </ul>
          <p className="mt-2 text-sm text-slate">{report.confidence.notes}</p>
        </article>
      </div>

      <article className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <h3 className="font-display text-lg">Raw JSON</h3>
        <pre className="mt-3 overflow-x-auto text-xs">{JSON.stringify(report, null, 2)}</pre>
      </article>
    </section>
  );
}
