import type { Weight } from '../engine/model'

/**
 * Demo case material. Rubric paths are looked up in the Publicum repertory at seed
 * time; any path that does not exist is skipped, so the texts can be edited freely.
 */

export interface RubricSpec {
  /** Full rubric path, "Chapter, rubric, sub-rubric". */
  p: string
  w?: Weight
  /** Eliminative symptom. */
  elim?: boolean
  /** Group letter (symptoms sharing it count as one). */
  group?: string
  causal?: boolean
  /** Clipboard index within the consultation (default 0). */
  cb?: number
  note?: string
}

export interface CaseTemplate {
  key: string
  /** Remedy abbreviation the case points to (and is prescribed). */
  remedy: string
  kind: 'chronic' | 'acute'
  title: string
  complaint: string
  notes: string
  assessment: string
  /** Clipboard names, index = RubricSpec.cb. */
  clipboards: string[]
  rubrics: RubricSpec[]
  potencies: string[]
  dosage: string
  /** Suitable for children. */
  paediatric?: boolean
  sex?: 'female' | 'male'
}

// ───────────────────────── archetypal chronic cases ─────────────────────────

export const ARCHETYPES: CaseTemplate[] = [
  {
    key: 'puls', remedy: 'Puls', kind: 'chronic', sex: 'female',
    title: 'Recurrent sinusitis, late menses',
    complaint: 'Recurrent sinusitis with thick yellow-green catarrh; menses late and scanty',
    notes: `Third sinus infection this winter. Discharge thick, bland, yellow to green; blocked in a warm room, clears walking outdoors ("I have to open the window even in January").
Weeps easily while telling her story, apologises for it; feels much better after a hug or a chat with her sister. Mood changes by the hour.
Hardly drinks, "forgets" to, even in fever. Rich or fatty food gives a heavy stomach for hours; never liked the fat on meat.
Menses late (35-40 days), scanty, flow stops and starts. Chilly yet cannot stand stuffy rooms.
O/E: gentle, yielding, soft voice. Tongue coated white.`,
    assessment: 'Clear Pulsatilla picture: changeable, consolation amel., thirstless, open air amel., fat agg. Mentals and generals agree; nasal and menstrual particulars confirm.',
    clipboards: ['Mentals & generals', 'Particulars'],
    rubrics: [
      { p: 'Mind, weeping, tearful mood, etc.', w: 3 },
      { p: 'Mind, consolation, amel.', w: 2 },
      { p: 'Mind, mood, changeable', w: 2 },
      { p: 'Mind, mildness', w: 2 },
      { p: 'Mind, company, desire for', w: 1 },
      { p: 'Generalities, air, open, amel.', w: 3, elim: true },
      { p: 'Generalities, warm, room agg.', w: 2 },
      { p: 'Stomach, thirstless', w: 3 },
      { p: 'Appetite, aversion, fats and rich food', w: 2, group: 'a' },
      { p: 'Generalities, food, fat agg.', w: 2, group: 'a' },
      { p: 'Genitalia female, menses, late', w: 1, cb: 1 },
      { p: 'Nose, discharge, yellow', w: 1, cb: 1 },
    ],
    potencies: ['30C', '200C', '1M'], dosage: 'Single dose, 3 pellets dry on the tongue',
  },
  {
    key: 'ars', remedy: 'Ars', kind: 'chronic', sex: 'male',
    title: 'Burning gastritis, health anxiety',
    complaint: 'Burning epigastric pain after midnight; anxious restlessness about his health',
    notes: `Gastritis for two years, gastroscopy "mild erosive". Pains burning, worst 00:30-02:00, better from warm milk and a hot-water bottle.
Wakes after midnight with anxiety and must get up and walk about; cannot be alone at night, wakes his wife. Afraid he has cancer, has read everything online; brought a typed list of symptoms with dates.
Extremely orderly: pens aligned on the desk, re-arranged the chairs in the waiting room. Very chilly, wears a vest in summer.
Thirst for small sips of water, often. Sudden weakness with the attacks, out of proportion.
Loose stools after fruit or cold food.`,
    assessment: 'Arsenicum album: anxious restlessness after midnight, fear of death and of being alone, fastidious, chilly with heat amel., burning pains amel. warmth, thirst for sips.',
    clipboards: ['Case'],
    rubrics: [
      { p: 'Mind, anxiety, health', w: 2 },
      { p: 'Mind, fear, death', w: 2 },
      { p: 'Mind, restlessness, anxious', w: 3 },
      { p: 'Mind, fastidious', w: 2 },
      { p: 'Mind, fear, alone', w: 2 },
      { p: 'Generalities, midnight', w: 2 },
      { p: 'Generalities, heat, vital, lack of', w: 3, elim: true },
      { p: 'Generalities, warm, stove, amel.', w: 1 },
      { p: 'Stomach, thirst, small quantities', w: 3 },
      { p: 'Generalities, pain, burning', w: 2 },
      { p: 'Generalities, weakness, sudden', w: 1 },
      { p: 'Rectum, diarrhea', w: 1 },
    ],
    potencies: ['30C', '200C', 'LM1'], dosage: 'LM1: 5 drops in half a glass of water daily, succuss 10x before each dose',
  },
  {
    key: 'sulph', remedy: 'Sulph', kind: 'chronic', sex: 'male',
    title: 'Chronic eczema, hot feet',
    complaint: 'Itching eczema of flexures, worse from warmth of bed and washing',
    notes: `Eczema since childhood, flared after cortisone creams were stopped. Itching intense in the warmth of the bed; scratches until it bleeds, then burns. Bathing aggravates; showers quickly.
Hot, puts feet out of the covers at night. Flushes of heat to the face after meals.
Sinking, empty feeling at 11 a.m., must eat. Loves sweets, spicy food and beer.
Talks at length about system architecture and philosophy; "I can fix anything in theory". Office described by his wife as chaos; wears the same hoodie. Morning stools drive him out of bed.`,
    assessment: 'Sulphur: theorising, untidy, hot, warmth of bed agg., bathing agg., 11 a.m. hunger, itching eruptions scratched raw.',
    clipboards: ['Case'],
    rubrics: [
      { p: 'Mind, theorizing', w: 2 },
      { p: 'Mind, untidy', w: 1 },
      { p: 'Mind, indolence', w: 1 },
      { p: 'Generalities, heat, flushes of', w: 2 },
      { p: 'Generalities, warm, bed agg.', w: 3 },
      { p: 'Generalities, bathing, agg.', w: 2 },
      { p: 'Extremities, heat, foot', w: 2 },
      { p: 'Skin, itching, warm, in bed, on becoming', w: 3 },
      { p: 'Skin, eruptions, eczema', w: 2 },
      { p: 'Stomach, emptiness, forenoon, 11 a.m.', w: 3 },
      { p: 'Appetite, desires, sweets', w: 1 },
      { p: 'Appetite, desires, alcoholic drinks', w: 1 },
      { p: 'Rectum, diarrhea, morning', w: 1 },
    ],
    potencies: ['30C', '200C', 'LM2'], dosage: 'Single dose, then wait 6 weeks',
  },
  {
    key: 'lyc', remedy: 'Lyc', kind: 'chronic', sex: 'male',
    title: 'Bloating and anticipatory anxiety',
    complaint: 'Abdominal bloating after a few mouthfuls; worse 4-8 p.m.; anxiety before court hearings',
    notes: `Bloated after a few bites ("full after three spoons of soup"), rumbling flatulence, belt must be loosened. Worst in the late afternoon, 4 to 8 p.m.; tired and irritable at that time.
Anticipatory anxiety before every hearing, sure he will fail, then performs brilliantly. Colleagues see him as confident; at home he is "the boss" and intolerant of contradiction (wife's words).
Craves sweets, chocolate after every meal; prefers warm drinks. Red sand-like sediment in urine noted by GP.
Right-sided complaints: right inguinal hernia, right shoulder pain.`,
    assessment: 'Lycopodium: lack of confidence masked by dictatorial behaviour, anticipation, 4-8 p.m. agg., easy satiety with flatulence, desire sweets, right-sidedness.',
    clipboards: ['Mentals', 'Generals & particulars'],
    rubrics: [
      { p: 'Mind, confidence, want of self', w: 3 },
      { p: 'Mind, anticipation, complaints from', w: 2 },
      { p: 'Mind, dictatorial', w: 2 },
      { p: 'Mind, cowardice', w: 1 },
      { p: 'Generalities, afternoon, 4 p.m. to 8 p.m.', w: 3, cb: 1 },
      { p: 'Abdomen, flatulence', w: 3, cb: 1 },
      { p: 'Appetite, easy satiety', w: 3, cb: 1 },
      { p: 'Appetite, desires, sweets', w: 2, cb: 1 },
      { p: 'Appetite, desires, warm drinks', w: 1, cb: 1 },
      { p: 'Urine, sediment, red', w: 1, cb: 1 },
      { p: 'Generalities, side, right', w: 2, cb: 1 },
    ],
    potencies: ['200C', '1M', '30C'], dosage: 'Single dose of 3 pellets at bedtime',
  },
  {
    key: 'natm', remedy: 'Nat-m', kind: 'chronic', sex: 'female',
    title: 'Migraine since a separation',
    complaint: 'Hammering migraines from sun exposure since a separation two years ago',
    notes: `Migraines since her partner left two years ago; "I never talk about it". Did not cry at the time, cries alone in the bathroom. Consolation makes her angry: "leave me, I'm fine".
Keeps going over old hurts, remembers every word said. Prefers to be alone after work; reserved, answers precisely.
Headaches hammering, from the sun and after reading; lies in the dark. Lips dry and cracked in the middle. Salts food before tasting it; thirsty for large glasses of cold water.
Thin despite a good appetite.`,
    assessment: 'Natrum muriaticum: silent grief, consolation agg., dwelling on the past, aversion to company, desire salt, sun agg., cracked lips.',
    clipboards: ['Case'],
    rubrics: [
      { p: 'Mind, grief', w: 3, causal: true },
      { p: 'Mind, grief, silent', w: 2 },
      { p: 'Mind, consolation, agg.', w: 3 },
      { p: 'Mind, company aversion to', w: 2 },
      { p: 'Mind, dwells on past disagreeable occurrences', w: 2 },
      { p: 'Mind, weeping, alone, when', w: 1 },
      { p: 'Appetite, desires, salt things', w: 3 },
      { p: 'Generalities, sun, from exposure to', w: 2 },
      { p: 'Head, pain, sun, from exposure to agg.', w: 2 },
      { p: 'Face, cracked lips', w: 1 },
      { p: 'Stomach, thirst, extreme', w: 1 },
    ],
    potencies: ['200C', '1M', '30C'], dosage: 'Single dose, avoid coffee on the day',
  },
  {
    key: 'phos', remedy: 'Phos', kind: 'chronic', sex: 'female',
    title: 'Nosebleeds and fears',
    complaint: 'Frequent bright-red nosebleeds; fear of thunderstorms and of the dark',
    notes: `Nosebleeds several times a month, bright red, from blowing the nose. Burning in the chest with colds, which go down to the chest quickly.
Open, warm, instantly friendly; touched the practitioner's arm while talking. Very sympathetic: "I feel other people's pain". Needs company, especially in the evening; afraid in the dark and in thunderstorms, hides under the duvet.
Craves ice-cold drinks and ice cream, which ameliorate the burning. Cannot lie on the left side (palpitations).`,
    assessment: 'Phosphorus: sympathetic, desire company, fears (thunderstorm, dark), desire cold drinks, haemorrhages, left side lying agg.',
    clipboards: ['Case'],
    rubrics: [
      { p: 'Mind, sympathetic, compassionate', w: 3 },
      { p: 'Mind, company, desire for', w: 2 },
      { p: 'Mind, fear, thunderstorm, of', w: 3 },
      { p: 'Mind, fear, dark', w: 2 },
      { p: 'Mind, affectionate', w: 1 },
      { p: 'Appetite, desires, cold', w: 3 },
      { p: 'Nose, epistaxis', w: 2 },
      { p: 'Generalities, lying, side on, left, agg.', w: 2 },
      { p: 'Chest, pain, burning', w: 1 },
    ],
    potencies: ['30C', '200C'], dosage: 'Single dose; repeat only on relapse',
  },
  {
    key: 'calc', remedy: 'Calc', kind: 'chronic', paediatric: true,
    title: 'Recurrent colds, head sweats',
    complaint: 'Catches cold with every change of weather; profuse head sweat during sleep',
    notes: `Mother reports the pillow is soaked around the head every night. Teeth came late (first tooth at 13 months). Slow and steady, chubby, easily tired climbing stairs.
Chilly, colds with every damp spell; feet cold and clammy. Loves boiled eggs ("could eat three") and nibbles chalk and pencils.
Very stubborn once decided; watches before joining other children, dislikes being watched while playing.
Growth and development otherwise normal.`,
    assessment: 'Calcarea carbonica: head perspiration in sleep, delayed dentition, chilly with wet weather agg., desire eggs and indigestible things, obstinate, easily fatigued.',
    clipboards: ['Case'],
    rubrics: [
      { p: 'Head, perspiration', w: 3 },
      { p: 'Teeth, dentition, slow', w: 2 },
      { p: 'Mind, obstinate', w: 2 },
      { p: 'Mind, fear, observed', w: 1 },
      { p: 'Generalities, cold, becoming', w: 2 },
      { p: 'Generalities, cold, wet weather agg.', w: 2 },
      { p: 'Generalities, obesity', w: 1 },
      { p: 'Appetite, desires, eggs', w: 3 },
      { p: 'Appetite, desires, indigestible things', w: 2 },
      { p: 'Generalities, exertion, physical, agg.', w: 1 },
    ],
    potencies: ['30C', '200C'], dosage: 'Single dose at bedtime',
  },
  {
    key: 'nux', remedy: 'Nux-v', kind: 'chronic', sex: 'male',
    title: 'Insomnia and constipation under stress',
    complaint: 'Wakes at 3 a.m. with work thoughts; ineffectual urging for stool',
    notes: `Sales director, 60-hour weeks, four espressos a day and wine every evening "to switch off". Wakes at 3 a.m. thinking about targets, falls asleep again just before the alarm.
Constipation with frequent ineffectual urging, "as if not finished". Stomach heavy after meals.
Irritable, impatient, snaps at his children when contradicted; cannot bear noise in the house. Very chilly, hates drafts and cold wind. Worse in the morning, better after a nap.
Everything must be done properly and quickly.`,
    assessment: 'Nux vomica: irritability and impatience, hypersensitivity to noise, stimulants agg., constipation with ineffectual urging, waking at 3 a.m., chilly.',
    clipboards: ['Case'],
    rubrics: [
      { p: 'Mind, irritability', w: 3 },
      { p: 'Mind, anger, contradiction, from', w: 2 },
      { p: 'Mind, impatience', w: 2 },
      { p: 'Mind, fastidious', w: 1 },
      { p: 'Mind, sensitive, noise, to', w: 2 },
      { p: 'Generalities, cold, air agg.', w: 2 },
      { p: 'Generalities, food, coffee agg.', w: 1 },
      { p: 'Generalities, alcoholic drinks, agg.', w: 2 },
      { p: 'Stomach, pain, eating, after', w: 1 },
      { p: 'Rectum, constipation, ineffectual urging and straining', w: 3, elim: true },
      { p: 'Sleep, waking, 3 a.m.', w: 2 },
      { p: 'Generalities, morning', w: 1 },
    ],
    potencies: ['30C', '200C', 'LM1'], dosage: '30C: 3 pellets at night for 3 nights',
  },
]

