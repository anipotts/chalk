"use client";

/**
 * Glassmorphic grain backdrop — displaces video pixels through fractal noise,
 * creating a distinctive grainy/color-shifted glass effect.
 *
 * Optimized for our binary state machine (watching ↔ chatting):
 * - Video is PAUSED when chatting → backdrop content is static → filter computes once
 * - Fixed filter params (no dynamic recalculation)
 * - Simple CSS transition (no framer-motion dependency)
 * - `will-change` hint for GPU compositing
 */

const FILTER_ID = "chalk-grain";

export function OverlayBackdrop({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={onClick}
      data-overlay-backdrop
    >
      {/* SVG displacement filter definition (0×0, purely declarative) */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <filter
            id={FILTER_ID}
            x="-5%"
            y="-5%"
            width="110%"
            height="110%"
            colorInterpolationFilters="sRGB"
          >
            {/* Fractal noise map for displacement */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.5"
              numOctaves="4"
              seed="2"
              stitchTiles="stitch"
              result="noise"
            />
            {/* Displace backdrop pixels using noise — creates colored grain */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="28"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            {/* Darken the displaced result for text readability */}
            <feComponentTransfer in="displaced">
              <feFuncR type="linear" slope="0.32" />
              <feFuncG type="linear" slope="0.32" />
              <feFuncB type="linear" slope="0.32" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      {/* Grain displacement layer — applies SVG filter to video underneath */}
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: `url(#${FILTER_ID})`,
          WebkitBackdropFilter: `url(#${FILTER_ID})`,
          willChange: visible ? 'backdrop-filter' : 'auto',
        }}
      />
    </div>
  );
}
