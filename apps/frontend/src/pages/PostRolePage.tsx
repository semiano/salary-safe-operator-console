import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { getTokenRole } from "../auth/token";
import { useAutofillRole } from "../hooks/useCases";
import { GuidedBenchmark } from "../components/GuidedBenchmark";
import { MatchingInfoPopover } from "../components/MatchingInfoPopover";
import { copyToClipboard } from "../utils/clipboard";
import { useCreateCase } from "../hooks/useCases";
import { useParseInvitations } from "../hooks/useCases";
import { useCaseDetail, useUpdateCase } from "../hooks/useCaseEditor";
import { useJobListings, useJobListing, useSetJobListingStatus } from "../hooks/useJobListings";
import { extractCaseMeta } from "../utils/caseMeta";
import { usePhase1Bids, useGenerateRandomInvitation, useSendPhase1BidInvitations } from "../hooks/usePhase1Bids";

// ─── Brand tokens (matching salarysafe.ai design language) ────────────────────
const B = "#019529";
const BL = "#eaf7ed";
const BB = "#b8dfc0";
const BT = "#0a4a1a";
const BS = "#2a6b3a";
const NAVY = "#1B1035";
const AI_ORANGE = "#f97316";
const AI_ORANGE_DARK = "#ea580c";
const AI_ORANGE_LIGHT = "#ffedd5";
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

/** UUID v4 generator that works in both secure (HTTPS) and insecure (HTTP) contexts.
 *  crypto.randomUUID() is restricted to secure contexts; crypto.getRandomValues() is not. */
function genId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

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

// ─── Main page ─────────────────────────────────────────────────────────────────

