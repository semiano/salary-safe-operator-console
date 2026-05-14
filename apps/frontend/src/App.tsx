import { useState, useRef, useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { clearAccessToken, isAuthenticated, getTokenName } from "./auth/token";
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



function MyAccountMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const userName = getTokenName() || "Admin";

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    } else {
      document.removeEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Profile and Settings placeholders as modals
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="rounded-full border border-slate/20 px-4 py-2 hover:bg-slate hover:text-white flex items-center gap-2"
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ marginLeft: 16 }}
      >
        <span role="img" aria-label="Account">👤</span> {userName} ▾
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 180,
            background: "white",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            padding: "4px 0",
          }}
        >
          <button
            style={{
              padding: "8px 16px",
              background: "none",
              border: "none",
              textAlign: "left",
              width: "100%",
              cursor: "pointer",
            }}
            onClick={() => {
              setOpen(false);
              setShowProfile(true);
            }}
          >
            <span style={{ marginRight: 8 }}>📝</span>Profile
          </button>
          <button
            style={{
              padding: "8px 16px",
              background: "none",
              border: "none",
              textAlign: "left",
              width: "100%",
              cursor: "pointer",
            }}
            onClick={() => {
              setOpen(false);
              setShowSettings(true);
            }}
          >
            <span style={{ marginRight: 8 }}>⚙️</span>Settings
          </button>
          <button
            style={{
              padding: "8px 16px",
              background: "none",
              border: "none",
              textAlign: "left",
              width: "100%",
              cursor: "pointer",
              color: "#d32f2f",
            }}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <span style={{ marginRight: 8 }}>🚪</span>Logout
          </button>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && (
        <div style={{
          position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.2)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center"
        }} onClick={() => setShowProfile(false)}>
          <div style={{ background: "#fff", borderRadius: 12, minWidth: 320, maxWidth: 400, padding: 32, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 22, marginBottom: 12 }}>Profile</h2>
            <div style={{ marginBottom: 16 }}>
              <span role="img" aria-label="Account" style={{ fontSize: 32, marginRight: 12 }}>👤</span>
              <span style={{ fontWeight: 500, fontSize: 18 }}>{userName}</span>
            </div>
            <div style={{ color: "#666", marginBottom: 24 }}>
              This is your profile. In a future release, you’ll be able to update your name, email, and other account details here.
            </div>
            <button style={{ padding: "8px 24px", borderRadius: 6, border: "none", background: "#eee", cursor: "pointer" }} onClick={() => setShowProfile(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.2)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center"
        }} onClick={() => setShowSettings(false)}>
          <div style={{ background: "#fff", borderRadius: 12, minWidth: 320, maxWidth: 400, padding: 32, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 22, marginBottom: 12 }}>Settings</h2>
            <div style={{ color: "#666", marginBottom: 24 }}>
              Settings will be available here soon. You’ll be able to customize your experience and manage notification preferences.
            </div>
            <button style={{ padding: "8px 24px", borderRadius: 6, border: "none", background: "#eee", cursor: "pointer" }} onClick={() => setShowSettings(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [underConOpen, setUnderConOpen] = useState(false);

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

  return (
    <div className="min-h-screen bg-paper text-ink">
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
                    background: "white",
                    border: "1px solid rgba(0,0,0,0.12)",
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
            {/* My Account menu (far right) */}
            <MyAccountMenu onLogout={onLogout} />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Main content and routes below */}
        <Routes>
          {/* Root → job-listings */}
          <Route path="/" element={<Navigate to="/job-listings" replace />} />
          <Route path="/login" element={<LoginPage />} />

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
    </div>
  );
}
