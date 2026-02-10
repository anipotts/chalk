import { z } from 'zod';

const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3B82F6');
const DomainSchema = z.tuple([z.number(), z.number()]);

export const Plot3DSchema = z.object({
  expr: z.string().min(1).describe('mathjs expression in x and y'),
  xDomain: DomainSchema.default([-5, 5]),
  yDomain: DomainSchema.default([-5, 5]),
  colorLow: ColorSchema.default('#3B82F6'),
  colorHigh: ColorSchema.default('#EF4444'),
  resolution: z.number().min(16).max(128).default(64),
  height: z.number().min(200).max(800).default(400),
  wireframe: z.boolean().default(false),
  autoRotate: z.boolean().default(true),
  showAxes: z.boolean().default(true),
});

export type Plot3DProps = z.infer<typeof Plot3DSchema>;
