import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "Rowan Heating & Air Conditioning — Reliable heating & cooling for Highland and Howard County, MD";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #1a2b4a 0%, #101a30 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "#f57c1f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 800,
            }}
          >
            R
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>
            Rowan Heating &amp; Air Conditioning
          </div>
        </div>

        <div
          style={{
            marginTop: 48,
            fontSize: 60,
            fontWeight: 800,
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          Reliable Heating &amp; Cooling for Highland and Howard County
        </div>

        <div style={{ marginTop: 28, fontSize: 30, color: "#c6d2e3" }}>
          Family-owned and operated in Howard County since 1958
        </div>

        <div style={{ marginTop: 40, fontSize: 26, color: "#f7b071" }}>
          410-531-0008 · rowanhvac.com
        </div>
      </div>
    ),
    { ...size },
  );
}
