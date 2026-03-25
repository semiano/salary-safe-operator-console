type Party = {
  party_type: "candidate" | "company";
  public_payload: Record<string, unknown>;
  confidential_payload: Record<string, unknown>;
};

type CaseLike = {
  title: string;
  description: string | null;
  parties?: Party[];
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
