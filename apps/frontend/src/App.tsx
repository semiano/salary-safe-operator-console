import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { clearAccessToken, isAuthenticated } from "./auth/token";
import { CaseEditorPage } from "./pages/CaseEditorPage";
import { CasesPage } from "./pages/CasesPage";
import { LoginPage } from "./pages/LoginPage";
import { AgentsPage } from "./pages/AgentsPage";
import { RunConfigsPage } from "./pages/RunConfigsPage";
import { RunComparePage } from "./pages/RunComparePage";
import { RunPage } from "./pages/RunPage";
import { RunReportPage } from "./pages/RunReportPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function App() {
  const navigate = useNavigate();

  function onLogout() {
    clearAccessToken();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/15 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">SalarySafe</h1>
            <p className="text-sm text-slate">Operator console for multi-agent salary negotiation runs</p>
          </div>
          <nav className="flex gap-3 text-sm">
            <Link className="rounded-full border border-slate/20 px-4 py-2 hover:bg-slate hover:text-white" to="/cases">
              Cases
            </Link>
            <Link className="rounded-full border border-slate/20 px-4 py-2 hover:bg-slate hover:text-white" to="/configs">
              Run Configs
            </Link>
            <Link className="rounded-full border border-slate/20 px-4 py-2 hover:bg-slate hover:text-white" to="/agents">
              Agents
            </Link>
            <button
              className="rounded-full border border-slate/20 px-4 py-2 hover:bg-slate hover:text-white"
              type="button"
              onClick={onLogout}
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/cases" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/cases"
            element={
              <RequireAuth>
                <CasesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/cases/:caseId"
            element={
              <RequireAuth>
                <CaseEditorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/configs"
            element={
              <RequireAuth>
                <RunConfigsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/agents"
            element={
              <RequireAuth>
                <AgentsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/runs/:runId"
            element={
              <RequireAuth>
                <RunPage />
              </RequireAuth>
            }
          />
          <Route
            path="/runs/:runId/report"
            element={
              <RequireAuth>
                <RunReportPage />
              </RequireAuth>
            }
          />
          <Route
            path="/runs/:runId/compare"
            element={
              <RequireAuth>
                <RunComparePage />
              </RequireAuth>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
