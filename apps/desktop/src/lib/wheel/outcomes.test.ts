import { describe, expect, it, vi } from 'vitest'
import {
  buildWheelSpinSummary,
  clampWheelTextScale,
  createDefaultWheelSegments,
  getEligibleWheelSegmentsForGiftCount,
  pickWheelSegment,
} from './outcomes'

describe('pickWheelSegment', () => {
  it('falls back to the first segment when all weights are invalid', () => {
    const [first, ...rest] = createDefaultWheelSegments()
    const picked = pickWheelSegment([
      { ...first, chance: '0%' },
      ...rest.map((segment) => ({ ...segment, chance: '-5%' })),
    ])

    expect(picked?.id).toBe(first.id)
  })

  it('uses weighted selection when valid weights exist', () => {
    const segments = [
      { ...createDefaultWheelSegments()[0], id: 'a', chance: '1%' },
      { ...createDefaultWheelSegments()[1], id: 'b', chance: '99%' },
    ]
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)

    expect(pickWheelSegment(segments)?.id).toBe('b')

    randomSpy.mockRestore()
  })
})

describe('wheel helpers', () => {
  it('filters wheel segments by minSubs threshold', () => {
    const segments = [
      { ...createDefaultWheelSegments()[0], id: 'a', minSubs: 5 },
      { ...createDefaultWheelSegments()[1], id: 'b', minSubs: 10 },
    ]

    expect(getEligibleWheelSegmentsForGiftCount(segments, 5).map((segment) => segment.id)).toEqual(['a'])
    expect(getEligibleWheelSegmentsForGiftCount(segments, 12).map((segment) => segment.id)).toEqual(['a', 'b'])
  })

  it('clamps wheel text scale into the supported range', () => {
    expect(clampWheelTextScale(0.1)).toBe(0.35)
    expect(clampWheelTextScale(2)).toBe(0.75)
  })

  it('builds moderation summaries for timeout outcomes', () => {
    const timeoutSegment = createDefaultWheelSegments().find((segment) => segment.outcomeType === 'timeout')

    expect(buildWheelSpinSummary(timeoutSegment!)).toContain('requires moderation flow')
  })
})
