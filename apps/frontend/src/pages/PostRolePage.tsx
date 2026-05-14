import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAutofillRole } from "../hooks/useCases";
import { WorkdayBenchmarkPanel } from "../components/WorkdayBenchmarkPanel";
import { useCreateCase } from "../hooks/useCases";
import { useParseInvitations } from "../hooks/useCases";
import { useCaseDetail, useUpdateCase } from "../hooks/useCaseEditor";
import { useSendPhase1BidInvitations } from "../hooks/usePhase1Bids";

// ─── Brand tokens (matching salarysafe.ai design language) ────────────────────
const B = "#019529";
const BL = "#eaf7ed";
const BB = "#b8dfc0";
const BT = "#0a4a1a";
const BS = "#2a6b3a";
const NAVY = "#1B1035";
const BORDER = "rgba(0,0,0,.1)";
const MUTED = "#666";
const FAINT = "#999";
const SURFACE = "#f5f5f5";
const R_MD = "10px";
const R_LG = "14px";

const CATEGORIES = [
  "Engineering",
  "Product",
  "Design",
  "DevOps / Infra",
  "Data & Analytics",
  "Sales",
  "Marketing",
  "Customer Success",
  "Finance",
  "Operations",
  "Legal",
  "HR & People",
  "Executive",
  "Support",
  "Other",
];

const WORK_ARRANGEMENTS = [
  { value: "remote", label: "Remote — fully distributed" },
  { value: "hybrid", label: "Hybrid — some days on-site" },
  { value: "onsite", label: "On-site — in office full time" },
];

const SENIORITY_LEVELS = [
  "Entry level",
  "Associate",
  "Mid",
  "Senior",
  "Staff",
  "Principal",
  "Lead",
  "Manager",
  "Senior Manager",
  "Director",
  "VP",
  "Executive",
];

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract / Freelance" },
  { value: "fixed_term", label: "Fixed-term" },
];

const WFH_OPTIONS = [
  { value: "none", label: "No remote — on-site only" },
  { value: "1", label: "1 day / week remote" },
  { value: "2", label: "2 days / week remote" },
  { value: "3", label: "3 days / week remote" },
  { value: "4", label: "4 days / week remote" },
  { value: "full", label: "Fully remote" },
  { value: "flexible", label: "Flexible / as agreed" },
];

type Invitation = { id: string; name: string; email: string };

// ─── Small helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: ".1em",
        color: B,
        marginBottom: ".625rem",
      }}
    >
      {children}
    </p>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 6 }}
    >
      {children}
    </label>
  );
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%",
    padding: "9px 12px",
    fontSize: 14,
    border: `1px solid #ddd`,
    borderRadius: R_MD,
    background: "#fff",
    color: "#111",
    outline: "none",
    fontFamily: "inherit",
    ...extra,
  };
}

