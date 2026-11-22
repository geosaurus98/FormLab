import { z } from 'zod';
import { db, SCHEMA_VERSION, TABLE_NAMES, type TableName } from './db';
import { FoodSchema } from '../domain/nutrition/foods';
import { FoodLogEntrySchema } from '../domain/nutrition/diary';
import { RecipeSchema, RecipeVersionSchema, IngredientSchema } from '../domain/recipes/types';
import { WorkoutSessionSchema, ExerciseSchema, WorkoutTemplateSchema, CardioActivitySchema } from '../domain/workouts/types';
import { BodyMeasurementSchema } from '../domain/body/body';
import { MealPlanSchema } from '../domain/planner/mealPlan';
import { newId } from '../lib/id';
import { nowIso } from '../lib/utils';

export const BACKUP_FORMAT = 'formlab-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  app: { name: 'FormLab'; version: string };
  tables: Partial<Record<TableName, unknown[]>>;
}

/** Strict validation for the tables that hold personal history; others need an `id`/`key`/`date`. */
const STRICT: Partial<Record<TableName, z.ZodTypeAny>> = {
  foods: FoodSchema,
  foodLog: FoodLogEntrySchema,
  recipes: RecipeSchema,
  recipeVersions: RecipeVersionSchema,
  ingredients: IngredientSchema,
  workouts: WorkoutSessionSchema,
  exercises: ExerciseSchema,
  templates: WorkoutTemplateSchema,
  cardio: CardioActivitySchema,
  body: BodyMeasurementSchema,
  mealPlans: MealPlanSchema
};

const BackupShape = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  app: z.object({ name: z.string(), version: z.string() }),
  tables: z.record(z.string(), z.array(z.unknown()))
});

export async function exportBackup(): Promise<Backup> {
  const tables: Partial<Record<TableName, unknown[]>> = {};
  await db.transaction('r', TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const t of TABLE_NAMES) tables[t] = await db.table(t).toArray();
  });
  return { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), app: { name: 'FormLab', version: '0.1.0' }, tables };
}

/** Migrates older backup payloads to the current schema. Add a case for each schema bump. */
export function migrateBackup(b: Backup): Backup {
  let cur = b;
  // if (cur.schemaVersion === 1) { cur = { ...cur, schemaVersion: 2, tables: { ...cur.tables, foods: cur.tables.foods?.map(...) } }; }
  if (cur.schemaVersion > SCHEMA_VERSION) throw new Error(`Backup was made by a newer version of FormLab (schema ${cur.schemaVersion}). Update the app first.`);
  return cur;
}

export interface ValidationReport {
  ok: boolean;
  counts: Record<string, number>;
  errors: string[];
}

export function validateBackup(raw: unknown): { backup: Backup | null; report: ValidationReport } {
  const errors: string[] = [];
  const shape = BackupShape.safeParse(raw);
  if (!shape.success) return { backup: null, report: { ok: false, counts: {}, errors: ['Not a FormLab backup file: ' + shape.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')] } };
  let backup: Backup;
  try {
    backup = migrateBackup(shape.data as Backup);
  } catch (e) {
    return { backup: null, report: { ok: false, counts: {}, errors: [(e as Error).message] } };
  }
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(backup.tables)) {
    if (!(TABLE_NAMES as readonly string[]).includes(name)) {
      errors.push(`Unknown table "${name}" ignored`);
      continue;
    }
    counts[name] = rows?.length ?? 0;
    const schema = STRICT[name as TableName];
    rows?.forEach((row, i) => {
      if (schema) {
        const r = schema.safeParse(row);
        if (!r.success) errors.push(`${name}[${i}]: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`);
      } else if (typeof row !== 'object' || row == null || !('id' in row || 'key' in row || 'date' in row)) errors.push(`${name}[${i}]: missing identifier`);
    });
  }
  const fatal = errors.filter((e) => !e.startsWith('Unknown table'));
  return { backup, report: { ok: fatal.length === 0, counts, errors } };
}

/**
 * Replaces all local data with the backup inside a single transaction: either everything is
 * restored or nothing changes. A safety snapshot of current data is returned so the caller can offer it for download.
 */
export async function restoreBackup(raw: unknown, fileName = 'backup.json'): Promise<{ report: ValidationReport; previous: Backup }> {
  const { backup, report } = validateBackup(raw);
  if (!backup || !report.ok) throw Object.assign(new Error('Backup failed validation'), { report });
  const previous = await exportBackup();
  await db.transaction('rw', TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const t of TABLE_NAMES) {
      await db.table(t).clear();
      const rows = backup.tables[t];
      if (rows?.length) await db.table(t).bulkPut(rows);
    }
    await db.importRecords.put({ id: newId('imp'), kind: 'backup-restore', at: nowIso(), fileName, counts: report.counts, notes: `Backup exported ${backup.exportedAt}` });
  });
  return { report, previous };
}

export function downloadJson(data: unknown, fileName: string): void {
  downloadText(JSON.stringify(data, null, 1), fileName, 'application/json');
}

export function downloadText(text: string, fileName: string, type = 'text/plain'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]!);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
}

export async function foodDiaryCsv(): Promise<string> {
  const rows = (await db.foodLog.orderBy('date').toArray()).map((e) => ({ date: e.date, meal: e.meal, name: e.name, amount: e.description, kcal: e.nutrients.energyKcal?.toFixed(0), protein_g: e.nutrients.proteinG?.toFixed(1), carbs_g: e.nutrients.carbsG?.toFixed(1), fat_g: e.nutrients.fatG?.toFixed(1), satfat_g: e.nutrients.satFatG?.toFixed(1), fibre_g: e.nutrients.fibreG?.toFixed(1), sodium_mg: e.nutrients.sodiumMg?.toFixed(0), quality: e.quality, incomplete: e.incomplete }));
  return toCsv(rows);
}

export async function workoutsCsv(): Promise<string> {
  const rows: Record<string, unknown>[] = [];
  for (const w of await db.workouts.where('status').equals('completed').sortBy('startedAt')) {
    for (const es of w.exercises) {
      es.sets.forEach((s, i) => rows.push({ date: w.startedAt, workout: w.name, gym: w.gymId, exercise: es.exerciseName, variant: es.variant, set: i + 1, type: s.type, weight_kg: s.weightKg, added_kg: s.addedKg, assistance_kg: s.assistanceKg, reps: s.reps, duration_s: s.durationSec, distance_m: s.distanceM, rpe: s.rpe, rir: s.rir }));
    }
  }
  return toCsv(rows);
}