export function PostRolePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editCaseId = searchParams.get("edit") ?? "";
  const isEditMode = Boolean(editCaseId);

  // Guided flow phases
  const [phase, setPhase] = useState<"details" | "benchmark" | "invitations">("details");
  // The saved listing id once the base record exists (new mode). In edit mode the
  // record already exists, so the effective id is the edit target.
  const [savedListingId, setSavedListingId] = useState<string | null>(null);
  const effectiveListingId = isEditMode ? editCaseId : (savedListingId ?? "");

  const createCase = useCreateCase();
  const updateCase = useUpdateCase(effectiveListingId);
  const sendInvitations = useSendPhase1BidInvitations();
  const randomInvite = useGenerateRandomInvitation();
  const { data: existingCase, isLoading: editLoading } = useCaseDetail(editCaseId);
  const autofillRole = useAutofillRole();

  // Source-of-truth invitations (phase1 bids) and listing summary for this listing
  const { data: existingBids = [] } = usePhase1Bids(effectiveListingId || null);
  const { data: listingSummary } = useJobListing(effectiveListingId || null);
  const { data: allListings = [] } = useJobListings();
  const setListingStatus = useSetJobListingStatus();
  const [cancelConfirmText, setCancelConfirmText] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showListingDropdown, setShowListingDropdown] = useState(false);
  const [listingSearch, setListingSearch] = useState("");

  const isAdmin = getTokenRole() === "admin";

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

  const salaryBandTargetText = useMemo(() => {
    const floor = Number(budgetFloorText.replace(/[$,\s]/g, ""));
    const ceiling = Number(budgetCeilingText.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(floor) || !Number.isFinite(ceiling) || floor <= 0 || ceiling <= floor) {
      return "";
    }
    return Math.round((floor + ceiling) / 2).toLocaleString();
  }, [budgetFloorText, budgetCeilingText]);

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
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdInviteTokens, setCreatedInviteTokens] = useState<Array<{ name: string; email: string; token: string }>>([]);
  const [randomInviteStatus, setRandomInviteStatus] = useState<string | null>(null);

  const recordExists = isEditMode || Boolean(savedListingId);

  // ── Details dirty tracking ───────────────────────────────────────────────────
  const detailsSig = useMemo(
    () =>
      JSON.stringify([
        jobTitle, category, workArrangement, location, jobDescription, responsibilities,
        budgetFloorText, budgetCeilingText, currency, seniorityLevel, employmentType, visaSponsorship,
        hasHealthInsurance, has401k, hasDentalVision, hasStockOptions, ptoUnlimited, ptoDaysText,
        wfhSchedule, bonusTargetPct, healthPlan, retirementMatchPct, equityType, vestingSchedule,
      ]),
    [
      jobTitle, category, workArrangement, location, jobDescription, responsibilities,
      budgetFloorText, budgetCeilingText, currency, seniorityLevel, employmentType, visaSponsorship,
      hasHealthInsurance, has401k, hasDentalVision, hasStockOptions, ptoUnlimited, ptoDaysText,
      wfhSchedule, bonusTargetPct, healthPlan, retirementMatchPct, equityType, vestingSchedule,
    ]
  );
  const [savedDetailsSig, setSavedDetailsSig] = useState<string | null>(null);
  const [needBaseline, setNeedBaseline] = useState(false);
  useEffect(() => {
    if (needBaseline) {
      setSavedDetailsSig(detailsSig);
      setNeedBaseline(false);
    }
  }, [needBaseline, detailsSig]);
  const detailsDirty = recordExists && savedDetailsSig !== null && savedDetailsSig !== detailsSig;

  // ── Invitations: bids are the source of truth ────────────────────────────────
  const existingInviteEmails = useMemo(
    () =>
      new Set(
        existingBids
          .map((b) => (b.candidate_email ?? "").toLowerCase().trim())
          .filter(Boolean)
      ),
    [existingBids]
  );
  // Locally-added invitations not yet persisted as bids.
  const pendingInvitations = useMemo(
    () => invitations.filter((inv) => !existingInviteEmails.has(inv.email.toLowerCase().trim())),
    [invitations, existingInviteEmails]
  );
  const totalInviteCount = existingBids.length + pendingInvitations.length;

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
          .map((inv) => ({ id: genId(), name: String(inv.name ?? ""), email: String(inv.email ?? "") }))
      );
    }
    // Capture the loaded values as the clean baseline for dirty tracking.
    setNeedBaseline(true);
  }, [existingCase]);

  // ── Autofill ─────────────────────────────────────────────────────────────────

  async function handleAutofill() {
    setFormError(null);
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
          id: genId(),
          name: inv.name,
          email: inv.email,
        }))
      );
    } catch (err) {
      console.error("AI Autofill error:", err);
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
    if (existingInviteEmails.has(emailTrimmed.toLowerCase())) {
      setInviteError("That candidate has already been invited.");
      return;
    }
    setInvitations((prev) => [
      ...prev,
      { id: genId(), name: inviteeName.trim(), email: emailTrimmed },
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
            !added.some((a) => a.email.toLowerCase() === emailLower) &&
            !existingInviteEmails.has(emailLower)) {
          added.push({ id: genId(), name: inv.name, email: inv.email });
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

  // ── Save base record (Details phase) ─────────────────────────────────────────

  function buildPayload() {
    const floor = Number(budgetFloorText.replace(/[$,\s]/g, ""));
    const ceiling = Number(budgetCeilingText.replace(/[$,\s]/g, ""));
    const ptoDays = ptoUnlimited ? "unlimited" : (Number(ptoDaysText) || 15);
    const wfhDaysNum = wfhSchedule === "full" ? 5 : wfhSchedule === "none" ? 0 : wfhSchedule === "flexible" ? null : (Number(wfhSchedule) || 0);
    const responsibilitiesList = responsibilities
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);

    return {
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
  }

  function validateDetails(): boolean {
    if (!jobTitle.trim()) {
      setFormError("Job title is required.");
      return false;
    }
    const floor = Number(budgetFloorText.replace(/[$,\s]/g, ""));
    const ceiling = Number(budgetCeilingText.replace(/[$,\s]/g, ""));
    if (!budgetFloorText || !Number.isFinite(floor) || floor <= 0) {
      setFormError("A valid minimum salary is required.");
      return false;
    }
    if (!budgetCeilingText || !Number.isFinite(ceiling) || ceiling <= 0) {
      setFormError("A valid maximum salary is required.");
      return false;
    }
    if (floor >= ceiling) {
      setFormError("Maximum salary must be greater than the minimum salary.");
      return false;
    }
    return true;
  }

  async function handleSaveDetails(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validateDetails()) return;

    // Nothing changed on an existing record — skip the save and advance.
    if (recordExists && !detailsDirty) {
      setPhase("benchmark");
      return;
    }

    const payload = buildPayload();
    try {
      if (recordExists) {
        await updateCase.mutateAsync(payload);
      } else {
        const created = await createCase.mutateAsync(payload);
        setSavedListingId(created.id);
      }
      setSavedDetailsSig(detailsSig);
      setPhase("benchmark");
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : recordExists
          ? "Failed to save changes. Please try again."
          : "Failed to create job listing. Please try again."
      );
    }
  }

  // ── Candidate invitations (Invitations phase) ────────────────────────────────

  async function handleRandomInvite() {
    if (!effectiveListingId) return;
    setRandomInviteStatus(null);
    try {
      const created = await randomInvite.mutateAsync(effectiveListingId);
      const url = `${window.location.origin}/apply/${created.token}`;
      setCreatedInviteTokens((prev) => [
        ...prev,
        { name: created.candidate_name ?? "Random candidate", email: created.candidate_email ?? "—", token: created.token },
      ]);
      void copyToClipboard(url);
      setRandomInviteStatus("Random invitation generated — link copied to clipboard.");
    } catch (err) {
      setRandomInviteStatus(err instanceof Error ? err.message : "Failed to generate a random invitation.");
    }
  }

  async function handleSendInvitations() {
    setFormError(null);
    if (!effectiveListingId) {
      setFormError("Save the listing before sending invitations.");
      return;
    }
    try {
      if (pendingInvitations.length > 0) {
        const createdBids = await sendInvitations.mutateAsync({
          caseId: effectiveListingId,
          invitations: pendingInvitations.map((inv) => ({
            candidate_email: inv.email,
            candidate_name: inv.name || null,
          })),
        });
        setCreatedInviteTokens((prev) => [
          ...prev,
          ...createdBids.map((bid, i) => ({
            name: pendingInvitations[i]?.name ?? bid.candidate_name ?? "",
            email: bid.candidate_email ?? pendingInvitations[i]?.email ?? "",
            token: bid.token,
          })),
        ]);
      }
      setShowSuccess(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to send invitations. Please try again.");
    }
  }

  async function handleConfirmCancel() {
    if (!effectiveListingId) return;
    try {
      await setListingStatus.mutateAsync({ listingId: effectiveListingId, status: "cancelled" });
      setShowCancelModal(false);
      setCancelConfirmText("");
    } catch {
      /* surfaced via setListingStatus.isError */
    }
  }

  async function handleUncancel() {
    if (!effectiveListingId) return;
    try {
      await setListingStatus.mutateAsync({ listingId: effectiveListingId, status: "active" });
    } catch {
      /* surfaced via setListingStatus.isError */
    }
  }

  // ── Edit mode loading guard ─────────────────────────────────────────
  if (isEditMode && editLoading) {
    return <div style={{ padding: "3rem", textAlign: "center", color: MUTED, fontSize: 14 }}>Loading job listing…</div>;
  }

  // ── Success screen ───────────────────────────────────────────────────────────

  if (showSuccess) {
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
                          onClick={() => { void copyToClipboard(url); }}
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
                setShowSuccess(false);
                setSavedListingId(null);
                setPhase("details");
                setCreatedInviteTokens([]);
                setRandomInviteStatus(null);
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

  const currentStatus = (listingSummary?.status ?? existingCase?.status ?? "active").toLowerCase();
  const isCancelled = currentStatus === "cancelled";
  const listingCreatedAt = listingSummary?.created_at ?? null;
  const phaseTitle =
    phase === "details"
      ? "Step 1: role details & confidential compensation"
      : phase === "benchmark"
      ? "Step 2: benchmark compensation"
      : "Step 3: invite candidates";
  const phaseDesc =
    phase === "details"
      ? "Capture the role, benefits, and your confidential salary band. These figures stay private — candidates only ever see a directional alignment label."
      : phase === "benchmark"
      ? "Compare this role against internal HRIS cohorts and external market evidence, then apply an AI-grounded compensation recommendation."
      : "Invite candidates with secure, personalised links. Each invitee submits salary expectations privately — never revealed back to you as raw figures.";
  const filteredListings = allListings.filter((l) => {
    if (!listingSearch.trim()) return true;
    const m = extractCaseMeta(l);
    const hay = `${m.jobTitle ?? ""} ${l.title} ${l.jurisdiction ?? ""} ${l.status}`.toLowerCase();
    return hay.includes(listingSearch.toLowerCase());
  });

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
        <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{isEditMode ? "Edit Job Listing" : "Post Job Listing (New)"}</span>
      </div>

      {/* ── Persistent listing info + cancel panel (edit / saved mode) ── */}
      {recordExists && (
        <div
          style={{
            background: "#fff",
            border: `1px solid ${isCancelled ? "#fecaca" : BORDER}`,
            borderLeft: `4px solid ${isCancelled ? "#dc2626" : B}`,
            borderRadius: R_LG,
            padding: "14px 18px",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: FAINT, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Listing</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>
                {jobTitle || listingSummary?.title || "Untitled listing"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: FAINT, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Status</div>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 2,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "2px 10px",
                  borderRadius: 99,
                  background: isCancelled ? "#fee2e2" : BL,
                  color: isCancelled ? "#b91c1c" : BT,
                }}
              >
                {isCancelled ? "Cancelled" : "Active"}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: FAINT, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Created</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginTop: 2 }}>
                {listingCreatedAt
                  ? new Date(listingCreatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: FAINT, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Invitations</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginTop: 2 }}>{existingBids.length}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <MatchingInfoPopover />
            {isCancelled ? (
              <button
                type="button"
                onClick={handleUncancel}
                disabled={setListingStatus.isPending}
                style={{
                  padding: "9px 16px",
                  background: BL,
                  border: `1px solid ${BB}`,
                  borderRadius: R_MD,
                  color: BT,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: setListingStatus.isPending ? "not-allowed" : "pointer",
                  opacity: setListingStatus.isPending ? 0.6 : 1,
                  fontFamily: "inherit",
                }}
              >
                {setListingStatus.isPending ? "Restoring…" : "Un-cancel listing"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setCancelConfirmText(""); setShowCancelModal(true); }}
                style={{
                  padding: "9px 16px",
                  background: "#fff",
                  border: "1px solid #fca5a5",
                  borderRadius: R_MD,
                  color: "#dc2626",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancel job listing
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Phase explanation header (blue / purple) ── */}
      <section
        style={{
          borderRadius: 20,
          padding: "22px 26px",
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #1e293b 100%)",
          color: "#f8fafc",
          boxShadow: "0 16px 44px rgba(30,27,75,0.22)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#c4b5fd" }}>
              {isEditMode ? "Job Listing Editor" : "New Job Listing"}
            </div>
            <h1 style={{ margin: "8px 0 6px", fontSize: 26, fontWeight: 800, lineHeight: 1.15 }}>{phaseTitle}</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#cbd5e1", lineHeight: 1.6, maxWidth: 600 }}>{phaseDesc}</p>
            {phase === "details" && (
              <button
                type="button"
                onClick={handleAutofill}
                disabled={autofillRole.isPending}
                style={{
                  marginTop: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 16px",
                  background: autofillRole.isPending ? AI_ORANGE_LIGHT : AI_ORANGE,
                  color: autofillRole.isPending ? AI_ORANGE_DARK : "#fff",
                  border: `1px solid ${autofillRole.isPending ? "#fdba74" : AI_ORANGE_DARK}`,
                  borderRadius: R_LG,
                  fontSize: 13,
                  fontWeight: 600,
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
                      <rect x="1.25" y="1.25" width="11.5" height="11.5" rx="3" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M4 9.6V4.4h1.2l1.4 2.5 1.4-2.5h1.2v5.2H8v-3l-1.2 2.1H6.6L5.4 6.6v3H4z" fill="currentColor" />
                      <path d="M10 9.6V4.4h2.8v1h-1.6v1.1h1.4v1h-1.4v2.1H10z" fill="currentColor" />
                    </svg>
                    AI Autofill
                  </>
                )}
              </button>
            )}
          </div>

          {/* Listing selector */}
          <div style={{ minWidth: 260, position: "relative" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>
              Job listing
            </div>
            <div
              onClick={() => setShowListingDropdown((v) => !v)}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {recordExists
                  ? `${jobTitle || listingSummary?.title || "Untitled listing"}`
                  : "New listing (unsaved)"}
              </span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 8, opacity: 0.6, flexShrink: 0 }}>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {showListingDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  background: "#fff",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
                  zIndex: 200,
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "8px 10px", borderBottom: `1px solid ${BORDER}` }}>
                  <input
                    autoFocus
                    type="text"
                    value={listingSearch}
                    onChange={(e) => setListingSearch(e.target.value)}
                    placeholder="Search by title, role, location…"
                    style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: NAVY, padding: "4px 0", fontFamily: "inherit" }}
                  />
                </div>
                <div style={{ maxHeight: 260, overflowY: "auto" }}>
                  <div
                    onClick={() => {
                      setShowListingDropdown(false);
                      setListingSearch("");
                      navigate("/job-listings/new");
                    }}
                    style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: BT, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <line x1="6" y1="2" x2="6" y2="10" stroke={B} strokeWidth="1.6" strokeLinecap="round" />
                      <line x1="2" y1="6" x2="10" y2="6" stroke={B} strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    Start a new listing
                  </div>
                  {filteredListings.length === 0 ? (
                    <div style={{ padding: "12px 14px", fontSize: 13, color: MUTED }}>No listings found.</div>
                  ) : (
                    filteredListings.map((l) => {
                      const m = extractCaseMeta(l);
                      const isSelected = l.id === effectiveListingId;
                      return (
                        <div
                          key={l.id}
                          onClick={() => {
                            setShowListingDropdown(false);
                            setListingSearch("");
                            setPhase("details");
                            setSavedListingId(null);
                            setSavedDetailsSig(null);
                            navigate(`/job-listings/new?edit=${l.id}`);
                          }}
                          style={{
                            padding: "10px 14px",
                            cursor: "pointer",
                            fontSize: 13,
                            color: NAVY,
                            background: isSelected ? "#eef2ff" : "#fff",
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? "#eef2ff" : "#fff")}
                        >
                          <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {m.jobTitle || l.title}
                          </div>
                          <div style={{ fontSize: 11, color: MUTED }}>
                            {l.jurisdiction ?? "—"} · {l.currency} · {l.status}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Cancel confirmation modal (heavy confirmation) ── */}
      {showCancelModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: 20,
          }}
          onClick={() => { if (!setListingStatus.isPending) setShowCancelModal(false); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: R_LG,
              padding: "1.75rem",
              maxWidth: 460,
              width: "100%",
              boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2L18.5 17H1.5L10 2z" stroke="#dc2626" strokeWidth="1.5" strokeLinejoin="round" />
                  <line x1="10" y1="8" x2="10" y2="12" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="14.5" r="0.9" fill="#dc2626" />
                </svg>
              </div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111" }}>Cancel this job listing?</h3>
            </div>
            <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.65, marginBottom: 16 }}>
              Cancelling marks <strong style={{ color: "#111" }}>{jobTitle || listingSummary?.title || "this listing"}</strong> as no longer active.
              {existingBids.length > 0 && ` It currently has ${existingBids.length} candidate invitation${existingBids.length === 1 ? "" : "s"}.`}{" "}
              You can un-cancel it later. To confirm, type <strong style={{ color: "#dc2626" }}>CANCEL</strong> below.
            </p>
            <input
              type="text"
              value={cancelConfirmText}
              onChange={(e) => setCancelConfirmText(e.target.value)}
              placeholder="Type CANCEL to confirm"
              style={{ ...inputStyle(), marginBottom: 8, borderColor: "#fca5a5" }}
            />
            {setListingStatus.isError && (
              <p style={{ fontSize: 12, color: "#b00020", margin: "0 0 8px" }}>Failed to cancel the listing. Please try again.</p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={setListingStatus.isPending}
                style={{
                  padding: "9px 18px",
                  background: "#fff",
                  border: `1px solid ${BORDER}`,
                  borderRadius: R_MD,
                  color: "#111",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Keep listing
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelConfirmText.trim().toUpperCase() !== "CANCEL" || setListingStatus.isPending}
                style={{
                  padding: "9px 18px",
                  background: cancelConfirmText.trim().toUpperCase() === "CANCEL" && !setListingStatus.isPending ? "#dc2626" : "#fca5a5",
                  border: "none",
                  borderRadius: R_MD,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: cancelConfirmText.trim().toUpperCase() === "CANCEL" && !setListingStatus.isPending ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                }}
              >
                {setListingStatus.isPending ? "Cancelling…" : "Cancel listing"}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "details" && autofillRole.isSuccess && (
        <div
          style={{
            marginBottom: "1.5rem",
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

      {!recordExists && (
        <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <span style={{ fontSize: 12, color: MUTED }}>New to confidential matching?</span>
          <MatchingInfoPopover />
        </div>
      )}

      {/* ── Phase stepper ── */}
      <div
        style={{
          display: "flex",
          background: "#fff",
          border: `0.5px solid ${BORDER}`,
          borderRadius: R_LG,
          overflow: "hidden",
          marginBottom: "1.75rem",
        }}
      >
        {([
          { key: "details", label: "1 · Role & Compensation" },
          { key: "benchmark", label: "2 · Benchmarking" },
          { key: "invitations", label: "3 · Candidate Invitations" },
        ] as const).map((s, idx) => {
          const isActive = phase === s.key;
          const isLocked = s.key !== "details" && !recordExists;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => { if (!isLocked) setPhase(s.key); }}
              disabled={isLocked}
              style={{
                flex: 1,
                padding: "14px 18px",
                background: isActive ? NAVY : "#fff",
                color: isActive ? "#fff" : isLocked ? FAINT : "#111",
                border: "none",
                borderRight: idx < 2 ? `0.5px solid ${BORDER}` : "none",
                cursor: isLocked ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                fontFamily: "inherit",
                opacity: isLocked ? 0.55 : 1,
              }}
              title={isLocked ? "Save the role details first to unlock this step" : undefined}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {phase === "details" && (
      <form onSubmit={handleSaveDetails}>
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
                background: "#f5f7fb",
                border: "1px solid #d4d9e5",
                borderRadius: R_LG,
                padding: "1.5rem",
                boxShadow: "0 4px 14px rgba(16, 24, 40, 0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: ".5rem", gap: 12 }}>
                <div>
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".12em",
                      color: "#2f3650",
                      margin: 0,
                    }}
                  >
                    Confidential Salary Band
                  </p>
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#2f3650",
                    background: "#ffffff",
                    border: "1px solid #cfd5e3",
                    borderRadius: 99,
                    padding: "4px 10px",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <rect x="1.5" y="5" width="9" height="5.5" rx="1.2" stroke="#4a5572" strokeWidth="1.2" />
                    <path d="M3.5 5V3.7a2.5 2.5 0 0 1 5 0V5" stroke="#4a5572" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Only you see this
                </span>
              </div>

              <p style={{ fontSize: 13, color: "#4f5772", lineHeight: 1.6, marginBottom: "1rem" }}>
                Set your band, then benchmark it below. Candidates see a directional fit label, never the
                figures.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 280px) 1fr", gap: 14, alignItems: "end", marginBottom: 14 }}>
                <div>
                  <FieldLabel htmlFor="currency">Currency</FieldLabel>
                  <select
                    id="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    style={inputStyle({ width: "100%", appearance: "auto", background: "#f7f8fc", borderColor: "#cfd5e3" } as React.CSSProperties)}
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
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(170px, 1fr))", gap: 14, alignItems: "end" }}>
                <div>
                  <FieldLabel htmlFor="budgetFloor">Minimum <span style={{ color: "red" }}>*</span></FieldLabel>
                  <input
                    id="budgetFloor"
                    type="text"
                    inputMode="numeric"
                    value={budgetFloorText}
                    onChange={(e) => setBudgetFloorText(e.target.value)}
                    placeholder="120,000"
                    style={inputStyle({ background: "#f7f8fc", borderColor: "#cfd5e3" })}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="budgetTarget">Target</FieldLabel>
                  <input
                    id="budgetTarget"
                    type="text"
                    value={salaryBandTargetText ? `$ ${salaryBandTargetText}` : ""}
                    placeholder="$ 142,000"
                    readOnly
                    aria-readonly="true"
                    style={inputStyle({ background: "#eef1f8", borderColor: "#cfd5e3", color: "#2f3650" })}
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
                    style={inputStyle({ background: "#f7f8fc", borderColor: "#cfd5e3" })}
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
                    step="any"
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

            {/* ── Details footer ── */}
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
                disabled={createCase.isPending || updateCase.isPending}
                style={{
                  background: B,
                  color: "#fff",
                  border: "none",
                  borderRadius: R_LG,
                  padding: "13px 28px",
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: (createCase.isPending || updateCase.isPending) ? "not-allowed" : "pointer",
                  opacity: (createCase.isPending || updateCase.isPending) ? 0.7 : 1,
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {(createCase.isPending || updateCase.isPending)
                  ? "Saving…"
                  : !recordExists
                  ? "Save & Continue to Benchmarking →"
                  : detailsDirty
                  ? "Save Changes & Continue to Benchmarking →"
                  : "Continue to Benchmarking →"}
              </button>
              <Link
                to="/job-listings"
                style={{ fontSize: 14, color: MUTED, textDecoration: "none" }}
              >
                Cancel
              </Link>
            </div>
        </div>
      </form>
      )}

      {/* ── Phase: Benchmark ── */}
      {phase === "benchmark" && (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {effectiveListingId ? (
          <GuidedBenchmark listingId={effectiveListingId} />
        ) : (
          <div style={{ padding: "2rem", textAlign: "center", color: MUTED, fontSize: 14, background: "#fff", border: `0.5px solid ${BORDER}`, borderRadius: R_LG }}>
            Save the role details first to start benchmarking.
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: "2rem" }}>
          <button
            type="button"
            onClick={() => setPhase("details")}
            style={{
              background: "#fff",
              color: "#111",
              border: `1px solid ${BORDER}`,
              borderRadius: R_LG,
              padding: "11px 22px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ← Back to details
          </button>
          <button
            type="button"
            onClick={() => setPhase("invitations")}
            style={{
              background: B,
              color: "#fff",
              border: "none",
              borderRadius: R_LG,
              padding: "11px 24px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Continue to Candidate Invitations →
          </button>
        </div>
      </div>
      )}

      {/* ── Phase: Invitations ── */}
      {phase === "invitations" && (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
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

              {isAdmin && (
                <div style={{ marginBottom: "1rem" }}>
                  <button
                    type="button"
                    onClick={handleRandomInvite}
                    disabled={randomInvite.isPending || !effectiveListingId}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 16px",
                      background: "#fff7ed",
                      border: "1.5px solid #fb923c",
                      borderRadius: R_MD,
                      color: "#ea580c",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: (randomInvite.isPending || !effectiveListingId) ? "not-allowed" : "pointer",
                      opacity: (randomInvite.isPending || !effectiveListingId) ? 0.6 : 1,
                      fontFamily: "inherit",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <circle cx="6.5" cy="6.5" r="5.5" stroke="#ea580c" strokeWidth="1.3" />
                      <line x1="6.5" y1="3.5" x2="6.5" y2="9.5" stroke="#ea580c" strokeWidth="1.3" strokeLinecap="round" />
                      <line x1="3.5" y1="6.5" x2="9.5" y2="6.5" stroke="#ea580c" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    {randomInvite.isPending ? "Generating…" : "Add New Random Invitation"}
                  </button>
                  <span style={{ marginLeft: 10, fontSize: 11, color: FAINT }}>Admin only — generates a demo candidate invite link.</span>
                  {randomInviteStatus && (
                    <div style={{ marginTop: 8, fontSize: 12, color: BT }}>{randomInviteStatus}</div>
                  )}
                </div>
              )}

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

              {/* Already-invited candidates (source of truth = phase1 bids) */}
              {existingBids.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <circle cx="6.5" cy="6.5" r="5.5" stroke={B} strokeWidth="1.2" />
                      <polyline points="4,6.5 5.8,8.3 9,5" stroke={B} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Invited candidates ({existingBids.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {existingBids.map((bid, idx) => {
                      const name = bid.candidate_name?.trim() || bid.candidate_email || "Invited candidate";
                      const statusMeta =
                        bid.submission_status === "applicant_bid_submitted"
                          ? { label: "Submitted", bg: "#fef3c7", fg: "#92400e" }
                          : bid.submission_status === "response_sent"
                          ? { label: "Responded", bg: BL, fg: BT }
                          : { label: "Invited", bg: "#eff6ff", fg: "#1d4ed8" };
                      return (
                        <div
                          key={bid.id}
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
                            {name
                              .split(" ")
                              .map((p) => p[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {name}
                            </div>
                            <div style={{ fontSize: 11, color: FAINT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {bid.candidate_email ?? "—"}
                            </div>
                          </div>
                          <span
                            style={{
                              flexShrink: 0,
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "3px 9px",
                              borderRadius: 99,
                              background: statusMeta.bg,
                              color: statusMeta.fg,
                            }}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pending invitations (added locally, not yet sent) */}
              {pendingInvitations.length === 0 ? (
                <div
                  style={{
                    padding: "1.25rem",
                    background: SURFACE,
                    borderRadius: R_MD,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 13, color: FAINT }}>
                    {existingBids.length > 0 ? "No new invitations to send." : "No invitations added yet."}
                  </div>
                  <div style={{ fontSize: 11, color: FAINT, marginTop: 4, lineHeight: 1.5 }}>
                    You can also invite candidates after posting.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pendingInvitations.map((inv, idx) => (
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
                    {pendingInvitations.length} candidate{pendingInvitations.length === 1 ? "" : "s"} will receive a secure invitation link on submit.
                  </div>
                </div>
              )}
            </div>

            {sendInvitations.isError && (
              <div style={{ padding: "12px 16px", background: "#fff5f5", border: "1px solid #fcc", borderRadius: R_MD, fontSize: 13, color: "#b00020" }}>
                Could not send invitations. Please try again.
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: "2rem" }}>
              <button
                type="button"
                onClick={() => setPhase("benchmark")}
                style={{
                  background: "#fff",
                  color: "#111",
                  border: `1px solid ${BORDER}`,
                  borderRadius: R_LG,
                  padding: "11px 22px",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ← Back to benchmarking
              </button>
              <button
                type="button"
                onClick={handleSendInvitations}
                disabled={sendInvitations.isPending || totalInviteCount === 0}
                style={{
                  background: B,
                  color: "#fff",
                  border: "none",
                  borderRadius: R_LG,
                  padding: "11px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: (sendInvitations.isPending || totalInviteCount === 0) ? "not-allowed" : "pointer",
                  opacity: (sendInvitations.isPending || totalInviteCount === 0) ? 0.6 : 1,
                  fontFamily: "inherit",
                }}
              >
                {sendInvitations.isPending
                  ? "Sending…"
                  : pendingInvitations.length > 0
                  ? `Save & send invitation${pendingInvitations.length === 1 ? "" : "s"}`
                  : "Finish"}
              </button>
            </div>
      </div>
      )}
    </div>
  );
}
