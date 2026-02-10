import { z } from 'zod';

export const ElementSchema = z.object({
  type: z.enum([
    'vizContainer', 'stepSequence', 'plot2d', 'plot3d', 'matrix', 'probability', 'latex',
  ]),
  props: z.record(z.unknown()).transform((val) => val as Record<string, any>),
  children: z.array(z.string()).optional(),
});

export const ChalkSpecSchema = z.object({
  root: z.string().describe('Key of the root element'),
  elements: z.record(z.string(), ElementSchema),
});

export type ChalkSpec = z.infer<typeof ChalkSpecSchema>;
export type Element = z.infer<typeof ElementSchema>;
