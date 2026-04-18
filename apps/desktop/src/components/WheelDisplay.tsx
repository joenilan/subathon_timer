import { useEffect, useMemo, useRef, useState } from 'react'
import type { WheelSegment, WheelSpinState } from '../lib/wheel/types'

interface WheelDisplayProps {
  segments: WheelSegment[]
  spin: WheelSpinState
  textScale: number
}

const fallbackPalette = [
  '#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626',
  '#0891b2', '#7c3aed', '#db2777', '#65a30d', '#ea580c',
]

const VIEWBOX_SIZE = 100
const CENTER = VIEWBOX_SIZE / 2
const RADIUS = 46
const SPIN_TURNS = 6 * 360
const SPIN_DURATION_MS = 1800
const LABEL_INNER_RADIUS = 14
const LABEL_OUTER_PADDING = 4

function normalizeDegrees(value: number) {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function polarToCartesian(radius: number, angleDegrees: number) {
  const radians = ((angleDegrees - 90) * Math.PI) / 180
  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  }
}

function describeSlicePath(startAngle: number, endAngle: number) {
  const start = polarToCartesian(RADIUS, startAngle)
  const end = polarToCartesian(RADIUS, endAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0

  return [
    `M ${CENTER} ${CENTER}`,
    `L ${start.x} ${start.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ')
}

function getLuminance(hex: string): number {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255
  const toLinear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function getContrastColor(hex: string): string {
  try {
    return getLuminance(hex) > 0.35 ? '#111114' : '#f4f4f5'
  } catch {
    return '#111114'
  }
}

function formatCompactDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '+'
  let remaining = Math.abs(Math.round(totalSeconds))

  if (remaining === 0) {
    return `${sign}0s`
  }

  const hours = Math.floor(remaining / 3600)
  remaining -= hours * 3600
  const minutes = Math.floor(remaining / 60)
  remaining -= minutes * 60

  if (hours > 0 && remaining === 0) {
    return minutes > 0 ? `${sign}${hours}h${minutes}m` : `${sign}${hours}h`
  }

  if (minutes > 0 && remaining === 0) {
    return `${sign}${minutes}m`
  }

  if (hours > 0 || minutes > 0) {
    const hourPart = hours > 0 ? `${hours}h` : ''
    const minutePart = minutes > 0 ? `${minutes}m` : ''
    const secondPart = remaining > 0 ? `${remaining}s` : ''
    return `${sign}${hourPart}${minutePart}${secondPart}`
  }

  return `${sign}${remaining}s`
}

function toWheelLabel(label: string): string {
  let normalized = label
    .replace(/minutes?/gi, 'min')
    .replace(/hours?/gi, 'hr')
    .replace(/seconds?/gi, 'sec')
    .replace(/timeout/gi, 'TO')
    .replace(/random/gi, 'Rand')
    .replace(/chatter/gi, 'Chat')
    .replace(/subscriber/gi, 'Sub')
    .replace(/subscription/gi, 'Sub')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized.length > 14) {
    normalized = `${normalized.slice(0, 11).trimEnd()}...`
  }

  return normalized
}

function toWheelDisplayLabel(segment: WheelSegment): string {
  if (segment.outcomeType === 'time' && typeof segment.timeDeltaSeconds === 'number') {
    return formatCompactDuration(segment.timeDeltaSeconds)
  }

  if (segment.outcomeType === 'timeout') {
    return segment.timeoutTarget === 'random' ? 'Rand TO' : 'Self TO'
  }

  return toWheelLabel(segment.label)
}

function splitWheelLabel(label: string): string[] {
  if (label.length <= 8) {
    return [label]
  }

  const words = label.split(' ').filter(Boolean)
  if (words.length <= 1) {
    if (label.length <= 12) {
      return [label]
    }
    const midpoint = Math.ceil(label.length / 2)
    return [label.slice(0, midpoint), label.slice(midpoint)]
  }

  let bestLines = [label]
  let bestScore = Number.POSITIVE_INFINITY

  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(' ')
    const right = words.slice(index).join(' ')
    const longest = Math.max(left.length, right.length)
    const imbalance = Math.abs(left.length - right.length)
    const score = longest * 10 + imbalance

    if (score < bestScore) {
      bestLines = [left, right]
      bestScore = score
    }
  }

  return bestLines
}

function estimateLineUnits(line: string) {
  let units = 0

  for (const character of line) {
    if (character === ' ') {
      units += 0.34
    } else if ('mwMW@#%&'.includes(character)) {
      units += 0.9
    } else if ('ilI1|'.includes(character)) {
      units += 0.38
    } else if ('ftrj'.includes(character)) {
      units += 0.48
    } else if ('+-/'.includes(character)) {
      units += 0.58
    } else if (/[A-Z]/.test(character)) {
      units += 0.72
    } else if (/[0-9]/.test(character)) {
      units += 0.62
    } else {
      units += 0.62
    }
  }

  return Math.max(units, 1)
}

function buildLabelLineCandidates(label: string) {
  const candidates = [[label]]
  const words = label.split(' ').filter(Boolean)
  const split = words.length === 2 ? words : splitWheelLabel(label)

  if (split.length > 1) {
    candidates.push(split)
  }

  if (split.length === 2) {
    const [left, right] = split

    if (left.length > 4 && right.length > 4) {
      candidates.push([left.slice(0, Math.ceil(left.length / 2)), left.slice(Math.ceil(left.length / 2)), right])
      candidates.push([left, right.slice(0, Math.ceil(right.length / 2)), right.slice(Math.ceil(right.length / 2))])
    }
  }

  return candidates
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getBaseLabelRadius(sliceAngleDeg: number) {
  if (sliceAngleDeg <= 36) {
    return 27
  }

  if (sliceAngleDeg <= 45) {
    return 29
  }

  if (sliceAngleDeg <= 60) {
    return 31
  }

  return 33
}

function getLabelDescriptor(segment: WheelSegment, sliceAngleDeg: number, textScale: number) {
  const label = toWheelDisplayLabel(segment)
  const sliceRadians = (sliceAngleDeg * Math.PI) / 180
  const radius = getBaseLabelRadius(sliceAngleDeg)
  const tangentialWidth = Math.max(14, 2 * radius * Math.tan(sliceRadians / 2) - 2.5)
  const radialBand = Math.max(12, RADIUS - LABEL_OUTER_PADDING - LABEL_INNER_RADIUS)
  const maxFontSize = sliceAngleDeg <= 36 ? 6.1 : sliceAngleDeg <= 45 ? 6.7 : sliceAngleDeg <= 60 ? 7.2 : 7.8
  const minFontSize = 2.5

  const descriptor = buildLabelLineCandidates(label)
    .map((lines) => {
      const longestLineUnits = lines.reduce((longest, line) => Math.max(longest, estimateLineUnits(line)), 0)
      const widthBound = tangentialWidth / longestLineUnits
      const heightBound = radialBand / (lines.length * 1.08)
      const rawFontSize = Math.min(widthBound, heightBound, maxFontSize) * textScale
      const fontSize = clamp(rawFontSize, minFontSize, maxFontSize)
      const score = rawFontSize - (lines.length - 1) * 0.16

      return {
        fontSize,
        lines,
        radius,
        score,
      }
    })
    .sort((left, right) => right.score - left.score)[0]

  return descriptor
}

export function WheelDisplay({ segments, spin, textScale }: WheelDisplayProps) {
  const lastSpinKeyRef = useRef<string | null>(null)
  const rotationRef = useRef(0)
  const [rotationDegrees, setRotationDegrees] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)

  const segmentAngles = useMemo(() => {
    const weights = segments.map((s) => Math.max(Number.parseFloat(s.chance), 0))
    const totalWeight = weights.reduce((sum, w) => sum + w, 0)
    const fallbackAngle = segments.length > 0 ? 360 / segments.length : 360

    let cursor = 0
    return weights.map((weight) => {
      const sliceAngle = totalWeight > 0 ? (weight / totalWeight) * 360 : fallbackAngle
      const startAngle = cursor
      const endAngle = cursor + sliceAngle
      cursor = endAngle
      return { startAngle, endAngle, centerAngle: startAngle + sliceAngle / 2, sliceAngle }
    })
  }, [segments])

  const segmentDescriptors = useMemo(
    () =>
      segments.map((segment, index) => {
        const { startAngle, endAngle, centerAngle, sliceAngle } = segmentAngles[index]
        const background = segment.color ?? fallbackPalette[index % fallbackPalette.length]
        const label = getLabelDescriptor(segment, sliceAngle, textScale)

        return {
          background,
          centerAngle,
          key: segment.id,
          labelColor: getContrastColor(background),
          labelFontSize: label.fontSize,
          labelLines: label.lines,
          labelRadius: label.radius,
          path: describeSlicePath(startAngle, endAngle),
        }
      }),
    [segments, segmentAngles, textScale],
  )

  useEffect(() => {
    if (spin.status !== 'spinning' || !spin.activeSegmentId || segments.length === 0) {
      return
    }

    const spinKey = `${spin.status}:${spin.activeSegmentId}`
    if (lastSpinKeyRef.current === spinKey) {
      return
    }

    const index = segments.findIndex((segment) => segment.id === spin.activeSegmentId)
    if (index < 0) {
      return
    }

    lastSpinKeyRef.current = spinKey

    const centerAngle = segmentAngles[index]?.centerAngle ?? 0
    const currentRotation = normalizeDegrees(rotationRef.current)
    const targetRotation = normalizeDegrees(360 - centerAngle)
    let delta = targetRotation - currentRotation
    while (delta <= 0) {
      delta += 360
    }

    const nextRotation = rotationRef.current + SPIN_TURNS + delta
    rotationRef.current = nextRotation
    setIsSpinning(true)
    window.requestAnimationFrame(() => {
      setRotationDegrees(nextRotation)
    })
  }, [segments, segmentAngles, spin.activeSegmentId, spin.status])

  useEffect(() => {
    if (spin.status !== 'spinning') {
      lastSpinKeyRef.current = null
    }
  }, [spin.status])

  useEffect(() => {
    if (spin.status !== 'spinning') {
      const timeout = window.setTimeout(() => {
        setIsSpinning(false)
      }, 50)
      return () => window.clearTimeout(timeout)
    }

    const timeout = window.setTimeout(() => {
      setIsSpinning(false)
    }, SPIN_DURATION_MS)

    return () => window.clearTimeout(timeout)
  }, [spin.status])

  return (
    <div className="wheel-display">
      <div className="wheel-stage">
        <div className="wheel-stage__halo" aria-hidden="true" />
        <div className="wheel-pointer" aria-hidden="true" />
        <div className="wheel-canvas">
          <svg
            aria-label={`An image of a spinning prize wheel. The wheel has ${segments.length} slices.`}
            className="wheel-svg"
            role="img"
            viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          >
            <g
              className={`wheel-rotor${isSpinning ? ' is-spinning' : ''}`}
              style={{
                transform: `rotate(${rotationDegrees}deg)`,
                transformOrigin: '50% 50%',
                transition: isSpinning ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.8, 0.12, 1)` : 'none',
              }}
            >
              {segmentDescriptors.map((descriptor) => (
                <path
                  key={descriptor.key}
                  d={descriptor.path}
                  fill={descriptor.background}
                  stroke="rgba(0,0,0,0.28)"
                  strokeWidth={0.35}
                />
              ))}

              {segmentDescriptors.map((descriptor) => {
                const lineHeight = descriptor.labelFontSize * 0.88
                const totalHeight = descriptor.labelLines.length > 1 ? lineHeight * (descriptor.labelLines.length - 1) : 0
                const isLeftSide = descriptor.centerAngle > 90 && descriptor.centerAngle < 270
                const tangentRotation = isLeftSide ? 270 : 90

                return (
                  <g
                    key={`${descriptor.key}-label`}
                    transform={`translate(${CENTER} ${CENTER}) rotate(${descriptor.centerAngle}) translate(0 ${-descriptor.labelRadius}) rotate(${tangentRotation})`}
                  >
                    <text
                      className="wheel-svg__label"
                      dominantBaseline="middle"
                      fill={descriptor.labelColor}
                      fontSize={descriptor.labelFontSize}
                      stroke="rgba(12, 14, 22, 0.12)"
                      strokeWidth={0.18}
                      textAnchor="middle"
                    >
                      {descriptor.labelLines.map((line, lineIndex) => (
                        <tspan
                          key={`${descriptor.key}-line-${lineIndex}`}
                          x="0"
                          y={descriptor.labelLines.length === 1 ? 0 : lineIndex * lineHeight - totalHeight / 2}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}
