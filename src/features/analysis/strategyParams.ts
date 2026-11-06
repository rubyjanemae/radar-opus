import type { StrategyId, StrategyParams } from '../../engine/model'

type Group = keyof StrategyParams

/** Parameter groups each strategy reads. */
export const STRATEGY_GROUPS: Partial<Record<StrategyId, Group[]>> = {
  'small-rubrics': ['smallRubrics'],
  'small-rubrics-cont': ['smallRubricsCont'],
  'remedy-size': ['smallRemedies'],
  'small-remedies': ['smallRubrics', 'smallRemedies'],
  prominence: ['prominence'],
  kent: ['kent'],
  polarity: ['polarity'],
  segments: ['segments'],
  composite: ['composite', 'kent', 'smallRubricsCont', 'smallRemedies'],
}

/** True when the strategy reads any of the editable parameters (the gear and the menu item show only then). */
export const hasParams = (strategy: StrategyId | null | undefined) => !!strategy && !!STRATEGY_GROUPS[strategy]?.length