// ───────────────────────── other chronic pictures ─────────────────────────

export const CHRONIC: CaseTemplate[] = [
  {
    key: 'sep', remedy: 'Sep', kind: 'chronic', sex: 'female',
    title: 'Exhaustion and indifference',
    complaint: 'Exhaustion, bearing-down sensation, indifferent to family',
    notes: `Two small children and a full-time job; "I love them but I feel nothing". Wants to be left alone; cries when describing her symptoms.
Dragging, bearing-down sensation in the pelvis, must cross her legs. Empty, sinking feeling in the stomach at 11 a.m.
Much better from vigorous exercise: a dance class is "the only time I feel alive".`,
    assessment: 'Sepia: indifference to family, aversion to company, exertion amel., sinking sensation, bearing down.',
    clipboards: ['Case'],
    rubrics: [
      { p: 'Mind, indifference, family, to', w: 3 },
      { p: 'Mind, company aversion to', w: 2 },
      { p: 'Mind, weeping, telling of her sickness, when', w: 2 },
      { p: 'Generalities, exertion, physical, amel.', w: 3 },
      { p: 'Stomach, sinking', w: 2 },
      { p: 'Genitalia female, prolapse, uterus', w: 2 },
      { p: 'Generalities, standing agg.', w: 1 },
    ],
    potencies: ['200C', '30C'], dosage: 'Single dose',
  },
  {
    key: 'ign', remedy: 'Ign', kind: 'chronic',
    title: 'Grief with sighing',
    complaint: 'Grief after bereavement; lump in the throat, frequent sighing',
    notes: `Father died three months ago. Sighs deeply throughout the consultation. Lump in the throat, "a ball I cannot swallow". Moods switch from laughing to crying within minutes.
Dislikes sympathy, walks out of the room when friends console. Sleep light, dreams of the funeral.`,
    assessment: 'Ignatia: acute grief, sighing, globus, changeable mood, consolation agg.',
    clipboards: ['Case'],
    rubrics: [
      { p: 'Mind, grief', w: 3, causal: true },
      { p: 'Mind, sighing', w: 3 },
      { p: 'Throat, lump', w: 2 },
      { p: 'Mind, mood, changeable', w: 2 },
      { p: 'Mind, consolation, agg.', w: 1 },
    ],
    potencies: ['200C', '30C'], dosage: 'Single dose, repeat after 1 week if needed',
  },
  {
    key: 'rhus', remedy: 'Rhus-t', kind: 'chronic',
    title: 'Stiff joints, better moving',
    complaint: 'Stiffness of back and joints on first motion, better from continued movement',
    notes: `Lower back and knees stiff on rising and after sitting; "rusty gate" at first, then limbers up with walking. Aggravated in cold damp weather; better from a hot bath.
Restless at night, has to change position constantly.`,
    assessment: 'Rhus toxicodendron: stiffness, first motion agg., continued motion amel., damp cold agg., restlessness.',
    clipboards: ['Case'],
    rubrics: [
      { p: 'Generalities, motion, at beginning of, agg.', w: 3 },
      { p: 'Generalities, motion, continued, amel.', w: 3 },
      { p: 'Extremities, stiffness', w: 2 },
      { p: 'Mind, restlessness', w: 2 },
      { p: 'Generalities, cold, wet weather agg.', w: 2 },
      { p: 'Back, pain, lumbar region', w: 1 },
      { p: 'Extremities, pain, joints', w: 1 },
    ],
    potencies: ['30C', '200C', 'LM1'], dosage: '30C twice daily for 5 days, then stop',
  },
]

