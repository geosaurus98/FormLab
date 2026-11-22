import type { Equipment, Exercise } from './types';

export interface AlternativeOption {
  exercise: Exercise;
  score: number;
  reasons: string[];
  available: boolean;
}

/**
 * Ranks substitute exercises by movement similarity and equipment availability.
 * Explicit alternatives score highest; same movement pattern and shared primary muscles next.
 */
export function findAlternatives(target: Exercise, all: Exercise[], equipment: Map<string, Equipment>, limit = 8): AlternativeOption[] {
  const isAvailable = (ex: Exercise) => ex.equipmentIds.length === 0 || ex.equipmentIds.every((id) => equipment.get(id)?.available !== false);
  return all
    .filter((ex) => ex.id !== target.id && !ex.archived && ex.type === target.type)
    .map((ex) => {
      const reasons: string[] = [];
      let score = 0;
      if (target.alternativeIds.includes(ex.id) || ex.alternativeIds.includes(target.id)) {
        score += 50;
        reasons.push('Listed alternative');
      }
      if (ex.movementPattern === target.movementPattern) {
        score += 30;
        reasons.push('Same movement pattern');
      }
      const shared = ex.primaryMuscles.filter((m) => target.primaryMuscles.includes(m));
      if (shared.length) {
        score += 10 * shared.length;
        reasons.push(`Works ${shared.join(', ')}`);
      }
      const available = isAvailable(ex);
      if (!available) {
        score -= 40;
        reasons.push('Equipment not marked available');
      }
      return { exercise: ex, score, reasons, available };
    })
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
    .slice(0, limit);
}
