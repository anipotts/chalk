"use client";

const NOISE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter><rect width="300" height="300" filter="url(#n)"/></svg>`;

const noiseUrl = `url("data:image/svg+xml,${encodeURIComponent(NOISE_SVG)}")`;

export function OverlayBackdrop({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={onClick}
      data-overlay-backdrop
    >
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="absolute inset-0 opacity-75 pointer-events-none"
        style={{ backgroundImage: noiseUrl, backgroundSize: '300px', mixBlendMode: 'overlay' }}
      />
    </div>
  );
}