// ───────────────────────── acute episodes ─────────────────────────

export const ACUTES: CaseTemplate[] = [
  {
    key: 'bell', remedy: 'Bell', kind: 'acute', paediatric: true,
    title: 'Sudden high fever',
    complaint: 'High fever of sudden onset, red hot face, throbbing headache',
    notes: `Fever 39.8 °C came on within an hour this afternoon. Face bright red and hot, hands and feet cold. Pupils dilated, eyes glassy. Throbbing headache, cries when the bed is jarred. Slight delirium on falling asleep. Throat red.`,
    assessment: 'Belladonna acute: sudden, intense heat, redness, throbbing, jar agg.',
    clipboards: ['Acute'],
    rubrics: [
      { p: 'Fever, burning heat', w: 3 },
      { p: 'Face, discoloration, red', w: 3 },
      { p: 'Head, pain, pulsating', w: 2 },
      { p: 'Eye, pupils, dilated', w: 2 },
      { p: 'Generalities, jar, stepping, agg.', w: 2 },
      { p: 'Mind, delirium', w: 1 },
      { p: 'Throat, discoloration', w: 1 },
    ],
    potencies: ['30C', '200C'], dosage: '30C every 2 hours while fever is high, max 6 doses',
  },
  {
    key: 'acon', remedy: 'Acon', kind: 'acute', paediatric: true,
    title: 'Croup after cold wind',
    complaint: 'Barking croupy cough near midnight after exposure to dry cold wind',
    notes: `Walked home in a dry, icy east wind. Woke before midnight with a barking croupy cough, frightened and restless, "I'm going to die". Very thirsty for cold water. Onset sudden, intense.`,
    assessment: 'Aconite: sudden onset after dry cold wind, fear and restlessness, croup.',
    clipboards: ['Acute'],
    rubrics: [
      { p: 'Generalities, cold, dry weather agg.', w: 3, causal: true },
      { p: 'Mind, fear, death', w: 3 },
      { p: 'Mind, restlessness', w: 2 },
      { p: 'Mind, anxiety, fear, with', w: 2 },
      { p: 'Cough, croupy', w: 2 },
      { p: 'Cough, barking', w: 1 },
      { p: 'Stomach, thirst, extreme', w: 1 },
    ],
    potencies: ['30C', '200C'], dosage: '30C every 30 minutes during the attack, max 4 doses',
  },
  {
    key: 'cham', remedy: 'Cham', kind: 'acute', paediatric: true,
    title: 'Teething, inconsolable',
    complaint: 'Teething, screaming, only quiet when carried',
    notes: `Molars coming through. Screams, pushes toys away, wants something then throws it. Only calms when carried around. One cheek red and hot, the other pale. Green stools.`,
    assessment: 'Chamomilla: irritable child, desire to be carried, one cheek red, difficult dentition.',
    clipboards: ['Acute'],
    rubrics: [
      { p: 'Mind, irritability, children, in', w: 3 },
      { p: 'Mind, carried, desires to be', w: 3 },
      { p: 'Face, discoloration, red, one-sided', w: 3 },
      { p: 'Teeth, dentition difficult', w: 2 },
      { p: 'Mind, anger', w: 1 },
    ],
    potencies: ['30C', '12C'], dosage: '30C as needed, up to 3 times daily',
  },
  {
    key: 'arn', remedy: 'Arn', kind: 'acute',
    title: 'Fall with bruising',
    complaint: 'Fall while cycling; bruised and sore all over, insists he is fine',
    notes: `Came off the bike on a wet road. Extensive bruising of hip and shoulder; the bed feels too hard, keeps shifting. Says "I'm fine, no need for fuss" although visibly in pain. X-ray at A&E: no fracture.`,
    assessment: 'Arnica: trauma, sore bruised pain, bed feels too hard, says he is well.',
    clipboards: ['Acute'],
    rubrics: [
      { p: 'Generalities, pain, sore, bruised', w: 3 },
      { p: 'Generalities, hard bed, sensation of', w: 3 },
      { p: 'Mind, well, says he is, when very sick', w: 2 },
    ],
    potencies: ['200C', '30C'], dosage: '200C three doses 4 hours apart',
  },
  {
    key: 'bry', remedy: 'Bry', kind: 'acute',
    title: 'Influenza, worse moving',
    complaint: 'Influenza with stitching chest pains, worse from the slightest motion',
    notes: `Lies perfectly still; every movement hurts. Stitching pain in the chest with coughing, holds the chest. Lies on the painful side for relief. Great thirst for large drinks at long intervals. Irritable, wants to be left alone, talks about work deadlines. Dry stools.`,
    assessment: 'Bryonia: motion agg., lying on painful side amel., thirst for large quantities, irritability, business talk.',
    clipboards: ['Acute'],
    rubrics: [
      { p: 'Generalities, motion, agg.', w: 3, elim: true },
      { p: 'Stomach, thirst, large quantities', w: 3 },
      { p: 'Generalities, lying, side on, painful, amel.', w: 2 },
      { p: 'Chest, pain, stitching', w: 2 },
      { p: 'Mind, business, talks of', w: 1 },
      { p: 'Mind, home, desires to go', w: 1 },
      { p: 'Rectum, constipation', w: 1 },
    ],
    potencies: ['30C', '200C'], dosage: '30C three times daily for 2 days',
  },
  {
    key: 'gels', remedy: 'Gels', kind: 'acute',
    title: 'Exam nerves and flu-like weakness',
    complaint: 'Trembling weakness and heavy eyelids before exams; occipital headache',
    notes: `Exam week. Trembling, weak legs, eyelids so heavy she can hardly keep them open. Dull occipital headache. Not thirsty at all. Diarrhoea from anticipation on the morning of the exam.`,
    assessment: 'Gelsemium: anticipation, trembling weakness, heavy lids, thirstless.',
    clipboards: ['Acute'],
    rubrics: [
      { p: 'Mind, anticipation, complaints from', w: 3, causal: true },
      { p: 'Eye, heaviness, lids', w: 3 },
      { p: 'Generalities, trembling', w: 2 },
      { p: 'Head, pain, occiput', w: 2 },
      { p: 'Stomach, thirstless', w: 2 },
      { p: 'Extremities, weakness', w: 1 },
    ],
    potencies: ['30C'], dosage: '30C the evening before and the morning of the exam',
  },
]

