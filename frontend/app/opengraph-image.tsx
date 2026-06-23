import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "RTDstats – Denver RTD Tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const features = [
    { label: "Live Vehicle Map", dot: "#41C1EF" },
    { label: "On-Time Performance", dot: "#4C9C2E" },
    { label: "Delay Tracking", dot: "#CE0E2D" },
    { label: "Historical Analytics", dot: "#FDBA2F" },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          background: "#0F1923",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Multi-color top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            backgroundImage:
              "linear-gradient(to right, #CE0E2D, #41C1EF, #FDBA2F, #4C9C2E, #691F74)",
            display: "flex",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "70px 80px 40px",
            justifyContent: "center",
          }}
        >
          {/* "Denver RTD" badge */}
          <div style={{ display: "flex", marginBottom: 28 }}>
            <div
              style={{
                background: "#CE0E2D",
                borderRadius: 6,
                padding: "6px 18px",
                color: "white",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                display: "flex",
              }}
            >
              Denver RTD
            </div>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 100,
              fontWeight: 800,
              color: "white",
              lineHeight: 1,
              marginBottom: 28,
              display: "flex",
            }}
          >
            RTDstats
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 28,
              color: "#94a3b8",
              lineHeight: 1.5,
              maxWidth: 820,
              display: "flex",
            }}
          >
            Real-time vehicle tracking and historical analytics for
            Denver&apos;s light rail, commuter rail, and bus network.
          </div>
        </div>

        {/* Bottom feature strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderTop: "1px solid #263040",
            padding: "22px 80px",
            gap: 48,
            background: "#1A2535",
          }}
        >
          {features.map(({ label, dot }) => (
            <div
              key={label}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: dot,
                  display: "flex",
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "#cbd5e1", fontSize: 19, display: "flex" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