function BenefitToggle({
  label,
  hint,
  checked,
  onChange,
  children,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: `0.5px solid ${BORDER}` }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 0",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{label}</div>
          {hint && <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{hint}</div>}
        </div>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          style={{
            flexShrink: 0,
            width: 40,
            height: 22,
            borderRadius: 99,
            border: "none",
            cursor: "pointer",
            background: checked ? B : "#ddd",
            position: "relative",
            transition: "background .18s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: checked ? 21 : 3,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#fff",
              transition: "left .18s",
            }}
          />
        </button>
      </div>
      {checked && children && (
        <div
          style={{
            marginBottom: 10,
            padding: "10px 12px",
            background: SURFACE,
            borderRadius: R_MD,
            border: `0.5px solid ${BORDER}`,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 17,
        height: 17,
        borderRadius: "50%",
        background: B,
        flexShrink: 0,
      }}
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <polyline points="1,4.5 3.5,7 8,2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function AlignmentStrengthBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#e0e0e0", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 3, background: B, width: `${pct}%` }} />
      </div>
      <span style={{ fontSize: 11, color: MUTED }}>{label}</span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function PostRolePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editCaseId = searchParams.get("edit") ?? "";
  const isEditMode = Boolean(editCaseId);

  const createCase = useCreateCase();
  const updateCase = useUpdateCase(editCaseId);
  const sendInvitations = useSendPhase1BidInvitations();
  const { data: existingCase, isLoading: editLoading } = useCaseDetail(editCaseId);
  const autofillRole = useAutofillRole();

  // Role details
  const [jobTitle, setJobTitle] = useState("");
  const [category, setCategory] = useState("Engineering");
  const [workArrangement, setWorkArrangement] = useState("hybrid");
  const [location, setLocation] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [responsibilities, setResponsibilities] = useState("");

  // Salary band (kept confidential from candidates)
  const [budgetFloorText, setBudgetFloorText] = useState("");
  const [budgetCeilingText, setBudgetCeilingText] = useState("");
  const [currency, setCurrency] = useState("USD");

  // Role details (extended)
  const [seniorityLevel, setSeniorityLevel] = useState("Senior");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [visaSponsorship, setVisaSponsorship] = useState("no");

  // Benefits
  const [hasHealthInsurance, setHasHealthInsurance] = useState(true);
  const [has401k, setHas401k] = useState(true);
  const [hasDentalVision, setHasDentalVision] = useState(false);
  const [hasStockOptions, setHasStockOptions] = useState(false);
  const [ptoUnlimited, setPtoUnlimited] = useState(false);
  const [ptoDaysText, setPtoDaysText] = useState("15");
  const [wfhSchedule, setWfhSchedule] = useState("2");

  // Salary (extended)
  const [bonusTargetPct, setBonusTargetPct] = useState("");

  // Benefit sub-options
  const [healthPlan, setHealthPlan] = useState<"basic" | "standard" | "premium">("standard");
  const [retirementMatchPct, setRetirementMatchPct] = useState("4");
  const [equityType, setEquityType] = useState<"options" | "rsus" | "both">("rsus");
  const [vestingSchedule, setVestingSchedule] = useState("4yr_1yr_cliff");

  // Invitations
  const [inviteeName, setInviteeName] = useState("");
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Form
  const [formError, setFormError] = useState<string | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [createdInviteTokens, setCreatedInviteTokens] = useState<Array<{ name: string; email: string; token: string }>>([]);

  // Bulk invite paste
  const parseInvitations = useParseInvitations();
  const [bulkPasteText, setBulkPasteText] = useState("");
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkParseError, setBulkParseError] = useState<string | null>(null);

  // ── Pre-fill from existing case in edit mode ─────────────────────────────────
  useEffect(() => {
    if (!existingCase) return;
    const companyPub = existingCase.parties?.find((p) => p.party_type === "company")?.public_payload ?? {};
    const companyConf = existingCase.parties?.find((p) => p.party_type === "company")?.confidential_payload ?? {};
    const benefits = (companyConf["benefits"] ?? {}) as Record<string, unknown>;

    setJobTitle(String(companyPub["job_title"] ?? existingCase.title ?? ""));
    const cat = String(companyPub["category"] ?? "");
    if (cat) setCategory(cat);
    const wa = String(companyPub["work_arrangement"] ?? "");
    if (["remote", "hybrid", "onsite"].includes(wa)) setWorkArrangement(wa);
    setLocation(String(companyPub["location"] ?? ""));
    setJobDescription(String(companyPub["job_description"] ?? existingCase.description ?? ""));
    const respList = companyPub["key_responsibilities"];
    if (Array.isArray(respList)) setResponsibilities(respList.join("\n"));
    const sl = String(companyPub["seniority_level"] ?? "");
    if (sl) setSeniorityLevel(sl);
    const et = String(companyPub["employment_type"] ?? "");
    if (et) setEmploymentType(et);
    const vs = String(companyPub["visa_sponsorship"] ?? "");
    if (vs) setVisaSponsorship(vs);
    // Salary
    const floor = companyConf["budget_floor"];
    const ceiling = companyConf["budget_ceiling"];
    if (floor != null) setBudgetFloorText(String(floor));
    if (ceiling != null) setBudgetCeilingText(String(ceiling));
    if (existingCase.currency) setCurrency(existingCase.currency);
    const bonus = companyConf["bonus_target_pct"];
    if (bonus != null) setBonusTargetPct(String(bonus));
    // Benefits
    if (typeof benefits["health_insurance"] === "boolean") setHasHealthInsurance(benefits["health_insurance"]);
    const hp = String(benefits["health_plan"] ?? "");
    if (["basic", "standard", "premium"].includes(hp)) setHealthPlan(hp as "basic" | "standard" | "premium");
    if (typeof benefits["retirement_401k"] === "boolean") setHas401k(benefits["retirement_401k"]);
    const rmp = benefits["retirement_match_pct"];
    if (rmp != null) setRetirementMatchPct(String(rmp));
    if (typeof benefits["dental_vision"] === "boolean") setHasDentalVision(benefits["dental_vision"]);
    if (typeof benefits["stock_options"] === "boolean") setHasStockOptions(benefits["stock_options"]);
    const eqt = String(benefits["equity_type"] ?? "");
    if (["options", "rsus", "both"].includes(eqt)) setEquityType(eqt as "options" | "rsus" | "both");
    const vest = String(benefits["vesting_schedule"] ?? "");
    if (vest) setVestingSchedule(vest);
    const pto = benefits["pto_days"];
    if (pto === "unlimited") {
      setPtoUnlimited(true);
    } else if (pto != null) {
      setPtoUnlimited(false);
      setPtoDaysText(String(pto));
    }
    const wfh = String(benefits["wfh_schedule"] ?? "");
    if (wfh) setWfhSchedule(wfh);
    // Invitations
    const invList = companyPub["invitations"];
    if (Array.isArray(invList)) {
      setInvitations(
        invList
          .filter((inv): inv is { name: string; email: string } => typeof inv === "object" && inv !== null)
          .map((inv) => ({ id: crypto.randomUUID(), name: String(inv.name ?? ""), email: String(inv.email ?? "") }))
      );
    }
  }, [existingCase]);

  // ── Autofill ─────────────────────────────────────────────────────────────────

  async function handleAutofill() {
    try {
      const data = await autofillRole.mutateAsync();
      setJobTitle(data.job_title);
      // Snap category to the nearest valid entry (case-insensitive)
      const matchedCategory = CATEGORIES.find(
        (c) => c.toLowerCase() === data.category.toLowerCase()
      ) ?? data.category;
      setCategory(matchedCategory);
      const wa = ["remote", "hybrid", "onsite"].includes(data.work_arrangement)
        ? data.work_arrangement
        : "hybrid";
      setWorkArrangement(wa);
      setLocation(data.location);
      setJobDescription(data.job_description);
      setResponsibilities(data.responsibilities.join("\n"));
      const validCurrencies = ["USD", "GBP", "EUR", "CAD", "AUD"];
      setCurrency(validCurrencies.includes(data.currency) ? data.currency : "USD");
      setBudgetFloorText(String(data.budget_floor));
      setBudgetCeilingText(String(data.budget_ceiling));
      setHasHealthInsurance(data.health_insurance);
      setHas401k(data.retirement_401k);
      setHasDentalVision(data.dental_vision);
      setHasStockOptions(data.stock_options);
      setPtoUnlimited(false);
      setPtoDaysText(String(data.pto_days));
      const wfhMap: Record<number, string> = { 0: "none", 1: "1", 2: "2", 3: "3", 4: "4", 5: "full" };
      setWfhSchedule(wfhMap[data.wfh_days_per_week] ?? "flexible");
      setInvitations(
        data.invitations.map((inv) => ({
          id: crypto.randomUUID(),
          name: inv.name,
          email: inv.email,
        }))
      );
    } catch {
      setFormError("AI Autofill failed. Please try again.");
    }
  }

  function handleAddInvitation(e: FormEvent) {
    e.preventDefault();
    setInviteError(null);

    if (!inviteeName.trim()) {
      setInviteError("Name is required.");
      return;
    }
    const emailTrimmed = inviteeEmail.trim();
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setInviteError("A valid email address is required.");
      return;
    }
    if (invitations.some((inv) => inv.email.toLowerCase() === emailTrimmed.toLowerCase())) {
      setInviteError("That email is already on the invitation list.");
      return;
    }
    setInvitations((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: inviteeName.trim(), email: emailTrimmed },
    ]);
    setInviteeName("");
    setInviteeEmail("");
  }

  function removeInvitation(id: string) {
    setInvitations((prev) => prev.filter((inv) => inv.id !== id));
  }

  async function handleBulkParse() {
    setBulkParseError(null);
    if (!bulkPasteText.trim()) return;
    try {
      const result = await parseInvitations.mutateAsync(bulkPasteText);
      const added: Invitation[] = [];
      for (const inv of result.invitations) {
        const emailLower = inv.email.toLowerCase();
        if (!invitations.some((ex) => ex.email.toLowerCase() === emailLower) &&
            !added.some((a) => a.email.toLowerCase() === emailLower)) {
          added.push({ id: crypto.randomUUID(), name: inv.name, email: inv.email });
        }
      }
      if (added.length === 0) {
        setBulkParseError("No new valid emails found in the pasted text.");
      } else {
        setInvitations((prev) => [...prev, ...added]);
        setBulkPasteText("");
        setBulkPasteOpen(false);
      }
    } catch {
      setBulkParseError("Failed to parse the invitation list. Please try again.");
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!jobTitle.trim()) {
      setFormError("Job title is required.");
      return;
    }

    const floor = Number(budgetFloorText.replace(/[$,\s]/g, ""));
    const ceiling = Number(budgetCeilingText.replace(/[$,\s]/g, ""));

    if (!budgetFloorText || !Number.isFinite(floor) || floor <= 0) {
      setFormError("A valid minimum salary is required.");
      return;
    }
    if (!budgetCeilingText || !Number.isFinite(ceiling) || ceiling <= 0) {
      setFormError("A valid maximum salary is required.");
      return;
    }
    if (floor >= ceiling) {
      setFormError("Maximum salary must be greater than the minimum salary.");
      return;
    }

    const ptoDays = ptoUnlimited ? "unlimited" : (Number(ptoDaysText) || 15);
    const wfhDaysNum = wfhSchedule === "full" ? 5 : wfhSchedule === "none" ? 0 : wfhSchedule === "flexible" ? null : (Number(wfhSchedule) || 0);

    const responsibilitiesList = responsibilities
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);

    try {
      const payload = {
        title: jobTitle.trim(),
        description: jobDescription.trim() || null,
        status: "active",
        jurisdiction: "US",
        currency,
        company: {
          public_payload: {
            job_title: jobTitle.trim(),
            category,
            seniority_level: seniorityLevel,
            employment_type: employmentType,
            work_arrangement: workArrangement,
            location: location.trim() || null,
            job_description: jobDescription.trim() || null,
            key_responsibilities: responsibilitiesList,
            visa_sponsorship: visaSponsorship,
            invitations: invitations.map((inv) => ({ name: inv.name, email: inv.email })),
          },
          confidential_payload: {
            budget_floor: floor,
            budget_ceiling: ceiling,
            currency,
            bonus_target_pct: bonusTargetPct ? (Number(bonusTargetPct) || null) : null,
            benefits: {
              health_insurance: hasHealthInsurance,
              health_plan: hasHealthInsurance ? healthPlan : null,
              retirement_401k: has401k,
              retirement_match_pct: has401k ? (Number(retirementMatchPct) || 4) : null,
              dental_vision: hasDentalVision,
              stock_options: hasStockOptions,
              equity_type: hasStockOptions ? equityType : null,
              vesting_schedule: hasStockOptions ? vestingSchedule : null,
              pto_days: ptoDays,
              wfh_schedule: wfhSchedule,
              wfh_days_per_week: wfhDaysNum,
            },
          },
        },
        candidate: {
          public_payload: {},
          confidential_payload: {},
        },
      };

      if (isEditMode) {
        await updateCase.mutateAsync(payload);
        navigate("/corporate");
        return;
      }
      const created = await createCase.mutateAsync(payload);
      // Fire invitation records for any entered invitees so they get a unique token URL
      if (invitations.length > 0) {
        try {
          const createdBids = await sendInvitations.mutateAsync({
            caseId: created.id,
            invitations: invitations.map((inv) => ({
              candidate_email: inv.email,
              candidate_name: inv.name || null,
            })),
          });
          setCreatedInviteTokens(
            createdBids.map((bid, i) => ({
              name: invitations[i]?.name ?? bid.candidate_name ?? "",
              email: bid.candidate_email ?? invitations[i]?.email ?? "",
              token: bid.token,
            }))
          );
        } catch {
          // Non-fatal: invitation records failed, but the case was created
        }
      }
      setCreatedCaseId(created.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : isEditMode ? "Failed to save changes. Please try again." : "Failed to create job listing. Please try again.");
    }
  }

  // ── Edit mode loading guard ─────────────────────────────────────────
  if (isEditMode && editLoading) {
    return <div style={{ padding: "3rem", textAlign: "center", color: MUTED, fontSize: 14 }}>Loading job listing…</div>;
  }

  // ── Success screen ───────────────────────────────────────────────────────────

  if (createdCaseId) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 0", fontFamily: "inherit" }}>
        <div
          style={{
            background: "#fff",
            border: `0.5px solid ${BORDER}`,
            borderRadius: R_LG,
            padding: "2.5rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: BL,
              border: `1px solid ${BB}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <polyline points="4,12 9,17 20,6" stroke={B} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-.03em",
              color: "#111",
              marginBottom: 8,
            }}
          >
            Job listing posted successfully.
          </h2>
          <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, marginBottom: "1.75rem", maxWidth: 420, margin: "0 auto 1.75rem" }}>
            <strong style={{ color: "#111" }}>{jobTitle}</strong> is now active.{" "}
            {invitations.length > 0
              ? `${invitations.length} candidate invitation${invitations.length === 1 ? "" : "s"} ${invitations.length === 1 ? "has" : "have"} been queued for sending.`
              : "You can invite candidates from the Corporate Portal."}
          </p>

          {createdInviteTokens.length > 0 && (
            <div
              style={{
                background: BL,
                border: `1px solid ${BB}`,
                borderRadius: R_MD,
                padding: "1rem 1.25rem",
                marginBottom: "1.75rem",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: BT, marginBottom: 10 }}>
                Invitation links ({createdInviteTokens.length}) — share with each candidate
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {createdInviteTokens.map((inv) => {
                  const url = `${window.location.origin}/bid/${inv.token}`;
                  return (
                    <div key={inv.token} style={{ background: "#fff", border: `1px solid ${BB}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: BT, marginBottom: 4 }}>
                        {inv.name || inv.email}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: MUTED, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                          {url}
                        </span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(url)}
                          style={{
                            flexShrink: 0,
                            background: "transparent",
                            border: `1px solid ${BB}`,
                            borderRadius: 6,
                            padding: "3px 10px",
                            fontSize: 11,
                            color: BT,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontWeight: 600,
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {invitations.length > 0 && createdInviteTokens.length === 0 && (
            <div
              style={{
                background: BL,
                border: `1px solid ${BB}`,
                borderRadius: R_MD,
                padding: "1rem 1.25rem",
                marginBottom: "1.75rem",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: BT, marginBottom: 10 }}>
                Invited candidates ({invitations.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {invitations.map((inv) => (
                  <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckIcon />
                    <span style={{ fontSize: 13, color: BT }}>
                      <strong>{inv.name}</strong> — {inv.email}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => navigate("/job-listings")}
              style={{
                background: B,
                color: "#fff",
                border: "none",
                borderRadius: R_MD,
                padding: "10px 22px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Go to Job Listings
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatedCaseId(null);
                setCreatedInviteTokens([]);
                setJobTitle("");
                setJobDescription("");
                setLocation("");
                setCategory("Engineering");
                setWorkArrangement("hybrid");
                setResponsibilities("");
                setBudgetFloorText("");
                setBudgetCeilingText("");
                setHasHealthInsurance(true);
                setHas401k(true);
                setHasDentalVision(false);
                setHasStockOptions(false);
                setPtoDaysText("15");
                setPtoUnlimited(false);
                setWfhSchedule("2");
                setInvitations([]);
              }}
              style={{
                background: "#fff",
                color: "#111",
                border: "1px solid #ddd",
                borderRadius: R_MD,
                padding: "10px 22px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Post another listing
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "inherit" }}>
      {/* ── Breadcrumb ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.75rem" }}>
        <Link
          to="/job-listings"
          style={{ fontSize: 13, color: MUTED, textDecoration: "none" }}
        >
          Job Listings
        </Link>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <polyline points="4,2 8,6 4,10" stroke={FAINT} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{isEditMode ? "Edit Job Listing" : "Post a New Job Listing"}</span>
      </div>

      {/* ── Page header ── */}
      <div style={{ marginBottom: "2rem" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: BL,
            border: `1px solid ${BB}`,
            borderRadius: 99,
            padding: "5px 14px",
            fontSize: 12,
            fontWeight: 500,
            color: BT,
            marginBottom: "1rem",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: B, flexShrink: 0, display: "inline-block" }} />
          Confidential salary matching
        </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: "-.03em",
                  lineHeight: 1.15,
                  color: "#111",
                  marginBottom: 8,
                }}
              >
                {isEditMode ? "Edit job listing" : "Post a New Job Listing"}
              </h1>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, maxWidth: 520 }}>
                {isEditMode
                  ? "Update the role details and salary range below. Changes are saved immediately."
                  : "Enter job listing details and your confidential salary range. Candidates you invite will submit their expectations privately. SalarySafe checks alignment — no figures shared with either party."}
              </p>
            </div>
            {/* AI Autofill button */}
            <button
              type="button"
              onClick={handleAutofill}
              disabled={autofillRole.isPending}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                background: autofillRole.isPending ? SURFACE : NAVY,
                color: autofillRole.isPending ? MUTED : "#fff",
                border: `1px solid ${autofillRole.isPending ? "#ddd" : NAVY}`,
                borderRadius: R_LG,
                fontSize: 13,
                fontWeight: 500,
                cursor: autofillRole.isPending ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                transition: "opacity .15s",
              }}
            >
              {autofillRole.isPending ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22" strokeDashoffset="8" strokeLinecap="round" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1.5l1.2 2.5 2.8.4-2 2 .46 2.8L7 7.9 4.54 9.2l.46-2.8-2-2 2.8-.4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    <line x1="7" y1="10.5" x2="7" y2="12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <line x1="4.5" y1="11.2" x2="3.5" y2="12.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <line x1="9.5" y1="11.2" x2="10.5" y2="12.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  AI Autofill
                </>
              )}
            </button>
          </div>
          {autofillRole.isSuccess && (
            <div
              style={{
                marginTop: "1rem",
                padding: "10px 14px",
                background: BL,
                border: `1px solid ${BB}`,
                borderRadius: R_MD,
                fontSize: 13,
                color: BT,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke={B} strokeWidth="1.3" />
                <polyline points="4,7 6.5,9.5 10.5,5" stroke={B} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Fields filled by AI — review and edit anything before posting.
            </div>
          )}
          <div
            style={{
              marginTop: "1rem",
              border: "1px solid rgba(100, 116, 139, 0.28)",
              borderRadius: R_MD,
              background: "rgba(241, 245, 249, 0.75)",
              padding: "10px 12px",
            }}
          >
            <WorkdayBenchmarkPanel />
          </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.85fr) minmax(0, 1fr)",
            gap: "2rem",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* ── Role Details ── */}
            <div
              style={{
                background: "#fff",
                border: `0.5px solid ${BORDER}`,
                borderRadius: R_LG,
                padding: "1.5rem",
              }}
            >
              <SectionLabel>Role Details</SectionLabel>

              <div style={{ marginBottom: 16 }}>
                <FieldLabel htmlFor="jobTitle">Job title <span style={{ color: "red" }}>*</span></FieldLabel>
                <input
                  id="jobTitle"
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Senior Product Manager"
                  style={inputStyle()}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div>
                  <FieldLabel htmlFor="category">Department / Category</FieldLabel>
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={inputStyle({ appearance: "auto" } as React.CSSProperties)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="workArrangement">Work arrangement</FieldLabel>
                  <select
                    id="workArrangement"
                    value={workArrangement}
                    onChange={(e) => setWorkArrangement(e.target.value)}
                    style={inputStyle({ appearance: "auto" } as React.CSSProperties)}
                  >
                    {WORK_ARRANGEMENTS.map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div>
                  <FieldLabel htmlFor="seniorityLevel">Seniority level</FieldLabel>
                  <select
                    id="seniorityLevel"
                    value={seniorityLevel}
                    onChange={(e) => setSeniorityLevel(e.target.value)}
                    style={inputStyle({ appearance: "auto" } as React.CSSProperties)}
                  >
                    {SENIORITY_LEVELS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="employmentType">Employment type</FieldLabel>
                  <select
                    id="employmentType"
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                    style={inputStyle({ appearance: "auto" } as React.CSSProperties)}
                  >
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <FieldLabel htmlFor="location">Location</FieldLabel>
                <input
                  id="location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. New York, NY  or  Remote – US only"
                  style={inputStyle()}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <FieldLabel htmlFor="jobDescription">Role description</FieldLabel>
                <textarea
                  id="jobDescription"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Describe the role, team context, and key outcomes…"
                  rows={4}
                  style={{ ...inputStyle(), resize: "vertical" }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <FieldLabel htmlFor="responsibilities">
                  Key responsibilities{" "}
                  <span style={{ fontSize: 11, color: FAINT, fontWeight: 400 }}>(one per line)</span>
                </FieldLabel>
                <textarea
                  id="responsibilities"
                  value={responsibilities}
                  onChange={(e) => setResponsibilities(e.target.value)}
                  placeholder={"Define product roadmap\nCollaborate with engineering and design\nOwn quarterly OKRs"}
                  rows={4}
                  style={{ ...inputStyle(), resize: "vertical" }}
                />
              </div>

              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#111", display: "block", marginBottom: 8 }}>Visa sponsorship</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {([
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                    { value: "case_by_case", label: "Case by case" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setVisaSponsorship(opt.value)}
                      style={{
                        padding: "6px 16px",
                        borderRadius: R_MD,
                        border: `1px solid ${visaSponsorship === opt.value ? B : "#ddd"}`,
                        background: visaSponsorship === opt.value ? BL : "#fff",
                        color: visaSponsorship === opt.value ? BT : MUTED,
                        fontSize: 13,
                        fontWeight: visaSponsorship === opt.value ? 600 : 400,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Salary Band ── */}
            <div
              style={{
                background: "#fff",
                border: `0.5px solid ${BORDER}`,
                borderRadius: R_LG,
                padding: "1.5rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: ".625rem", gap: 12 }}>
                <SectionLabel>Salary Band</SectionLabel>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 500,
                    color: BT,
                    background: BL,
                    border: `1px solid ${BB}`,
                    borderRadius: 99,
                    padding: "3px 10px",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <rect x="1" y="4.5" width="8" height="5" rx="1" stroke={B} strokeWidth="1.2" />
                    <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" stroke={B} strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Not shown to candidates
                </span>
              </div>

              <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: "1rem" }}>
                Your salary range is kept strictly confidential. Candidates never see your budget — only
                whether their expectations align with it.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 14, alignItems: "end" }}>
                <div>
                  <FieldLabel htmlFor="currency">Currency</FieldLabel>
                  <select
                    id="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    style={inputStyle({ width: "auto", appearance: "auto" } as React.CSSProperties)}
                  >
                    <option value="USD">USD $</option>
                    <option value="GBP">GBP £</option>
                    <option value="EUR">EUR €</option>
                    <option value="CAD">CAD $</option>
                    <option value="AUD">AUD $</option>
                    <option value="SGD">SGD $</option>
                    <option value="CHF">CHF Fr</option>
                    <option value="NZD">NZD $</option>
                    <option value="INR">INR ₹</option>
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="budgetFloor">Minimum <span style={{ color: "red" }}>*</span></FieldLabel>
                  <input
                    id="budgetFloor"
                    type="text"
                    inputMode="numeric"
                    value={budgetFloorText}
                    onChange={(e) => setBudgetFloorText(e.target.value)}
                    placeholder="120,000"
                    style={inputStyle()}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="budgetCeiling">Maximum <span style={{ color: "red" }}>*</span></FieldLabel>
                  <input
                    id="budgetCeiling"
                    type="text"
                    inputMode="numeric"
                    value={budgetCeilingText}
                    onChange={(e) => setBudgetCeilingText(e.target.value)}
                    placeholder="155,000"
                    style={inputStyle()}
                  />
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <FieldLabel htmlFor="bonusTarget">
                  Annual bonus target{" "}
                  <span style={{ fontSize: 11, color: FAINT, fontWeight: 400 }}>(% of base, optional)</span>
                </FieldLabel>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    id="bonusTarget"
                    type="number"
                    min={0}
                    max={200}
                    value={bonusTargetPct}
                    onChange={(e) => setBonusTargetPct(e.target.value)}
                    placeholder="e.g. 15"
                    style={{ ...inputStyle(), width: 90 }}
                  />
                  <span style={{ fontSize: 14, color: MUTED }}>%</span>
                  <span style={{ fontSize: 12, color: FAINT }}>of base salary per year</span>
                </div>
              </div>
            </div>

            {/* ── Benefits ── */}
            <div
              style={{
                background: "#fff",
                border: `0.5px solid ${BORDER}`,
                borderRadius: R_LG,
                padding: "1.5rem",
              }}
            >
              <SectionLabel>Benefits Offered</SectionLabel>
              <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: "1rem" }}>
                Candidates will rank these benefits as must-have or would-like. Benefit alignment
                contributes 30% of the overall match score.
              </p>

              <div>
                <BenefitToggle
                  label="Health insurance"
                  hint="Medical, hospital cover"
                  checked={hasHealthInsurance}
                  onChange={setHasHealthInsurance}
                >
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Plan tier</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["basic", "standard", "premium"] as const).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setHealthPlan(tier)}
                        style={{
                          padding: "5px 14px",
                          borderRadius: R_MD,
                          border: `1px solid ${healthPlan === tier ? B : "#ddd"}`,
                          background: healthPlan === tier ? BL : "#fff",
                          color: healthPlan === tier ? BT : MUTED,
                          fontSize: 12,
                          fontWeight: healthPlan === tier ? 600 : 400,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textTransform: "capitalize",
                        }}
                      >
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </button>
                    ))}
                  </div>
                </BenefitToggle>

                <BenefitToggle
                  label="401(k) / retirement match"
                  hint="Employer matching contributions"
                  checked={has401k}
                  onChange={setHas401k}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>Employer match up to</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={retirementMatchPct}
                      onChange={(e) => setRetirementMatchPct(e.target.value)}
                      style={{ ...inputStyle(), width: 64, padding: "5px 8px", fontSize: 13 }}
                    />
                    <span style={{ fontSize: 12, color: MUTED }}>%</span>
                  </div>
                </BenefitToggle>

                <BenefitToggle
                  label="Dental & vision"
                  checked={hasDentalVision}
                  onChange={setHasDentalVision}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: BS }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="5" stroke={B} strokeWidth="1.2" />
                      <polyline points="3.5,6 5.5,8 9,4" stroke={B} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Both dental and vision included in the same plan
                  </div>
                </BenefitToggle>

                <BenefitToggle
                  label="Stock options / equity"
                  hint="Options, RSUs, or similar"
                  checked={hasStockOptions}
                  onChange={setHasStockOptions}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Equity type</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {(["Options", "RSUs", "Both"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setEquityType(t.toLowerCase() as "options" | "rsus" | "both")}
                            style={{
                              padding: "5px 14px",
                              borderRadius: R_MD,
                              border: `1px solid ${equityType === t.toLowerCase() ? B : "#ddd"}`,
                              background: equityType === t.toLowerCase() ? BL : "#fff",
                              color: equityType === t.toLowerCase() ? BT : MUTED,
                              fontSize: 12,
                              fontWeight: equityType === t.toLowerCase() ? 600 : 400,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Vesting schedule</div>
                      <select
                        value={vestingSchedule}
                        onChange={(e) => setVestingSchedule(e.target.value)}
                        style={inputStyle({ appearance: "auto" } as React.CSSProperties)}
                      >
                        <option value="4yr_1yr_cliff">4 years, 1-year cliff</option>
                        <option value="3yr_1yr_cliff">3 years, 1-year cliff</option>
                        <option value="4yr_monthly">4 years, monthly vesting</option>
                        <option value="3yr_monthly">3 years, monthly vesting</option>
                      </select>
                    </div>
                  </div>
                </BenefitToggle>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>Annual PTO</span>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: ptoUnlimited ? BT : MUTED, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={ptoUnlimited}
                        onChange={(e) => setPtoUnlimited(e.target.checked)}
                        style={{ accentColor: B }}
                      />
                      Unlimited
                    </label>
                  </div>
                  {ptoUnlimited ? (
                    <div style={{ ...inputStyle(), display: "flex", alignItems: "center", gap: 6, background: BL, border: `1px solid ${BB}`, color: BT }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke={B} strokeWidth="1.2" />
                        <polyline points="3.5,6 5.5,8 9,4" stroke={B} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Unlimited PTO</span>
                    </div>
                  ) : (
                    <div style={{ position: "relative" }}>
                      <input
                        id="ptoDays"
                        type="number"
                        min={0}
                        max={365}
                        value={ptoDaysText}
                        onChange={(e) => setPtoDaysText(e.target.value)}
                        style={{ ...inputStyle(), paddingRight: 40 }}
                      />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: FAINT, pointerEvents: "none" }}>days</span>
                    </div>
                  )}
                </div>
                <div>
                  <FieldLabel htmlFor="wfhSchedule">Remote / WFH</FieldLabel>
                  <select
                    id="wfhSchedule"
                    value={wfhSchedule}
                    onChange={(e) => setWfhSchedule(e.target.value)}
                    style={inputStyle({ appearance: "auto" } as React.CSSProperties)}
                  >
                    {WFH_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Error + Submit ── */}
            {formError && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#fff5f5",
                  border: "1px solid #fcc",
                  borderRadius: R_MD,
                  fontSize: 13,
                  color: "#b00020",
                }}
              >
                {formError}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: "2rem" }}>
              <button
                type="submit"
                disabled={isEditMode ? updateCase.isPending : createCase.isPending}
                style={{
                  background: B,
                  color: "#fff",
                  border: "none",
                  borderRadius: R_LG,
                  padding: "13px 28px",
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: (isEditMode ? updateCase.isPending : createCase.isPending) ? "not-allowed" : "pointer",
                  opacity: (isEditMode ? updateCase.isPending : createCase.isPending) ? 0.7 : 1,
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {isEditMode
                  ? (updateCase.isPending ? "Saving…" : "Save changes")
                  : (createCase.isPending ? "Posting…" : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke="white" strokeWidth="1.4" />
                      <line x1="7" y1="4" x2="7" y2="10" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
                      <line x1="4" y1="7" x2="10" y2="7" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    Post role{invitations.length > 0 ? ` & send ${invitations.length} invitation${invitations.length === 1 ? "" : "s"}` : ""}
                  </>
                ))}
              </button>
              <Link
                to="/corporate"
                style={{ fontSize: 14, color: MUTED, textDecoration: "none" }}
              >
                Cancel
              </Link>
            </div>
          </div>

          {/* ── RIGHT: Invitations panel ── */}
          <div style={{ position: "sticky", top: 20 }}>
            {/* How it works mini-summary */}
            <div
              style={{
                background: NAVY,
                borderRadius: R_LG,
                padding: "1.5rem",
                marginBottom: 14,
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".1em", color: "#5ab870", marginBottom: ".625rem" }}>
                How matching works
              </p>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
                {[
                  { num: "1", label: "Post this listing", note: "Your salary range stays confidential" },
                  { num: "2", label: "Invite candidates", note: "They receive a secure personalised link" },
                  { num: "3", label: "They submit privately", note: "Salary expectations — never shown to you" },
                  { num: "4", label: "SalarySafe matches", note: "You see only a directional label" },
                ].map((step) => (
                  <div key={step.num} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: step.num === "1" || step.num === "2" ? NAVY : step.num === "3" ? B : "#7F7589",
                        border: "1px solid rgba(255,255,255,.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {step.num}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", lineHeight: 1.3 }}>{step.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 2 }}>{step.note}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "1.25rem", borderTop: "0.5px solid rgba(255,255,255,.1)", paddingTop: "1rem" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 8 }}>Employer sees — salary alignment strength</div>
                <AlignmentStrengthBar pct={92} label="Strong" />
                <div style={{ marginTop: 8 }}>
                  <AlignmentStrengthBar pct={55} label="Partial" />
                </div>
                <div style={{ marginTop: 8 }}>
                  <AlignmentStrengthBar pct={20} label="No match" />
                </div>
              </div>
            </div>
            {/* Invitations card */}
            <div
              style={{
                background: "#fff",
                border: `0.5px solid ${BORDER}`,
                borderRadius: R_LG,
                padding: "1.5rem",
              }}
            >
              <SectionLabel>Invite Candidates</SectionLabel>
              <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: "1rem" }}>
                Add the candidates you want to invite. Each will receive a secure, tokenised link to
                submit their salary expectations privately.
              </p>

              {/* ── Bulk paste panel ── */}
              <div
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: R_MD,
                  marginBottom: "1rem",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => { setBulkPasteOpen((o) => !o); setBulkParseError(null); }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    background: bulkPasteOpen ? BL : SURFACE,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 500,
                    color: bulkPasteOpen ? BT : "#111",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <rect x="1" y="3" width="11" height="9" rx="1.5" stroke={bulkPasteOpen ? BT : MUTED} strokeWidth="1.3" />
                      <path d="M4 1h5" stroke={bulkPasteOpen ? BT : MUTED} strokeWidth="1.3" strokeLinecap="round" />
                      <path d="M3 6.5h7M3 9h5" stroke={bulkPasteOpen ? BT : MUTED} strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    Paste a list of emails
                  </span>
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    style={{ transform: bulkPasteOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}
                  >
                    <polyline points="2,4 6,8 10,4" stroke={MUTED} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {bulkPasteOpen && (
                  <div style={{ padding: "12px", borderTop: `1px solid ${BORDER}`, background: "#fff" }}>
                    <p style={{ fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 1.6 }}>
                      Paste any format — comma-separated, newline-separated, <code style={{ fontSize: 11 }}>"Name &lt;email&gt;"</code> strings, spreadsheet columns, etc. The AI will extract valid name/email pairs.
                    </p>
                    <textarea
                      value={bulkPasteText}
                      onChange={(e) => setBulkPasteText(e.target.value)}
                      placeholder={"john@acme.com, Jane Smith <jane@corp.io>\nsara@example.com"}
                      rows={5}
                      style={{ ...inputStyle({ resize: "vertical", fontSize: 13 }) }}
                    />
                    {bulkParseError && (
                      <p style={{ fontSize: 12, color: "#b00020", margin: "6px 0 0" }}>{bulkParseError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleBulkParse}
                      disabled={parseInvitations.isPending || !bulkPasteText.trim()}
                      style={{
                        marginTop: 8,
                        width: "100%",
                        padding: "9px 16px",
                        background: parseInvitations.isPending || !bulkPasteText.trim() ? SURFACE : B,
                        border: "none",
                        borderRadius: R_MD,
                        fontSize: 13,
                        fontWeight: 500,
                        color: parseInvitations.isPending || !bulkPasteText.trim() ? FAINT : "#fff",
                        cursor: parseInvitations.isPending || !bulkPasteText.trim() ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                        transition: "background .15s",
                      }}
                    >
                      {parseInvitations.isPending ? "Parsing…" : "Parse & Add to List"}
                    </button>
                  </div>
                )}
              </div>

              {/* Add invite form */}
              <form onSubmit={handleAddInvitation} style={{ marginBottom: "1rem" }}>
                <div style={{ marginBottom: 8 }}>
                  <input
                    type="text"
                    value={inviteeName}
                    onChange={(e) => setInviteeName(e.target.value)}
                    placeholder="Full name"
                    style={{ ...inputStyle(), marginBottom: 8 }}
                  />
                  <input
                    type="email"
                    value={inviteeEmail}
                    onChange={(e) => setInviteeEmail(e.target.value)}
                    placeholder="email@example.com"
                    style={inputStyle()}
                  />
                </div>
                {inviteError && (
                  <p style={{ fontSize: 12, color: "#b00020", marginBottom: 8 }}>{inviteError}</p>
                )}
                <button
                  type="submit"
                  style={{
                    width: "100%",
                    padding: "9px 16px",
                    background: "#fff",
                    border: `1px solid ${BB}`,
                    borderRadius: R_MD,
                    fontSize: 13,
                    fontWeight: 500,
                    color: BT,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <line x1="6" y1="1" x2="6" y2="11" stroke={B} strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="1" y1="6" x2="11" y2="6" stroke={B} strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  Add to invitation list
                </button>
              </form>

              {/* Invitation list */}
              {invitations.length === 0 ? (
                <div
                  style={{
                    padding: "1.25rem",
                    background: SURFACE,
                    borderRadius: R_MD,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 13, color: FAINT }}>No invitations added yet.</div>
                  <div style={{ fontSize: 11, color: FAINT, marginTop: 4, lineHeight: 1.5 }}>
                    You can also invite candidates after posting.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {invitations.map((inv, idx) => (
                    <div
                      key={inv.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        background: idx % 2 === 0 ? SURFACE : "#fff",
                        border: `0.5px solid ${BORDER}`,
                        borderRadius: R_MD,
                      }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          background: BL,
                          border: `1px solid ${BB}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 600,
                          color: BT,
                          flexShrink: 0,
                        }}
                      >
                        {inv.name
                          .split(" ")
                          .map((p) => p[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {inv.name}
                        </div>
                        <div style={{ fontSize: 11, color: FAINT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {inv.email}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeInvitation(inv.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                          color: FAINT,
                          borderRadius: 4,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                        title="Remove"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  <div
                    style={{
                      padding: "8px 12px",
                      background: BL,
                      border: `1px solid ${BB}`,
                      borderRadius: R_MD,
                      fontSize: 12,
                      color: BS,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="5" stroke={B} strokeWidth="1.2" />
                      <line x1="6" y1="5" x2="6" y2="8.5" stroke={B} strokeWidth="1.2" strokeLinecap="round" />
                      <circle cx="6" cy="3.5" r=".7" fill={B} />
                    </svg>
                    {invitations.length} candidate{invitations.length === 1 ? "" : "s"} will receive a secure invitation link on submit.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
