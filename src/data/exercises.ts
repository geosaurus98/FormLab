import type { Equipment, Exercise, LoadType, MovementPattern, Muscle, TrackingMethod, WorkoutProgramme, WorkoutTemplate, TemplateExercise, Gym } from '../domain/workouts/types';
import { DEFAULT_PROGRESSION } from '../domain/workouts/session';

/** Equipment: common gym staples default to available; less common machines default to unavailable. */
export const SEED_EQUIPMENT: Equipment[] = [
  { id: 'eq_bodyweight', name: 'Bodyweight (no equipment)', category: 'bodyweight', available: true, incrementKg: null },
  { id: 'eq_barbell', name: 'Barbell & plates', category: 'free-weight', available: true, incrementKg: 2.5 },
  { id: 'eq_dumbbells', name: 'Dumbbells', category: 'free-weight', available: true, incrementKg: 2 },
  { id: 'eq_ez_bar', name: 'EZ curl bar', category: 'free-weight', available: true, incrementKg: 2.5 },
  { id: 'eq_kettlebell', name: 'Kettlebells', category: 'free-weight', available: false, incrementKg: 4 },
  { id: 'eq_bench', name: 'Adjustable bench', category: 'accessory', available: true, incrementKg: null },
  { id: 'eq_rack', name: 'Squat rack / power rack', category: 'accessory', available: true, incrementKg: null },
  { id: 'eq_cable', name: 'Cable machine', category: 'cable', available: true, incrementKg: 5 },
  { id: 'eq_leg_press', name: 'Leg press machine', category: 'machine', available: true, incrementKg: 10 },
  { id: 'eq_chest_press', name: 'Chest press machine', category: 'machine', available: true, incrementKg: 5 },
  { id: 'eq_lat_pulldown', name: 'Lat pulldown machine', category: 'machine', available: true, incrementKg: 5 },
  { id: 'eq_seated_row', name: 'Seated row machine', category: 'machine', available: true, incrementKg: 5 },
  { id: 'eq_shoulder_press', name: 'Shoulder press machine', category: 'machine', available: true, incrementKg: 5 },
  { id: 'eq_leg_extension', name: 'Leg extension machine', category: 'machine', available: true, incrementKg: 5 },
  { id: 'eq_leg_curl', name: 'Leg curl machine', category: 'machine', available: true, incrementKg: 5 },
  { id: 'eq_pec_deck', name: 'Pec deck / rear delt machine', category: 'machine', available: false, incrementKg: 5 },
  { id: 'eq_smith', name: 'Smith machine', category: 'machine', available: false, incrementKg: 2.5 },
  { id: 'eq_hack_squat', name: 'Hack squat machine', category: 'machine', available: false, incrementKg: 10 },
  { id: 'eq_calf_machine', name: 'Calf raise machine', category: 'machine', available: false, incrementKg: 5 },
  { id: 'eq_hip_abductor', name: 'Hip abductor/adductor machine', category: 'machine', available: false, incrementKg: 5 },
  { id: 'eq_assisted_pullup', name: 'Assisted pull-up/dip machine', category: 'machine', available: false, incrementKg: 5 },
  { id: 'eq_pullup_bar', name: 'Pull-up bar', category: 'bodyweight', available: true, incrementKg: null },
  { id: 'eq_dip_station', name: 'Dip station', category: 'bodyweight', available: false, incrementKg: null },
  { id: 'eq_treadmill', name: 'Treadmill', category: 'cardio', available: true, incrementKg: null },
  { id: 'eq_bike', name: 'Exercise bike', category: 'cardio', available: true, incrementKg: null },
  { id: 'eq_rower', name: 'Rowing machine', category: 'cardio', available: false, incrementKg: null },
  { id: 'eq_elliptical', name: 'Elliptical / cross-trainer', category: 'cardio', available: false, incrementKg: null }
];

