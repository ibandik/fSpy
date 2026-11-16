/**
 * fSpy
 * Copyright (c) 2020 - Per Gantelius
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { VanishingPointControlState, ControlPointPairState } from '../types/control-points-state'
import MathUtil from './math-util'
import Point2D from './point-2d'

export const MIN_VANISHING_POINT_LINE_COUNT = 2
export const MAX_VANISHING_POINT_LINE_COUNT = 6

function clampToImage(point: Point2D): Point2D {
  return {
    x: Math.min(0.98, Math.max(0.02, point.x)),
    y: Math.min(0.98, Math.max(0.02, point.y))
  }
}

/**
 * Makes a line segment to add to a vanishing point control. It points at
 * the current vanishing point, so that adding it does not change the result,
 * and lies in the widest gap between the lines that are there.
 */
function newLineSegment(lineSegments: ControlPointPairState[]): ControlPointPairState {
  const midpoints = lineSegments.map((segment) => MathUtil.lineSegmentMidpoint(segment))
  const meanLength = lineSegments.reduce((sum, segment) => sum + MathUtil.distance(segment[0], segment[1]), 0) / lineSegments.length
  const fit = MathUtil.bestIntersection(lineSegments)

  if (!fit) {
    // Parallel lines. Put a parallel line between the first two
    const direction = MathUtil.normalized(MathUtil.difference(lineSegments[0][1], lineSegments[0][0]))
    const middle = MathUtil.lineSegmentMidpoint([midpoints[0], midpoints[1]])
    return [
      clampToImage({ x: middle.x - 0.5 * meanLength * direction.x, y: middle.y - 0.5 * meanLength * direction.y }),
      clampToImage({ x: middle.x + 0.5 * meanLength * direction.x, y: middle.y + 0.5 * meanLength * direction.y })
    ]
  }

  // The directions of the lines as seen from the vanishing point, in order
  const vanishingPoint = fit.point
  const rays = midpoints.map((midpoint) => {
    const offset = MathUtil.difference(midpoint, vanishingPoint)
    return { angle: Math.atan2(offset.y, offset.x), distance: Math.sqrt(MathUtil.dot(offset, offset)) }
  }).sort((a, b) => a.angle - b.angle)

  // Aim down the middle of the widest gap between neighbouring lines
  let angle = 0
  let widestGap = -1
  for (let i = 0; i + 1 < rays.length; i++) {
    const gap = rays[i + 1].angle - rays[i].angle
    // Lines on opposite sides of the vanishing point are not neighbours
    if (gap < Math.PI && gap > widestGap) {
      widestGap = gap
      angle = 0.5 * (rays[i].angle + rays[i + 1].angle)
    }
  }
  if (widestGap < 0) {
    angle = rays[0].angle + 0.05
  }

  const distance = rays.reduce((sum, ray) => sum + ray.distance, 0) / rays.length
  const direction = { x: Math.cos(angle), y: Math.sin(angle) }
  return [
    clampToImage({
      x: vanishingPoint.x + (distance - 0.5 * meanLength) * direction.x,
      y: vanishingPoint.y + (distance - 0.5 * meanLength) * direction.y
    }),
    clampToImage({
      x: vanishingPoint.x + (distance + 0.5 * meanLength) * direction.x,
      y: vanishingPoint.y + (distance + 0.5 * meanLength) * direction.y
    })
  ]
}

/**
 * Returns a vanishing point control with one line segment replaced
 */
export function withLineSegment(
  controlState: VanishingPointControlState,
  lineSegmentIndex: number,
  lineSegment: ControlPointPairState
): VanishingPointControlState {
  const lineSegments = [...controlState.lineSegments]
  lineSegments[lineSegmentIndex] = lineSegment
  return { ...controlState, lineSegments: lineSegments }
}

/**
 * Returns a vanishing point control with the given number of
 * line segments, by removing the last ones or adding new ones.
 */
export function withLineCount(
  controlState: VanishingPointControlState,
  lineCount: number
): VanishingPointControlState {
  lineCount = Math.min(MAX_VANISHING_POINT_LINE_COUNT, Math.max(MIN_VANISHING_POINT_LINE_COUNT, lineCount))
  let lineSegments = controlState.lineSegments.slice(0, lineCount)
  while (lineSegments.length < lineCount) {
    lineSegments = [...lineSegments, newLineSegment(lineSegments)]
  }
  return { ...controlState, lineSegments: lineSegments }
}
