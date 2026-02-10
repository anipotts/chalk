'use client';
import { Mafs, Coordinates, Plot, Point, Vector, Text, vec } from 'mafs';
import 'mafs/core.css';
import { exprToPlotFn, compileMathExpr } from '@/lib/math';

interface FunctionDef {
  expr: string;
  color?: string;
  label?: string;
  style?: 'solid' | 'dashed';
  weight?: number;
}

interface ParametricDef {
  xExpr: string;
  yExpr: string;
  tDomain: [number, number];
  color?: string;
  label?: string;
  weight?: number;
}

interface Annotation {
  type: 'point' | 'vector' | 'text' | 'line';
  [key: string]: any;
}

interface Plot2DProps {
  functions?: FunctionDef[];
  parametric?: ParametricDef[];
  annotations?: Annotation[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  padding?: number;
  showGrid?: boolean;
  showAxes?: boolean;
  height?: number;
  interactive?: boolean;
  zoom?: boolean;
}

export function MafsPlot2D({
  functions = [],
  parametric = [],
  annotations = [],
  xDomain = [-10, 10],
  yDomain = [-10, 10],
  padding = 0.5,
  showGrid = true,
  height = 400,
  interactive = true,
  zoom = false,
}: Plot2DProps) {
  return (
    <Mafs
      viewBox={{ x: xDomain, y: yDomain, padding }}
      height={height}
      pan={interactive}
      zoom={zoom}
    >
      {showGrid && <Coordinates.Cartesian />}

      {functions.map((fn, i) => {
        const plotFn = exprToPlotFn(fn.expr);
        return (
          <Plot.OfX
            key={`fn-${i}`}
            y={plotFn}
            color={fn.color || '#3b82f6'}
            weight={fn.weight || 2}
            style={fn.style === 'dashed' ? 'dashed' : undefined}
          />
        );
      })}

      {parametric.map((p, i) => {
        const xFn = compileMathExpr(p.xExpr);
        const yFn = compileMathExpr(p.yExpr);
        return (
          <Plot.Parametric
            key={`param-${i}`}
            xy={(t) => [xFn({ t }), yFn({ t })]}
            t={p.tDomain}
            color={p.color || '#8b5cf6'}
            weight={p.weight || 2}
          />
        );
      })}

      {annotations.map((ann, i) => {
        if (ann.type === 'point') {
          return (
            <Point
              key={`ann-${i}`}
              x={ann.x}
              y={ann.y}
              color={ann.color || '#f59e0b'}
            />
          );
        }
        if (ann.type === 'vector') {
          return (
            <Vector
              key={`ann-${i}`}
              tail={ann.tail || [0, 0]}
              tip={ann.tip}
              color={ann.color || '#10b981'}
            />
          );
        }
        if (ann.type === 'text') {
          return (
            <Text
              key={`ann-${i}`}
              x={ann.x}
              y={ann.y}
              color={ann.color || '#f1f5f9'}
              size={ann.size || 14}
            >
              {ann.content}
            </Text>
          );
        }
        return null;
      })}
    </Mafs>
  );
}
