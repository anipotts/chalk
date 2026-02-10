import { create, all } from 'mathjs';

const math = create(all);

// Disable dangerous functions
math.import({
  import: function () { throw new Error('import disabled'); },
  createUnit: function () { throw new Error('createUnit disabled'); },
  evaluate: function () { throw new Error('evaluate disabled'); },
}, { override: true });

export function compileMathExpr(expr: string): (scope: Record<string, number>) => number {
  // Normalize common mistakes from LLM output
  let normalized = expr
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\*\*/g, '^');
  const compiled = math.compile(normalized);
  return (scope) => compiled.evaluate(scope);
}

export function exprToPlotFn(expr: string): (x: number) => number {
  const fn = compileMathExpr(expr);
  return (x: number) => {
    try {
      const result = fn({ x });
      return isFinite(result) ? result : NaN;
    } catch {
      return NaN;
    }
  };
}

export function exprToSurfaceFn(expr: string): (x: number, y: number) => number {
  const fn = compileMathExpr(expr);
  return (x: number, y: number) => {
    try {
      const result = fn({ x, y });
      return isFinite(result) ? result : 0;
    } catch {
      return 0;
    }
  };
}
