import { z } from 'zod';

export const LatexSchema = z.object({
  expression: z.string().min(1),
  displayMode: z.enum(['block', 'inline']).default('block'),
  fontSize: z.enum(['sm', 'base', 'lg', 'xl', '2xl']).default('lg'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f1f5f9'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  label: z.string().max(100).optional(),
});

export type LatexProps = z.infer<typeof LatexSchema>;
