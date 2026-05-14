type Party = {
  party_type: "candidate" | "company";
  public_payload: Record<string, unknown>;
  confidential_payload: Record<string, unknown>;
};

type CaseLike = {
  title: string;
  description: string | null;
  parties?: Party[];
  status?: string;
  jurisdiction?: string | null;
  currency?: string;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter((item): item is string => Boolean(item));
  }
  const single = asString(value);
  return single ? [single] : [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

export function extractCaseMeta(caseLike: CaseLike): {
  jobTitle: string;
  jobDescription: string;
  responsibilities: string[];
} {
  const candidatePublic = caseLike.parties?.find((party) => party.party_type === "candidate")?.public_payload ?? {};
  const companyPublic = caseLike.parties?.find((party) => party.party_type === "company")?.public_payload ?? {};

  const jobTitle =
    pickFirstString(candidatePublic, ["job_title", "target_role", "title", "position_title"]) ??
    pickFirstString(companyPublic, ["job_title", "role_title", "title", "position_title", "role_scope"]) ??
    caseLike.title;

  const jobDescription =
    pickFirstString(candidatePublic, ["job_description", "role_description"]) ??
    pickFirstString(companyPublic, ["job_description", "role_description", "budget_context", "role_scope"]) ??
    caseLike.description ??
    "Not provided";

  const responsibilities = [
    ...asStringArray(candidatePublic["responsibilities"]),
    ...asStringArray(candidatePublic["key_responsibilities"]),
    ...asStringArray(companyPublic["responsibilities"]),
    ...asStringArray(companyPublic["key_responsibilities"]),
  ];

  return {
    jobTitle,
    jobDescription,
    responsibilities,
  };
}

export type BenefitConfig = {
  showInsuranceRank: boolean;
  showPtoRank: boolean;
  showWfhRank: boolean;
  insuranceLabel: string;
  ptoLabel: string;
  wfhLabel: string;
  // Chips shown in the detail view: only enriched rank labels (with detail in parens)
  // and extra non-rank benefits (401k, dental, equity). Never bare "Insurance"/"PTO"/"WFH".
  extraBenefitChips: string[];
};

export function extractBenefitConfig(caseLike: CaseLike): BenefitConfig {
  const conf = caseLike.parties?.find((p) => p.party_type === "company")?.confidential_payload ?? {};
  const benefits = (conf["benefits"] ?? {}) as Record<string, unknown>;
  const hasBenefitsConfig = Object.keys(benefits).length > 0;

  // ── Which rank fields are relevant ──────────────────────────────────────────
  // Fall back to showing all three if the case has no benefits config yet.
  const showInsuranceRank = hasBenefitsConfig ? benefits["health_insurance"] === true : true;
  const showPtoRank = true; // PTO is always in the package

  const wfhSchedule = typeof benefits["wfh_schedule"] === "string" ? benefits["wfh_schedule"] : null;
  const wfhDays = typeof benefits["wfh_days_per_week"] === "number" ? benefits["wfh_days_per_week"] : null;
  const showWfhRank = hasBenefitsConfig
    ? wfhSchedule !== "none" && (wfhDays === null || wfhDays !== 0)
    : true;

  // ── Labels for rank chips/badges ─────────────────────────────────────────────
  const healthPlan = typeof benefits["health_plan"] === "string" ? benefits["health_plan"] : null;
  const insuranceLabel = healthPlan
    ? `Insurance (${healthPlan.charAt(0).toUpperCase() + healthPlan.slice(1)})`
    : "Insurance";

  const ptoDays = benefits["pto_days"];
  const ptoLabel =
    ptoDays === "unlimited" ? "PTO (Unlimited)" :
    typeof ptoDays === "number" ? `PTO (${ptoDays}d)` :
    "PTO";

  const wfhLabel =
    wfhSchedule === "full" ? "WFH (Remote)" :
    wfhSchedule === "flexible" ? "WFH (Flex)" :
    wfhDays != null && wfhDays > 0 ? `WFH (${wfhDays}d/wk)` :
    "WFH";

  // ── Extra benefit chips for detail view ──────────────────────────────────────
  // Only include annotated rank labels (when they carry real detail like plan/days)
  // and non-rank benefits. Never show bare "Insurance", "PTO", or "WFH" — those
  // are already communicated by the rank badges below.
  const extraBenefitChips: string[] = [];
  if (showInsuranceRank && healthPlan) extraBenefitChips.push(insuranceLabel);
  if (ptoDays !== undefined && ptoDays !== null) extraBenefitChips.push(ptoLabel);
  if (showWfhRank && (wfhSchedule !== null || wfhDays !== null)) extraBenefitChips.push(wfhLabel);
  if (benefits["retirement_401k"] === true) {
    const matchPct = typeof benefits["retirement_match_pct"] === "number" ? benefits["retirement_match_pct"] : null;
    extraBenefitChips.push(matchPct != null ? `401k (${matchPct}% match)` : "401k");
  }
  if (benefits["dental_vision"] === true) extraBenefitChips.push("Dental/Vision");
  if (benefits["stock_options"] === true) {
    const eqType = typeof benefits["equity_type"] === "string" ? benefits["equity_type"] : null;
    extraBenefitChips.push(eqType === "rsus" ? "RSUs" : eqType === "options" ? "Stock Options" : eqType === "both" ? "Options + RSUs" : "Equity");
  }

  return { showInsuranceRank, showPtoRank, showWfhRank, insuranceLabel, ptoLabel, wfhLabel, extraBenefitChips };
}

export type BulkDecisionJobListingPayload = {
  title: string;
  description: string | null;
  status: string | null;
  jurisdiction: string | null;
  currency: string | null;
  job_title: string;
  job_description: string;
  responsibilities: string[];
  category: string | null;
  work_arrangement: string | null;
  location: string | null;
  budget_floor: number | null;
  budget_target: number | null;
  budget_ceiling: number | null;
  benefits: Record<string, unknown>;
};

export function extractBulkDecisionJobListingPayload(caseLike: CaseLike): BulkDecisionJobListingPayload {
  const candidatePublic = caseLike.parties?.find((party) => party.party_type === "candidate")?.public_payload ?? {};
  const companyPublic = caseLike.parties?.find((party) => party.party_type === "company")?.public_payload ?? {};
  const companyConfidential = caseLike.parties?.find((party) => party.party_type === "company")?.confidential_payload ?? {};

  const meta = extractCaseMeta(caseLike);
  const rawBenefits = companyConfidential["benefits"];
  const benefits = typeof rawBenefits === "object" && rawBenefits !== null && !Array.isArray(rawBenefits)
    ? (rawBenefits as Record<string, unknown>)
    : {};

  return {
    title: caseLike.title,
    description: caseLike.description,
    status: asString(caseLike.status) ?? null,
    jurisdiction: asString(caseLike.jurisdiction) ?? null,
    currency: asString(caseLike.currency) ?? null,
    job_title: meta.jobTitle,
    job_description: meta.jobDescription,
    responsibilities: meta.responsibilities,
    category: pickFirstString(companyPublic, ["category", "job_category"]),
    work_arrangement: pickFirstString(companyPublic, ["work_arrangement"]),
    location: pickFirstString(companyPublic, ["location"]),
    budget_floor: asNumber(companyConfidential["budget_floor"] ?? companyConfidential["salary_floor"]),
    budget_target: asNumber(companyConfidential["budget_target"] ?? companyConfidential["salary_target"]),
    budget_ceiling: asNumber(companyConfidential["budget_ceiling"] ?? companyConfidential["salary_ceiling"]),
    benefits,
  };
}