/** Noise rubrics mixed into generic cases so analyses look like real-life cases. */
export const COMMON_RUBRICS = [
  'Head, pain, forehead', 'Cough, dry', 'Cough, night', 'Skin, itching', 'Sleep, sleeplessness', 'Sleep, sleeplessness, thoughts activity of mind, from',
  'Back, pain', 'Stomach, heartburn', 'Stomach, nausea', 'Abdomen, pain, cramping', 'Throat, pain, swallowing, on', 'Nose, coryza', 'Generalities, weakness',
  'Mind, sadness', 'Mind, anxiety', 'Extremities, pain, knee', 'Vertigo, rising', 'Head, pain, morning', 'Ear, pain',
]

// ───────────────────────── follow-up material ─────────────────────────

/** Follow-up notes with the matching outcome (GHHOS score) and the practitioner's short evaluation. */
export const FOLLOW_UP_NOTES: { text: (remedy: string) => string; score: number; response: string }[] = [
  { text: r => `Clear improvement since ${r}: energy up, sleeping through most nights. Main complaint about 60% better. Mild return of old symptoms in week 2 for three days, then settled.`, score: 3, response: 'Energy and sleep first, then the chief complaint; brief return of old symptoms. Curative direction.' },
  { text: r => `After ${r}: initial aggravation for 4 days, then marked improvement. Mood noticeably lighter ("like a fog lifted"). Particulars 50% better.`, score: 2, response: 'Short initial aggravation followed by improvement, mentals first.' },
  { text: r => `Partial response to ${r}; general state better but the chief complaint only slightly changed. Improvement plateaued after week 4.`, score: 1, response: 'Generals better, particulars barely changed; plateau after 4 weeks.' },
  { text: r => `Well on ${r}. Only minor symptoms left; wants to continue. Family noticed calmer behaviour.`, score: 4, response: 'Near complete resolution; family confirms the change.' },
  { text: r => `Relapse after a stressful month; ${r} had worked well until then. Picture unchanged, same modalities.`, score: -1, response: 'Relapse after stress, same picture: remedy still indicated, effect used up.' },
]

