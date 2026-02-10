'use client';

import { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, AdaptiveDpr } from '@react-three/drei';
import * as THREE from 'three';
import { exprToSurfaceFn } from '@/lib/math';

interface ThreeDSurfaceProps {
  expr: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  colorLow?: string;
  colorHigh?: string;
  resolution?: number;
  height?: number;
  wireframe?: boolean;
  autoRotate?: boolean;
  showAxes?: boolean;
}

/**
 * Internal component that builds the surface mesh inside the R3F Canvas.
 * Separated so that Three.js hooks (useFrame, etc.) run inside the Canvas context.
 */
function SurfaceMesh({
  expr,
  xDomain,
  yDomain,
  colorLow,
  colorHigh,
  resolution,
  wireframe,
}: {
  expr: string;
  xDomain: [number, number];
  yDomain: [number, number];
  colorLow: string;
  colorHigh: string;
  resolution: number;
  wireframe: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const fn = exprToSurfaceFn(expr);
    const colorLowVec = new THREE.Color(colorLow);
    const colorHighVec = new THREE.Color(colorHigh);
    const res = resolution;

    // First pass: generate vertices and track z range for color normalization
    let minZ = Infinity;
    let maxZ = -Infinity;
    const zValues: number[] = [];

    for (let i = 0; i <= res; i++) {
      for (let j = 0; j <= res; j++) {
        const x = xDomain[0] + (i / res) * (xDomain[1] - xDomain[0]);
        const y = yDomain[0] + (j / res) * (yDomain[1] - yDomain[0]);
        let z = fn(x, y);

        // Clamp extreme values to keep the mesh sensible
        if (!isFinite(z)) z = 0;
        const clampBound = 20;
        z = Math.max(-clampBound, Math.min(clampBound, z));

        // three.js uses Y-up: map math-z to scene-Y, math-y to scene-Z
        vertices.push(x, z, y);
        zValues.push(z);

        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }

    // Second pass: assign vertex colors based on normalized height
    const range = maxZ - minZ || 1;
    for (const z of zValues) {
      const t = (z - minZ) / range;
      const c = new THREE.Color().lerpColors(colorLowVec, colorHighVec, t);
      colors.push(c.r, c.g, c.b);
    }

    // Generate indexed triangle faces
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const a = i * (res + 1) + j;
        const b = a + 1;
        const c = (i + 1) * (res + 1) + j;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    return geo;
  }, [expr, xDomain, yDomain, resolution, colorLow, colorHigh]);

  return (
    <group>
      {/* Solid surface with vertex colors and Phong lighting */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshPhongMaterial
          vertexColors
          side={THREE.DoubleSide}
          shininess={40}
          specular={new THREE.Color('#222222')}
        />
      </mesh>

      {/* Optional wireframe overlay */}
      {wireframe && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            wireframe
            color="#94a3b8"
            opacity={0.15}
            transparent
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Minimal axis lines rendered as thin colored lines through the origin.
 * Uses a simple line approach so there are no sprite/texture requirements.
 */
function AxisLines({ size = 6 }: { size?: number }) {
  const axes = useMemo(() => {
    const xGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size, 0, 0),
      new THREE.Vector3(size, 0, 0),
    ]);
    const yGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -size, 0),
      new THREE.Vector3(0, size, 0),
    ]);
    const zGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -size),
      new THREE.Vector3(0, 0, size),
    ]);
    return { xGeo, yGeo, zGeo };
  }, [size]);

  return (
    <group>
      {/* X axis - red */}
      <lineSegments geometry={axes.xGeo}>
        <lineBasicMaterial color="#ef4444" opacity={0.5} transparent />
      </lineSegments>
      {/* Y axis (height in scene) - green */}
      <lineSegments geometry={axes.yGeo}>
        <lineBasicMaterial color="#22c55e" opacity={0.5} transparent />
      </lineSegments>
      {/* Z axis - blue */}
      <lineSegments geometry={axes.zGeo}>
        <lineBasicMaterial color="#3b82f6" opacity={0.5} transparent />
      </lineSegments>
    </group>
  );
}

export function ThreeDSurface({
  expr,
  xDomain = [-5, 5],
  yDomain = [-5, 5],
  colorLow = '#3B82F6',
  colorHigh = '#EF4444',
  resolution = 64,
  height = 400,
  wireframe = false,
  autoRotate = true,
  showAxes = true,
}: ThreeDSurfaceProps) {
  const [ready, setReady] = useState(false);

  // Compute a sensible camera distance based on domain size
  const domainSize = Math.max(
    xDomain[1] - xDomain[0],
    yDomain[1] - yDomain[0],
  );
  const cameraDistance = domainSize * 1.2;

  return (
    <div
      style={{ height }}
      className="w-full rounded-xl overflow-hidden bg-chalk-bg relative"
    >
      {/* Loading overlay — fades out when Canvas is ready */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-chalk-bg z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-chalk-accent/30 border-t-chalk-accent rounded-full animate-spin" />
            <span className="text-xs text-slate-500">Loading 3D surface...</span>
          </div>
        </div>
      )}

      <Canvas
        dpr={[1, 2]}
        camera={{
          position: [cameraDistance * 0.7, cameraDistance * 0.6, cameraDistance * 0.7],
          fov: 50,
          near: 0.1,
          far: 1000,
        }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
        onCreated={() => setReady(true)}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} />
        <directionalLight position={[-5, 5, -5]} intensity={0.3} />

        {/* Surface */}
        <SurfaceMesh
          expr={expr}
          xDomain={xDomain}
          yDomain={yDomain}
          colorLow={colorLow}
          colorHigh={colorHigh}
          resolution={resolution}
          wireframe={wireframe}
        />

        {/* Axes */}
        {showAxes && <AxisLines size={domainSize * 0.6} />}

        {/* Controls — auto-rotate stops when user interacts */}
        <OrbitControls
          enableDamping
          dampingFactor={0.12}
          autoRotate={autoRotate}
          autoRotateSpeed={1.5}
          minDistance={2}
          maxDistance={cameraDistance * 3}
        />

        {/* Adaptive DPR for performance */}
        <AdaptiveDpr pixelated />
      </Canvas>

      {/* Drag hint — bottom-right, subtle */}
      {ready && (
        <div className="absolute bottom-2 right-3 text-[10px] text-slate-500/60 pointer-events-none select-none">
          Drag to rotate
        </div>
      )}
    </div>
  );
}

export default ThreeDSurface;
