import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { clearAccessToken, getTokenRole, isAuthenticated } from "./auth/token";
import { AccountMenu } from "./components/AccountMenu";
import { ActionQueueBell } from "./components/ActionQueueBell";
import { DebugLogDock } from "./components/DebugLogDock";
import { useTheme } from "./hooks/useTheme";
import { CandidateApplyPage } from "./pages/CandidateApplyPage";
import { CandidateBidPage } from "./pages/CandidateBidPage";
import { CaseEditorPage } from "./pages/CaseEditorPage";
import { CasesPage } from "./pages/CasesPage";
import { LoginPage } from "./pages/LoginPage";
import { AgentsPage } from "./pages/AgentsPage";
import { AllApplicationsPage } from "./pages/AllApplicationsPage";
import { BidDetailPage } from "./pages/BidDetailPage";
import { BidEditPage } from "./pages/BidEditPage";
import { CandidateBidsPage } from "./pages/CorporatePortalPage";
import { CompExternalPage } from "./pages/CompExternalPage";
import { CompInternalPage } from "./pages/CompInternalPage";
import { CorporateHomePage } from "./pages/CorporateHomePage";
import { PostRolePage } from "./pages/PostRolePage";
import { RunConfigsPage } from "./pages/RunConfigsPage";
import { RunComparePage } from "./pages/RunComparePage";
import { RunPage } from "./pages/RunPage";
import { RunReportPage } from "./pages/RunReportPage";
import { addDebugLog } from "./utils/debugLog";

// ── Redirect helpers ──────────────────────────────────────────────────────────

function BidTokenRedirect() {
  const { token } = useParams<{ token: string }>();
  return <Navigate to={`/apply/${token}`} replace />;
}

function BidIdRedirect() {
  const { bidId } = useParams<{ bidId: string }>();
  return <Navigate to={`/invitations/${bidId}`} replace />;
}

function BidIdEditRedirect() {
  const { bidId } = useParams<{ bidId: string }>();
  return <Navigate to={`/invitations/${bidId}/edit`} replace />;
}

// ── Auth guard ────────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}






// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [underConOpen, setUnderConOpen] = useState(false);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const { style, setStyle } = useTheme();
  const showAdminDebugDock = isAuthenticated() && getTokenRole() === "admin";

  // Public candidate-facing pages render without the corporate shell
  if (location.pathname.startsWith("/apply/") || location.pathname.startsWith("/bid/")) {
    return (
      <Routes>
        <Route path="/apply/:token" element={<CandidateApplyPage />} />
        <Route path="/bid/:token" element={<BidTokenRedirect />} />
      </Routes>
    );
  }

  function onLogout() {
    clearAccessToken();
    navigate("/login", { replace: true });
  }

  useEffect(() => {
    if (!showAdminDebugDock || typeof window === "undefined") {
      return;
    }

    addDebugLog("info", "app", "Admin debug mode enabled", { path: location.pathname });

    const onUnhandledError = (event: ErrorEvent) => {
      addDebugLog("error", "runtime", "Unhandled error", {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      addDebugLog("error", "runtime", "Unhandled promise rejection", {
        reason: String(event.reason),
      });
    };

    window.addEventListener("error", onUnhandledError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onUnhandledError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [showAdminDebugDock]);

  useEffect(() => {
    if (!showAdminDebugDock) {
      return;
    }
    addDebugLog("debug", "app", "Route changed", { path: location.pathname });
  }, [showAdminDebugDock, location.pathname]);

  return (
    <div className="min-h-screen bg-paper text-ink" style={{ paddingBottom: showAdminDebugDock ? 230 : 0 }}>
      <header className="border-b border-ink/15 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">SalarySafe</h1>
            <p className="text-sm text-slate">Operator console for multi-agent salary negotiation runs</p>
          </div>
          <nav className="flex flex-1 flex-wrap items-center gap-3 text-sm">
            <Link
              className="rounded-full border border-slate/20 px-4 py-2 hover:bg-slate hover:text-white flex items-center gap-2"
              to="/job-listings"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="2" y="5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2h3A1.5 1.5 0 0 1 11 3.5V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="2" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Job Listings
            </Link>
            <Link
              className="rounded-full border border-slate/20 px-4 py-2 hover:bg-slate hover:text-white flex items-center gap-2"
              to="/invitations"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M1.5 5.5l6.5 4.5 6.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              All Invitations
            </Link>
            <div style={{ position: "relative" }}>
              <button
                className="rounded-full border border-slate/20 px-4 py-2 hover:bg-slate hover:text-white flex items-center gap-2"
                type="button"
                aria-label="Compensation Benchmarking"
                aria-expanded={benchmarkOpen}
                onClick={() => setBenchmarkOpen((v) => !v)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 13.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M4 12V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M8 12V4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M12 12V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Compensation Benchmarking
              </button>
              {benchmarkOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    minWidth: 220,
                    background: "var(--ss-surface)",
                    border: "1px solid var(--ss-border)",
                    color: "var(--ss-ink)",
                    borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                    zIndex: 100,
                    display: "flex",
                    flexDirection: "column",
                    padding: "4px 0",
                  }}
                >
                  {[
                    { label: "Overview", to: "/compensation-benchmarking", icon: "📊" },
                    { label: "External", to: "/compensation-benchmarking/external", icon: "🌍" },
                    { label: "Internal", to: "/compensation-benchmarking/internal", icon: "🏢" },
                  ].map(({ label, to, icon }) => (
                    <Link
                      key={to}
                      to={to}
                      style={{
                        padding: "8px 16px",
                        color: "inherit",
                        textDecoration: "none",
                        display: "block",
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => setBenchmarkOpen(false)}
                    >
                      <span style={{ marginRight: 8 }}>{icon}</span>{label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {/* Under Construction icon-only button */}
            <div style={{ position: "relative" }}>
              <button
                className="rounded-full border border-slate/20 px-4 py-2 hover:bg-slate hover:text-white flex items-center"
                type="button"
                aria-label="Under Construction"
                onClick={() => setUnderConOpen((v) => !v)}
                style={{ minWidth: 40, minHeight: 40, padding: 0, marginLeft: 8 }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M3 15l4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M10.5 4.5a3 3 0 0 1 4 4l-6 6a3 3 0 0 1-4-4l6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M13 2l1 2-1 1-2-1 1-2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              </button>
              {underConOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    minWidth: 160,
                    background: "var(--ss-surface)",
                    border: "1px solid var(--ss-border)",
                    color: "var(--ss-ink)",
                    borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                    zIndex: 100,
                    display: "flex",
                    flexDirection: "column",
                    padding: "4px 0",
                  }}
                >
                  {[
                    { label: "Cases", to: "/cases", icon: "🗂️" },
                    { label: "Agents", to: "/agents", icon: "🤖" },
                    { label: "Run Configs", to: "/configs", icon: "⚙️" },
                  ].map(({ label, to, icon }) => (
                    <Link
                      key={to}
                      to={to}
                      style={{
                        padding: "8px 16px",
                        color: "inherit",
                        textDecoration: "none",
                        display: "block",
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => setUnderConOpen(false)}
                    >
                      <span style={{ marginRight: 8 }}>{icon}</span>{label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {/* Spacer to push profile menu to far right */}
            <div className="flex-1" />
            {/* Action queue bell */}
            <ActionQueueBell />
            {/* My Account menu (far right) */}
            <AccountMenu
              onLogout={onLogout}
              style={style}
              onSetStyle={setStyle}
            />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Main content and routes below */}
        <Routes>
          {/* Root → job-listings */}
          <Route path="/" element={<Navigate to="/job-listings" replace />} />
          <Route path="/login" element={<LoginPage />} />

          <Route path="/compensation-benchmarking" element={<Navigate to="/compensation-benchmarking/external" replace />} />

          {/* ── Main new-taxonomy routes ── */}
          <Route
            path="/job-listings"
            element={
              <RequireAuth>
                <CorporateHomePage />
              </RequireAuth>
            }
          />
          <Route
            path="/job-listings/new"
            element={
              <RequireAuth>
                <PostRolePage />
              </RequireAuth>
            }
          />
          <Route
            path="/job-listings/:listingId/view-bids"
            element={
              <RequireAuth>
                <CandidateBidsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/job-listings/:listingId/comp-external"
            element={
              <RequireAuth>
                <CompExternalPage />
              </RequireAuth>
            }
          />
          <Route
            path="/job-listings/:listingId/comp-internal"
            element={
              <RequireAuth>
                <CompInternalPage />
              </RequireAuth>
            }
          />
          <Route
            path="/compensation-benchmarking/external"
            element={
              <RequireAuth>
                <CompExternalPage />
              </RequireAuth>
            }
          />
          <Route
            path="/compensation-benchmarking/internal"
            element={
              <RequireAuth>
                <CompInternalPage />
              </RequireAuth>
            }
          />
          <Route
            path="/invitations"
            element={
              <RequireAuth>
                <AllApplicationsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/invitations/:applicationId"
            element={
              <RequireAuth>
                <BidDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/invitations/:applicationId/edit"
            element={
              <RequireAuth>
                <BidEditPage />
              </RequireAuth>
            }
          />

          {/* ── Under Construction routes (kept as-is) ── */}
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

          {/* ── Run routes ── */}
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

          {/* ── Backward-compatibility redirects ── */}
          <Route path="/corporate" element={<Navigate to="/job-listings" replace />} />
          <Route path="/dashboard" element={<Navigate to="/job-listings" replace />} />
          <Route path="/post-role" element={<Navigate to="/job-listings/new" replace />} />
          <Route path="/applications" element={<Navigate to="/invitations" replace />} />
          <Route path="/applications/:bidId" element={<BidIdRedirect />} />
          <Route path="/applications/:bidId/edit" element={<BidIdEditRedirect />} />
          <Route path="/corporate/bids" element={<Navigate to="/invitations" replace />} />
          <Route path="/corporate/bids/:bidId" element={<BidIdRedirect />} />
          <Route path="/corporate/bids/:bidId/edit" element={<BidIdEditRedirect />} />
        </Routes>
      </main>

      {showAdminDebugDock ? <DebugLogDock /> : null}
    </div>
  );
}
