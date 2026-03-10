import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/**
 * Next.js App Router icon route
 * Generates /icon.png
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #fffaf2 0%, #fff7ea 100%)",
        }}
      >
        <svg width="420" height="420" viewBox="0 0 420 420" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g" x1="80" y1="60" x2="340" y2="360" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3B82F6" />
              <stop offset="1" stopColor="#1D4ED8" />
            </linearGradient>
            <filter id="glow" x="-40" y="-40" width="500" height="500" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="10" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="0 0 0 0 0.145  0 0 0 0 0.388  0 0 0 0 0.922  0 0 0 0.35 0"
                result="blueGlow"
              />
              <feMerge>
                <feMergeNode in="blueGlow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* outer ring */}
          <circle cx="210" cy="220" r="150" stroke="url(#g)" strokeWidth="22" opacity="0.95" filter="url(#glow)" />
          <circle cx="210" cy="220" r="124" fill="#FFFFFF" fillOpacity="0.78" stroke="#0F172A" strokeOpacity="0.08" />

          {/* bells */}
          <path d="M130 120 L165 92" stroke="#0F172A" strokeOpacity="0.35" strokeWidth="14" strokeLinecap="round" />
          <path d="M290 120 L255 92" stroke="#0F172A" strokeOpacity="0.35" strokeWidth="14" strokeLinecap="round" />

          {/* hands */}
          <path d="M210 220 L210 160" stroke="#2563EB" strokeWidth="16" strokeLinecap="round" />
          <path d="M210 220 L260 248" stroke="#2563EB" strokeWidth="16" strokeLinecap="round" opacity="0.85" />
          <circle cx="210" cy="220" r="12" fill="#2563EB" />

          {/* 8 badge */}
          <g transform="translate(210 318)">
            <rect x="-46" y="-26" width="92" height="52" rx="26" fill="#2563EB" />
            <text
              x="0"
              y="18"
              textAnchor="middle"
              fontSize="34"
              fontWeight={800}
              fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
              fill="#FFFFFF"
            >
              8
            </text>
          </g>
        </svg>
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
