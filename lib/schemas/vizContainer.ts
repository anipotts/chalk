import { z } from 'zod';

export const VizContainerSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(500).optional(),
  theme: z.enum(['dark', 'light']).default('dark'),
  layout: z.enum(['single', 'split', 'grid']).default('single'),
  showEquation: z.boolean().default(true),
  showControls: z.boolean().default(true),
});

export type VizContainerProps = z.infer<typeof VizContainerSchema>;
