# Workout engine (WorkoutLab)

Code: `src/domain/workouts/*`, `src/db/workoutService.ts`, `src/features/workouts/*`.

## Sessions

`startSession` builds an active `WorkoutSession` from a template. Each `ExerciseSession` snapshots the exercise name, tracking method, load type and target scheme (sets, rep range, rest, progression rule). Sets are prepopulated from the progression suggestion, or else from the previous comparable performance.

During a workout, every change is a pure function (`updateSet`, `toggleSetComplete`, `addSet`, `replaceExercise`, `moveExercise`…). The page applies it to local state and **writes the whole session to IndexedDB immediately**, with writes serialised. Closing the browser loses nothing: `/workouts/active` reloads the active session, and a banner shows it on every page.

`finishWorkout` keeps only completed sets. `editCompletedSession` increments `revision` and stamps `editedAt`. Templates are separate documents, so editing one never changes history.

## Tracking methods

| Tracking | Recorded |
| --- | --- |
| `weight_reps` | external load kg × reps |
| `bodyweight_reps` | reps plus optional **added** kg (not treated as external load) |
| `assisted_bodyweight` | reps plus **assistance** kg (more is easier; compared only at equal assistance) |
| `reps`, `duration`, `distance_duration` | as named |

Set types: warm-up · working · drop · failure · other. Warm-ups are excluded from records and volume. RPE and RIR are optional.

## Comparability

`comparisonKey(exerciseId, loadType, gymId, variant)`: machine and cable exercises include the gym (and any recorded variant such as "plate-loaded"). Free weights and bodyweight are comparable anywhere. Previous-performance lookups, progression, records and charts all use this key. Replacing an exercise records `replacedExerciseId` and never carries the old loads across.

## Progressive overload

`suggestNext({ previous, previousToPrevious, target, rule, defaultIncrementKg })` returns a weight, reps or time with a plain-language reason:

- **Double progression** (default): if every working set at the top weight reached `repMax`, and recorded RPE is within the optional ceiling, add one increment and drop back to `repMin`. Otherwise keep the weight and aim for +1 rep.
- **Fixed:** add an increment once all target sets reach `repMin`.
- **Reps:** add `repStep`. **Time:** add `timeStepSec`. **Manual:** repeat the last session.
- **Decline guard:** if total reps at the same weight dropped since the session before, hold, with no increase.

The increment comes from the rule, then the exercise, then the equipment (e.g. machine stack 5 kg, dumbbells 2 kg), all editable. Suggestions are optional, editable, and explained in the UI ("Last (date): … " plus the reason). The app records numbers; it doesn't assess technique.

## Records and analytics

`computeRecords(history)` replays completed sessions in order for each comparison key and finds: heaviest weight, most reps at each weight, **estimated 1RM** (Epley `w × (1 + r/30)`, only for 1–10 reps on externally loaded `weight_reps`, always labelled an estimate), best session volume, and most reps for bodyweight/assisted exercises (per assistance level). A key's first session never counts as a "new record". Because records are derived on demand, editing or deleting a workout updates them automatically.

`summariseSession`: duration, exercises and sets completed, volume (external load only), new records, and a comparison with the previous session of the same template. `exerciseProgress`: per-session top set, e1RM, reps and volume for charts. `muscleSetDistribution`: working sets per primary muscle.

## Rest timer

The timer is stored on the session as `{endsAt, pausedRemainingMs, durationMs}`, and remaining time is always `endsAt − now`. It starts when a set is completed (using the exercise's rest time or the default), and supports pause/resume, ±15/30 s and skip. A visual progress bar redraws 4×/s while visible and is recalculated on `visibilitychange`. When time is up it plays a beep and vibrates, and can show an optional notification if the page is hidden. After a reload the alert is re-armed. The screen wake lock is requested during workouts where supported.

**Limitation:** notifications use `setTimeout` in the page. They're reliable while the app is open or briefly backgrounded, but not after Android freezes the tab. The UI says this.

## Programmes

A programme has an ordered list of templates and a schedule: **rotation** (next template after the last completed one, whenever you train; no forced 7-day cycle) or **weekdays**. `nextTemplateInProgramme` drives Home and the Train tab.

## Alternatives

`findAlternatives` ranks substitutes: listed alternative (+50), same movement pattern (+30), shared primary muscles (+10 each), equipment not marked available (−40). Equipment availability is configured in Settings, and less common machines default to unavailable.

## Cardio

Manual logging covers type, date, optional start time, duration, distance, elevation, heart rate and notes. The energy estimate is optional: net MET × kg × hours, using the latest weigh-in and Compendium of Physical Activities values. It is labelled an estimate. `isLikelyDuplicate` (same external id, or same type and day with start within 10 min and duration within 20 %) is ready for a future `ActivitySourceAdapter` such as Health Connect.
