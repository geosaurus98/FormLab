import { z } from 'zod';

/**
 * How trustworthy a value is. Every nutrition value, estimate and imported record carries one.
 * - measured:   physically measured (e.g. scale weigh-in)
 * - label:      transcribed from a food package nutrition information panel
 * - reference:  from a reference composition database (values may be approximate — verify)
 * - calculated: derived by the app from other data (e.g. recipe from ingredients)
 * - estimate:   modelled estimate (e.g. MET-based energy expenditure, BMR equations)
 * - user:       typed in by the user without a stated source
 * - unknown:    provenance not known
 */
export const DataQualitySchema = z.enum(['measured', 'label', 'reference', 'calculated', 'estimate', 'user', 'unknown']);
export type DataQuality = z.infer<typeof DataQualitySchema>;

export const DATA_QUALITY_LABEL: Record<DataQuality, string> = {
  measured: 'Measured',
  label: 'Food label',
  reference: 'Reference database',
  calculated: 'Calculated',
  estimate: 'Estimate',
  user: 'User-entered',
  unknown: 'Unknown'
};

export const DataSourceSchema = z.object({
  kind: z.enum(['seed', 'user', 'label', 'import', 'calculated']),
  name: z.string(),
  reference: z.string().optional(),
  note: z.string().optional()
});
export type DataSource = z.infer<typeof DataSourceSchema>;