/** Patient-level notes for the archetypal cases (history, family, practical points). */
export const ARCHETYPE_PATIENT_NOTES: Record<string, string> = {
  puls: 'Referred by her sister (also a patient). Tearful at the first visit, relaxed quickly with a sympathetic ear. Oral contraceptive until 2023. Prefers late-morning appointments; avoid stuffy room 2.',
  ars: 'Widower since 2021, lives alone, very punctual (arrives 15 minutes early). Brings typed lists of symptoms. Omeprazole 20 mg on demand. Father died of gastric cancer: high health anxiety.',
  sulph: 'Works from home, irregular meals, sweets and beer at night. Childhood eczema treated with cortisone creams for years. Wants to avoid steroids now. Contact by email.',
  lyc: 'Senior partner in a law firm; confident at work, anxious before court hearings. Father had gout and kidney stones. Prefers first appointment of the day. Takes pantoprazole occasionally.',
  natm: 'Reserved, needed time before talking about the separation. Grief is the key; do not rush. Migraine diary kept since 2024. Contact by email only; declines phone calls at work.',
  phos: 'Warm, open, easily frightened (thunderstorms, being alone at night). Iron deficiency 2024 (ferritin 12), supplemented. Blood donor in the past, stopped after fainting.',
  calc: 'Comes with his mother. Late teething and walking (15 months). Mother: easily scared of dark and dogs, very attached to routines. Vaccinations up to date. Allergic to strawberries (hives).',
  nux: 'Sales director, frequent travel. Coffee 4 cups/day, wine most evenings, occasional ibuprofen for headaches. Impatient in the waiting room; keep appointments on time. Wife encouraged the visit.',
}

