"use client";

import { motion } from "framer-motion";

interface OverlayBackdropProps {
  videoDimLevel: number;
  onClose: () => void;
}

export function OverlayBackdrop({
  videoDimLevel,
  onClose,
}: OverlayBackdropProps) {
  // Map dim level → displacement intensity and brightness
  // videoDimLevel: 0 (dormant) → 0.15 (input) → 0.65 (input+history) → 0.75 (conversing)
  const displacementScale = Math.round(videoDimLevel * 40);
  const brightness = Math.max(0.25, 1 - videoDimLevel * 0.95);
  const showEffect = videoDimLevel > 0;

  // Dynamic filter ID — forces browser to re-evaluate when params change
  const filterId = `chalk-disp-${displacementScale}-${Math.round(brightness * 100)}`;

  return (
    <motion.div
      key="overlay-backdrop"
      data-overlay-backdrop
      className={`absolute inset-0 ${
        videoDimLevel > 0 ? "cursor-pointer" : "pointer-events-none"
      }`}
      style={
        showEffect
          ? {
              backdropFilter: `url(#${filterId})`,
              WebkitBackdropFilter: `url(#${filterId})`,
            }
          : undefined
      }
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      {/* SVG displacement filter — displaces backdrop pixels via noise, then darkens */}
      {showEffect && (
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            <filter
              id={filterId}
              x="-5%"
              y="-5%"
              width="110%"
              height="110%"
              colorInterpolationFilters="sRGB"
            >
              {/* Noise map for displacement */}
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
                scale={displacementScale}
                xChannelSelector="R"
                yChannelSelector="G"
                result="displaced"
              />
              {/* Darken the displaced result for readability */}
              <feComponentTransfer in="displaced">
                <feFuncR type="linear" slope={brightness} />
                <feFuncG type="linear" slope={brightness} />
                <feFuncB type="linear" slope={brightness} />
              </feComponentTransfer>
            </filter>
          </defs>
        </svg>
      )}
    </motion.div>
  );
}
