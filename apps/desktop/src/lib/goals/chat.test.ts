import { describe, expect, it } from 'vitest'
import { buildGoalCompletionChatMessage } from './chat'

describe('goal chat announcements', () => {
  it('formats a single milestone completion', () => {
    expect(
      buildGoalCompletionChatMessage([
        {
          ladderId: 'ladder-1',
          ladderTitle: 'Bits ladder',
          milestoneId: 'milestone-1',
          rewardTitle: 'Eat a bean',
          thresholdAmount: 100,
          unitLabel: 'bits',
        },
      ]),
    ).toBe('Goal unlocked: Eat a bean at 100 bits!')
  })

  it('combines multiple completions from the same event into one message', () => {
    expect(
      buildGoalCompletionChatMessage([
        {
          ladderId: 'ladder-1',
          ladderTitle: 'Bits ladder',
          milestoneId: 'milestone-1',
          rewardTitle: 'Eat a bean',
          thresholdAmount: 100,
          unitLabel: 'bits',
        },
        {
          ladderId: 'ladder-1',
          ladderTitle: 'Bits ladder',
          milestoneId: 'milestone-2',
          rewardTitle: 'Eat an egg',
          thresholdAmount: 500,
          unitLabel: 'bits',
        },
      ]),
    ).toBe('Goals unlocked: Eat a bean and Eat an egg!')
  })
})