export const FOLLOW_UP_ASSESSMENTS = [
  'Good response, same remedy. Wait and watch; repeat only on relapse.',
  'Improvement holding. Raise potency when the effect wears off.',
  'Response slowing; same picture, move to the next potency.',
  'Stable. Continue, review in 8 weeks.',
]

export const ACUTE_FOLLOW = 'Recovered within 48 hours. No further doses needed.'

// ───────────────────────── people ─────────────────────────

export const FEMALE_NAMES = ['Emma', 'Olivia', 'Sofia', 'Amara', 'Hannah', 'Chloé', 'Isabel', 'Mei', 'Priya', 'Leila', 'Grace', 'Ingrid', 'Lucía', 'Fatima', 'Nora', 'Zoe', 'Aisha', 'Clara', 'Yuki', 'Maya', 'Elena', 'Ruth', 'Aoife', 'Beatriz']
export const MALE_NAMES = ['James', 'Lucas', 'Mateo', 'Kwame', 'Daniel', 'Arjun', 'Tomás', 'Henrik', 'Omar', 'Samuel', 'Leo', 'Hiroshi', 'David', 'Rafael', 'Noah', 'Felix', 'Ibrahim', 'Patrick', 'Marco', 'Jonas', 'Ethan', 'Karim']
export const LAST_NAMES = ['Whitfield', 'Okafor', 'Fernández', 'Lindqvist', 'Nakamura', 'Moreau', 'Kowalski', 'Haddad', 'Brennan', 'Patel', 'Rossi', 'Schneider', 'Mensah', 'Johansson', 'Castillo', 'Dubois', 'Novak', 'Achebe', 'Walsh', 'Kim', 'Hughes', 'Van Dijk', 'Silva', 'Andersen', 'Murphy', 'Costa', 'Bauer', 'Ivanova', 'Reyes', 'Fischer', 'Clarke', 'Yilmaz', 'Mbeki', 'Laurent', 'Ortega', 'Hansen', 'Sato', 'Greene', 'Popescu', 'Ahmed', 'Keller', 'Dawson', 'Ferreira', 'Morgan', 'Varga']
export const OCCUPATIONS = ['Teacher', 'Nurse', 'Software engineer', 'Accountant', 'Architect', 'Graphic designer', 'Lawyer', 'Chef', 'Electrician', 'Librarian', 'Physiotherapist', 'Sales director', 'Journalist', 'Farmer', 'Musician', 'Pharmacist', 'Civil servant', 'Student', 'Retired', 'Bus driver', 'Midwife', 'Photographer', 'Carpenter', 'Researcher']
export const STREETS = ['Elm Street', 'Harbour Road', 'Linden Avenue', 'Mill Lane', 'Chestnut Close', 'Kingfisher Way', 'Station Road', 'Orchard Row', 'Willow Crescent', 'Market Square']
export const TOWNS = ['Springfield', 'Riverton', 'Oakham', 'Fairview', 'Lakeside', 'Brookfield']
export const PATIENT_NOTES = [
  'Prefers morning appointments.', 'Allergic to penicillin.', 'Referred by Dr. Ames (GP).', 'Vegetarian.', 'Takes levothyroxine 50 µg.',
  'Contact by email only.', 'Previous homeopathic treatment in 2019 (Sulph 30C, no clear result).', 'Coffee drinker, 3 cups daily.', '', '', '',
]
