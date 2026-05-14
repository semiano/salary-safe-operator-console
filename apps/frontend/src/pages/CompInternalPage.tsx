import { useParams } from "react-router-dom";

const NAVY = "#1B1035";
const MUTED = "#71717a";
const BORDER = "#e4e4e7";
const R_LG = "14px";

export function CompInternalPage() {
  const { listingId } = useParams<{ listingId: string }>();

  return (
    <div style={{ fontFamily: "inherit" }}>
      <div
        style={{
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: R_LG,
          padding: "4rem 2rem",
          textAlign: "center",
          maxWidth: 560,
          margin: "4rem auto",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
        <h2
          style={{
            fontFamily: "var(--font-display, Georgia, serif)",
            fontSize: 24,
            fontWeight: 700,
            color: NAVY,
            marginBottom: 10,
          }}
        >
          Internal Comp Compare
        </h2>
        <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
          Compare compensation against internal pay bands and existing employee data for this listing.
          This feature is coming soon.
        </p>
        {listingId && (
          <p style={{ fontSize: 12, color: "#c4c4c8", marginTop: 12 }}>Listing ID: {listingId}</p>
        )}
      </div>
    </div>
  );
}
