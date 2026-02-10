import { z } from 'zod';

const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6');
const DomainSchema = z.tuple([z.number(), z.number()]);
const LineStyleSchema = z.enum(['solid', 'dashed']).default('solid');

const FunctionDefSchema = z.object({
  expr: z.string().min(1),
  color: ColorSchema,
  label: z.string().max(50).optional(),
  style: LineStyleSchema,
  weight: z.number().min(0.5).max(8).default(2),
});

const ParametricDefSchema = z.object({
  xExpr: z.string(),
  yExpr: z.string(),
  tDomain: DomainSchema,
  color: ColorSchema,
  label: z.string().max(50).optional(),
  style: LineStyleSchema,
  weight: z.number().min(0.5).max(8).default(2),
});

const VectorFieldDefSchema = z.object({
  dxExpr: z.string(),
  dyExpr: z.string(),
  step: z.number().min(0.5).max(3).default(1),
  color: ColorSchema,
});

const InequalityDefSchema = z.object({
  upperExpr: z.string(),
  lowerExpr: z.string(),
  color: ColorSchema.default('#3b82f680'),
  fillOpacity: z.number().min(0).max(1).default(0.15),
});

const AnnotationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('point'), x: z.number(), y: z.number(), label: z.string().optional(), color: ColorSchema }),
  z.object({ type: z.literal('vector'), tail: z.tuple([z.number(), z.number()]).default([0, 0]), tip: z.tuple([z.number(), z.number()]), color: ColorSchema, label: z.string().optional() }),
  z.object({ type: z.literal('circle'), center: z.tuple([z.number(), z.number()]), radius: z.number().positive(), color: ColorSchema, fillOpacity: z.number().min(0).max(1).default(0) }),
  z.object({ type: z.literal('text'), x: z.number(), y: z.number(), content: z.string(), color: ColorSchema, size: z.number().min(8).max(32).default(14) }),
  z.object({ type: z.literal('line'), from: z.tuple([z.number(), z.number()]), to: z.tuple([z.number(), z.number()]), color: ColorSchema, style: LineStyleSchema }),
]);

export const Plot2DSchema = z.object({
  functions: z.array(FunctionDefSchema).default([]),
  parametric: z.array(ParametricDefSchema).default([]),
  vectorField: VectorFieldDefSchema.optional(),
  inequalities: z.array(InequalityDefSchema).default([]),
  annotations: z.array(AnnotationSchema).default([]),
  xDomain: DomainSchema.default([-10, 10]),
  yDomain: DomainSchema.default([-10, 10]),
  padding: z.number().min(0).max(5).default(0.5),
  showGrid: z.boolean().default(true),
  showAxes: z.boolean().default(true),
  height: z.number().min(200).max(800).default(400),
  interactive: z.boolean().default(true),
  zoom: z.boolean().default(false),
});

export type Plot2DProps = z.infer<typeof Plot2DSchema>;