type E = [id: string, name: string, primary: Muscle[], secondary: Muscle[], equipment: string[], pattern: MovementPattern, tracking: TrackingMethod, load: LoadType, instructions: string[], alts?: string[], aliases?: string[]];

const EX: E[] = [
  // Push
  ['ex_bench_press', 'Barbell bench press', ['chest'], ['triceps', 'shoulders'], ['eq_barbell', 'eq_bench', 'eq_rack'], 'horizontal-push', 'weight_reps', 'free-weight', ['Lie with eyes under the bar, feet flat.', 'Lower the bar to mid-chest with control.', 'Press up until arms are straight.'], ['ex_db_bench_press', 'ex_chest_press'], ['Flat bench']],
  ['ex_db_bench_press', 'Dumbbell bench press', ['chest'], ['triceps', 'shoulders'], ['eq_dumbbells', 'eq_bench'], 'horizontal-push', 'weight_reps', 'free-weight', ['Press dumbbells from chest level to straight arms.', 'Lower under control to a comfortable depth.'], ['ex_bench_press', 'ex_chest_press']],
  ['ex_incline_db_press', 'Incline dumbbell press', ['chest', 'shoulders'], ['triceps'], ['eq_dumbbells', 'eq_bench'], 'horizontal-push', 'weight_reps', 'free-weight', ['Set bench to ~30°.', 'Press dumbbells up and slightly together.'], ['ex_db_bench_press']],
  ['ex_chest_press', 'Chest press machine', ['chest'], ['triceps', 'shoulders'], ['eq_chest_press'], 'horizontal-push', 'weight_reps', 'machine', ['Set seat so handles are at mid-chest.', 'Press forward without locking out hard.', 'Return slowly.'], ['ex_db_bench_press']],
  ['ex_push_up', 'Push-up', ['chest'], ['triceps', 'shoulders', 'core'], ['eq_bodyweight'], 'horizontal-push', 'bodyweight_reps', 'bodyweight', ['Hands slightly wider than shoulders, body in a straight line.', 'Lower chest toward the floor, then press up.'], ['ex_db_bench_press']],
  ['ex_ohp', 'Overhead press (barbell)', ['shoulders'], ['triceps', 'core'], ['eq_barbell', 'eq_rack'], 'vertical-push', 'weight_reps', 'free-weight', ['Bar at collarbone, grip just outside shoulders.', 'Press overhead, moving head back slightly then through.'], ['ex_db_shoulder_press', 'ex_shoulder_press_machine'], ['OHP', 'Military press']],
  ['ex_db_shoulder_press', 'Dumbbell shoulder press', ['shoulders'], ['triceps'], ['eq_dumbbells', 'eq_bench'], 'vertical-push', 'weight_reps', 'free-weight', ['Seated, press dumbbells overhead from shoulder height.'], ['ex_shoulder_press_machine', 'ex_ohp']],
  ['ex_shoulder_press_machine', 'Shoulder press machine', ['shoulders'], ['triceps'], ['eq_shoulder_press'], 'vertical-push', 'weight_reps', 'machine', ['Adjust seat so handles start at shoulder height.', 'Press up, return under control.'], ['ex_db_shoulder_press']],
  ['ex_lateral_raise', 'Dumbbell lateral raise', ['shoulders'], [], ['eq_dumbbells'], 'shoulder-isolation', 'weight_reps', 'free-weight', ['Raise dumbbells out to the sides to shoulder height with slight elbow bend.'], ['ex_cable_lateral_raise']],
  ['ex_cable_lateral_raise', 'Cable lateral raise', ['shoulders'], [], ['eq_cable'], 'shoulder-isolation', 'weight_reps', 'cable', ['Single arm, cable from low pulley across the body, raise to shoulder height.'], ['ex_lateral_raise']],
  ['ex_pec_fly', 'Pec deck fly', ['chest'], [], ['eq_pec_deck'], 'chest-isolation', 'weight_reps', 'machine', ['Bring handles together in an arc, squeeze, return slowly.'], ['ex_cable_fly']],
  ['ex_cable_fly', 'Cable chest fly', ['chest'], ['shoulders'], ['eq_cable'], 'chest-isolation', 'weight_reps', 'cable', ['Pulleys at chest height, step forward, bring hands together in an arc.'], ['ex_pec_fly']],
  ['ex_triceps_pushdown', 'Cable triceps pushdown', ['triceps'], [], ['eq_cable'], 'elbow-extension', 'weight_reps', 'cable', ['Elbows pinned to sides, push the bar/rope down to full extension.'], ['ex_overhead_triceps', 'ex_bench_dip']],
  ['ex_overhead_triceps', 'Overhead dumbbell triceps extension', ['triceps'], [], ['eq_dumbbells'], 'elbow-extension', 'weight_reps', 'free-weight', ['Hold one dumbbell overhead with both hands, lower behind head, extend.'], ['ex_triceps_pushdown']],
  ['ex_bench_dip', 'Bench dip', ['triceps'], ['chest', 'shoulders'], ['eq_bench'], 'elbow-extension', 'bodyweight_reps', 'bodyweight', ['Hands on bench behind you, lower by bending elbows, press up.'], ['ex_triceps_pushdown']],
  ['ex_dip', 'Parallel-bar dip', ['chest', 'triceps'], ['shoulders'], ['eq_dip_station'], 'vertical-push', 'bodyweight_reps', 'bodyweight', ['Lower until upper arms are about parallel, press up.'], ['ex_assisted_dip']],
  ['ex_assisted_dip', 'Assisted dip (machine)', ['chest', 'triceps'], ['shoulders'], ['eq_assisted_pullup'], 'vertical-push', 'assisted_bodyweight', 'machine', ['Kneel on the pad; more assistance makes it easier.'], ['ex_dip', 'ex_bench_dip']],
  // Pull
  ['ex_lat_pulldown', 'Lat pulldown', ['lats', 'back'], ['biceps'], ['eq_lat_pulldown'], 'vertical-pull', 'weight_reps', 'machine', ['Grip slightly wider than shoulders, pull bar to upper chest, control the return.'], ['ex_pull_up', 'ex_assisted_pull_up'], ['Pulldown']],
  ['ex_pull_up', 'Pull-up', ['lats', 'back'], ['biceps'], ['eq_pullup_bar'], 'vertical-pull', 'bodyweight_reps', 'bodyweight', ['From a dead hang, pull until chin clears the bar.'], ['ex_lat_pulldown', 'ex_assisted_pull_up'], ['Chin-up']],
  ['ex_assisted_pull_up', 'Assisted pull-up (machine)', ['lats', 'back'], ['biceps'], ['eq_assisted_pullup'], 'vertical-pull', 'assisted_bodyweight', 'machine', ['Kneel on the pad; more assistance makes it easier.'], ['ex_lat_pulldown', 'ex_pull_up']],
  ['ex_seated_row', 'Seated row machine', ['back'], ['lats', 'biceps'], ['eq_seated_row'], 'horizontal-pull', 'weight_reps', 'machine', ['Chest against pad, pull handles to torso, squeeze shoulder blades.'], ['ex_cable_row', 'ex_db_row']],
  ['ex_cable_row', 'Seated cable row', ['back'], ['lats', 'biceps'], ['eq_cable'], 'horizontal-pull', 'weight_reps', 'cable', ['Sit tall, pull handle to lower ribs, return with control.'], ['ex_seated_row', 'ex_db_row']],
  ['ex_db_row', 'One-arm dumbbell row', ['back', 'lats'], ['biceps'], ['eq_dumbbells', 'eq_bench'], 'horizontal-pull', 'weight_reps', 'free-weight', ['Knee and hand on bench, row dumbbell toward hip.'], ['ex_cable_row', 'ex_barbell_row']],
  ['ex_barbell_row', 'Barbell bent-over row', ['back', 'lats'], ['biceps', 'hamstrings'], ['eq_barbell'], 'horizontal-pull', 'weight_reps', 'free-weight', ['Hinge forward with a neutral back, row bar to lower chest.'], ['ex_db_row', 'ex_seated_row']],
  ['ex_face_pull', 'Cable face pull', ['shoulders', 'back'], [], ['eq_cable'], 'horizontal-pull', 'weight_reps', 'cable', ['Rope at face height, pull toward forehead with elbows high.'], ['ex_rear_delt_fly']],
  ['ex_rear_delt_fly', 'Rear delt fly (dumbbell)', ['shoulders'], ['back'], ['eq_dumbbells'], 'shoulder-isolation', 'weight_reps', 'free-weight', ['Hinge forward, raise dumbbells out to the sides.'], ['ex_face_pull']],
  ['ex_db_curl', 'Dumbbell biceps curl', ['biceps'], ['forearms'], ['eq_dumbbells'], 'elbow-flexion', 'weight_reps', 'free-weight', ['Curl dumbbells without swinging, lower slowly.'], ['ex_cable_curl', 'ex_ez_curl'], ['Biceps curl']],
  ['ex_ez_curl', 'EZ-bar curl', ['biceps'], ['forearms'], ['eq_ez_bar'], 'elbow-flexion', 'weight_reps', 'free-weight', ['Curl the bar to shoulder height keeping elbows by your sides.'], ['ex_db_curl']],
  ['ex_cable_curl', 'Cable biceps curl', ['biceps'], ['forearms'], ['eq_cable'], 'elbow-flexion', 'weight_reps', 'cable', ['Low pulley, curl bar or rope toward shoulders.'], ['ex_db_curl']],
  ['ex_hammer_curl', 'Hammer curl', ['biceps', 'forearms'], [], ['eq_dumbbells'], 'elbow-flexion', 'weight_reps', 'free-weight', ['Neutral (palms-in) grip curl.'], ['ex_db_curl']],
  // Legs
  ['ex_back_squat', 'Barbell back squat', ['quads', 'glutes'], ['hamstrings', 'core'], ['eq_barbell', 'eq_rack'], 'squat', 'weight_reps', 'free-weight', ['Bar on upper back, brace, sit down between hips and knees, stand up.'], ['ex_goblet_squat', 'ex_leg_press'], ['Squat']],
  ['ex_goblet_squat', 'Goblet squat', ['quads', 'glutes'], ['core'], ['eq_dumbbells'], 'squat', 'weight_reps', 'free-weight', ['Hold a dumbbell at chest, squat down keeping torso upright.'], ['ex_back_squat', 'ex_leg_press']],
  ['ex_leg_press', 'Leg press', ['quads', 'glutes'], ['hamstrings'], ['eq_leg_press'], 'squat', 'weight_reps', 'machine', ['Feet shoulder-width on platform, lower until knees ~90°, press without locking knees.'], ['ex_goblet_squat', 'ex_hack_squat']],
  ['ex_hack_squat', 'Hack squat (machine)', ['quads', 'glutes'], [], ['eq_hack_squat'], 'squat', 'weight_reps', 'machine', ['Shoulders under pads, squat down and drive up.'], ['ex_leg_press']],
  ['ex_deadlift', 'Deadlift (barbell)', ['hamstrings', 'glutes', 'back'], ['forearms', 'core'], ['eq_barbell'], 'hinge', 'weight_reps', 'free-weight', ['Bar over mid-foot, hinge and grip, brace, stand up by pushing the floor away.'], ['ex_rdl', 'ex_db_rdl'], ['Conventional deadlift']],
  ['ex_rdl', 'Romanian deadlift (barbell)', ['hamstrings', 'glutes'], ['back'], ['eq_barbell'], 'hinge', 'weight_reps', 'free-weight', ['Soft knees, push hips back lowering the bar along the legs, return.'], ['ex_db_rdl', 'ex_leg_curl']],
  ['ex_db_rdl', 'Dumbbell Romanian deadlift', ['hamstrings', 'glutes'], ['back'], ['eq_dumbbells'], 'hinge', 'weight_reps', 'free-weight', ['As the barbell version, holding dumbbells.'], ['ex_rdl']],
  ['ex_hip_thrust', 'Barbell hip thrust', ['glutes'], ['hamstrings'], ['eq_barbell', 'eq_bench'], 'hip', 'weight_reps', 'free-weight', ['Upper back on bench, bar over hips, drive hips up and squeeze.'], ['ex_glute_bridge']],
  ['ex_glute_bridge', 'Glute bridge', ['glutes'], ['hamstrings'], ['eq_bodyweight'], 'hip', 'bodyweight_reps', 'bodyweight', ['Lying on back, drive hips up, squeeze, lower.'], ['ex_hip_thrust']],
  ['ex_leg_extension', 'Leg extension', ['quads'], [], ['eq_leg_extension'], 'knee-extension', 'weight_reps', 'machine', ['Pad above ankles, extend knees, lower slowly.'], ['ex_goblet_squat']],
  ['ex_leg_curl', 'Leg curl (seated or lying)', ['hamstrings'], [], ['eq_leg_curl'], 'knee-flexion', 'weight_reps', 'machine', ['Curl the pad toward you, control the return.'], ['ex_db_rdl']],
  ['ex_walking_lunge', 'Dumbbell walking lunge', ['quads', 'glutes'], ['hamstrings'], ['eq_dumbbells'], 'lunge', 'weight_reps', 'free-weight', ['Step forward, lower back knee toward the floor, step through.'], ['ex_split_squat']],
  ['ex_split_squat', 'Split squat (bodyweight or dumbbell)', ['quads', 'glutes'], [], ['eq_bodyweight'], 'lunge', 'bodyweight_reps', 'bodyweight', ['Staggered stance, lower straight down, drive up.'], ['ex_walking_lunge']],
  ['ex_calf_raise', 'Standing calf raise', ['calves'], [], ['eq_bodyweight'], 'calf', 'bodyweight_reps', 'bodyweight', ['On a step edge, rise onto toes, lower heels below the step.'], ['ex_calf_machine']],
  ['ex_calf_machine', 'Calf raise machine', ['calves'], [], ['eq_calf_machine'], 'calf', 'weight_reps', 'machine', ['Full range: deep stretch at bottom, pause at top.'], ['ex_calf_raise']],
  ['ex_hip_abduction', 'Hip abduction machine', ['glutes'], [], ['eq_hip_abductor'], 'hip', 'weight_reps', 'machine', ['Push pads outward, return slowly.'], ['ex_glute_bridge']],
  // Core
  ['ex_plank', 'Plank', ['core'], ['shoulders'], ['eq_bodyweight'], 'core', 'duration', 'bodyweight', ['Forearms and toes, straight line from head to heels, breathe.'], ['ex_dead_bug']],
  ['ex_dead_bug', 'Dead bug', ['core'], [], ['eq_bodyweight'], 'core', 'reps', 'bodyweight', ['On back, extend opposite arm and leg while keeping lower back down.'], ['ex_plank']],
  ['ex_cable_crunch', 'Cable crunch', ['core'], [], ['eq_cable'], 'core', 'weight_reps', 'cable', ['Kneel, rope by head, crunch down by flexing the spine.'], ['ex_dead_bug']],
  ['ex_farmers_carry', "Farmer's carry", ['forearms', 'core'], ['shoulders'], ['eq_dumbbells'], 'carry', 'distance_duration', 'free-weight', ['Hold heavy dumbbells at sides, walk tall.'], []],
  // Cardio (gym machines; outdoor activities are logged as cardio activities)
  ['ex_treadmill_walk', 'Treadmill walking', ['cardio'], ['calves'], ['eq_treadmill'], 'locomotion', 'distance_duration', 'none', ['Choose a pace and incline you can sustain.'], ['ex_bike']],
  ['ex_bike', 'Exercise bike', ['cardio'], ['quads'], ['eq_bike'], 'cycling', 'distance_duration', 'none', ['Set seat height so the knee is slightly bent at the bottom.'], ['ex_treadmill_walk']],
  ['ex_rower', 'Rowing machine', ['cardio'], ['back', 'quads'], ['eq_rower'], 'rowing', 'distance_duration', 'none', ['Legs, then body, then arms; reverse on the return.'], ['ex_bike']],
  ['ex_elliptical', 'Elliptical trainer', ['cardio'], [], ['eq_elliptical'], 'locomotion', 'distance_duration', 'none', ['Steady stride, upright posture.'], ['ex_bike']]
];

