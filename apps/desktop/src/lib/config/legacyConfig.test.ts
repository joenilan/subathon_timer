import { describe, expect, it } from 'vitest'
import { importLegacyConfig } from './legacyConfig'

describe('importLegacyConfig', () => {
  it('imports timer rules and wheel segments while ignoring legacy-only fields', () => {
    const result = importLegacyConfig(JSON.stringify({
      channel: 'old_channel',
      admins: ['mod1'],
      time: {
        base_value: 90,
        multipliers: {
          tier_1: 1,
          tier_2: 2,
          tier_3: 3,
          bits: 0.5,
          follow: 0.25,
        },
      },
      wheel: [
        {
          type: 'time',
          value: 120,
          chance: 0.25,
          text: 'Big Time',
          min_subs: 5,
          color: '#123456',
        },
        {
          type: 'timeout',
          value: 300,
          chance: 0.1,
          text: 'Timeout',
          target: 'random',
        },
      ],
    }))

    expect(result.rules.baseValueSeconds).toBe(90)
    expect(result.rules.bitsUnitSeconds).toBe(45)
    expect(result.rules.followSeconds).toBe(23)
    expect(result.wheelSegments).toHaveLength(2)
    expect(result.wheelSegments[0].timeDeltaSeconds).toBe(120)
    expect(result.wheelSegments[1].timeoutTarget).toBe('random')
  })
})