export function seedExercises(): Exercise[] {
  return EX.map(([id, name, primary, secondary, equipment, pattern, tracking, load, instructions, alts, aliases]) => ({
    id,
    name,
    aliases: aliases ?? [],
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    equipmentIds: equipment,
    movementPattern: pattern,
    type: primary.includes('cardio') ? 'cardio' : 'strength',
    tracking,
    loadType: load,
    instructions,
    mediaUrl: null,
    alternativeIds: alts ?? [],
    incrementKg: null,
    custom: false,
    archived: false
  }));
}

export const SEED_GYM: Gym = { id: 'gym_main', name: 'My gym', notes: 'Rename in Settings. Machine weights are only compared within the same gym.' };

const te = (id: string, exerciseId: string, sets: number, repMin: number, repMax: number, restSec: number, extra: Partial<TemplateExercise> = {}): TemplateExercise => ({
  id,
  exerciseId,
  sets,
  repMin,
  repMax,
  targetWeightKg: null,
  targetDurationSec: null,
  restSec,
  warmupSets: 0,
  rpe: null,
  rir: null,
  notes: '',
  progression: { ...DEFAULT_PROGRESSION },
  ...extra
});

/** Optional example templates and programmes (no history, no weights). Added from the Workouts page on request. */
export function exampleProgrammes(now: string): { templates: WorkoutTemplate[]; programmes: WorkoutProgramme[] } {
  const t = (id: string, name: string, description: string, exercises: TemplateExercise[]): WorkoutTemplate => ({ id, name, description, exercises, notes: '', archived: false, createdAt: now, updatedAt: now });
  const templates: WorkoutTemplate[] = [
    t('tpl_fb_beginner', 'Full body — beginner (machines)', 'Simple machine-based full-body session.', [
      te('tpl_fb_beginner_1', 'ex_leg_press', 3, 10, 15, 120),
      te('tpl_fb_beginner_2', 'ex_chest_press', 3, 8, 12, 90),
      te('tpl_fb_beginner_3', 'ex_lat_pulldown', 3, 8, 12, 90),
      te('tpl_fb_beginner_4', 'ex_seated_row', 3, 8, 12, 90),
      te('tpl_fb_beginner_5', 'ex_shoulder_press_machine', 2, 8, 12, 90),
      te('tpl_fb_beginner_6', 'ex_plank', 2, 0, 0, 60, { targetDurationSec: 30, progression: { ...DEFAULT_PROGRESSION, method: 'time' } })
    ]),
    t('tpl_upper', 'Upper body', 'Upper day of an upper/lower split.', [
      te('tpl_upper_1', 'ex_db_bench_press', 3, 8, 12, 120, { warmupSets: 1 }),
      te('tpl_upper_2', 'ex_lat_pulldown', 3, 8, 12, 90),
      te('tpl_upper_3', 'ex_db_shoulder_press', 3, 8, 12, 90),
      te('tpl_upper_4', 'ex_cable_row', 3, 10, 12, 90),
      te('tpl_upper_5', 'ex_triceps_pushdown', 2, 10, 15, 60),
      te('tpl_upper_6', 'ex_db_curl', 2, 10, 15, 60)
    ]),
    t('tpl_lower', 'Lower body', 'Lower day of an upper/lower split.', [
      te('tpl_lower_1', 'ex_leg_press', 3, 8, 12, 120, { warmupSets: 1 }),
      te('tpl_lower_2', 'ex_db_rdl', 3, 8, 12, 120),
      te('tpl_lower_3', 'ex_leg_extension', 3, 10, 15, 60),
      te('tpl_lower_4', 'ex_leg_curl', 3, 10, 15, 60),
      te('tpl_lower_5', 'ex_calf_raise', 2, 12, 20, 60),
      te('tpl_lower_6', 'ex_dead_bug', 2, 8, 12, 60, { progression: { ...DEFAULT_PROGRESSION, method: 'reps' } })
    ]),
    t('tpl_3d_a', 'Full body A', 'Day A of a three-day full-body programme.', [
      te('tpl_3d_a_1', 'ex_goblet_squat', 3, 8, 12, 120),
      te('tpl_3d_a_2', 'ex_db_bench_press', 3, 8, 12, 120),
      te('tpl_3d_a_3', 'ex_seated_row', 3, 8, 12, 90),
      te('tpl_3d_a_4', 'ex_lateral_raise', 2, 12, 15, 60)
    ]),
    t('tpl_3d_b', 'Full body B', 'Day B of a three-day full-body programme.', [
      te('tpl_3d_b_1', 'ex_db_rdl', 3, 8, 12, 120),
      te('tpl_3d_b_2', 'ex_lat_pulldown', 3, 8, 12, 90),
      te('tpl_3d_b_3', 'ex_shoulder_press_machine', 3, 8, 12, 90),
      te('tpl_3d_b_4', 'ex_leg_curl', 2, 10, 15, 60)
    ]),
    t('tpl_3d_c', 'Full body C', 'Day C of a three-day full-body programme.', [
      te('tpl_3d_c_1', 'ex_leg_press', 3, 10, 15, 120),
      te('tpl_3d_c_2', 'ex_chest_press', 3, 8, 12, 90),
      te('tpl_3d_c_3', 'ex_db_row', 3, 8, 12, 90),
      te('tpl_3d_c_4', 'ex_triceps_pushdown', 2, 10, 15, 60),
      te('tpl_3d_c_5', 'ex_hammer_curl', 2, 10, 15, 60)
    ])
  ];
  const programmes: WorkoutProgramme[] = [
    { id: 'prog_fb_beginner', name: 'Full-body beginner', description: 'One machine-based session, repeat 2–3× per week.', templateIds: ['tpl_fb_beginner'], schedule: { type: 'rotation' }, targetSessionsPerWeek: 2, active: false, createdAt: now, updatedAt: now },
    { id: 'prog_upper_lower', name: 'Upper/lower split', description: 'Alternate upper and lower days, ~4 sessions per week.', templateIds: ['tpl_upper', 'tpl_lower'], schedule: { type: 'rotation' }, targetSessionsPerWeek: 4, active: false, createdAt: now, updatedAt: now },
    { id: 'prog_3day_fb', name: 'Three-day full body', description: 'A/B/C rotation on Monday, Wednesday and Friday.', templateIds: ['tpl_3d_a', 'tpl_3d_b', 'tpl_3d_c'], schedule: { type: 'weekdays', days: [ { weekday: 1, templateId: 'tpl_3d_a' }, { weekday: 3, templateId: 'tpl_3d_b' }, { weekday: 5, templateId: 'tpl_3d_c' } ] }, targetSessionsPerWeek: 3, active: false, createdAt: now, updatedAt: now }
  ];
  return { templates, programmes };
}
