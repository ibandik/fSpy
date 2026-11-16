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

import Point2D from '../solver/point-2d'

/**
 * A measurement of lens distortion from points placed along
 * an edge that is straight in the scene
 */
export interface LensDistortion {
  /** The largest distance in pixels of a point from the straight line between the first and the last point */
  bow: number
  /** The distance in pixels between the first and the last point */
  length: number
  /**
   * The coefficient of a one parameter radial model that makes the points
   * lie on a straight line: undistorted = distorted * (1 + k1 * r^2), with
   * positions relative to the image centre and r the distance from the
   * centre in units of half the image diagonal. Positive for barrel
   * distortion, negative for pincushion distortion.
   */
  k1: number
  /**
   * False if the edge runs too close to the image centre to measure k1.
   * Radial distortion leaves lines through the centre straight.
   */
  isReliable: boolean
}

/**
 * The sum of squared distances of the points from the line that fits them best
 */
function straightnessError(points: Point2D[]): number {
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length
  let xx = 0
  let xy = 0
  let yy = 0
  for (const point of points) {
    xx += (point.x - meanX) * (point.x - meanX)
    xy += (point.x - meanX) * (point.y - meanY)
    yy += (point.y - meanY) * (point.y - meanY)
  }
  // The smaller eigenvalue of the scatter matrix
  return 0.5 * (xx + yy) - Math.sqrt(0.25 * (xx - yy) * (xx - yy) + xy * xy)
}

/**
 * @param guide Three or more points along the edge, in pixels
 */
export function measureLensDistortion(guide: Point2D[], imageWidth: number, imageHeight: number): LensDistortion | null {
  if (guide.length < 3) {
    return null
  }
  const first = guide[0]
  const last = guide[guide.length - 1]
  const length = Math.sqrt((last.x - first.x) * (last.x - first.x) + (last.y - first.y) * (last.y - first.y))
  if (length < 1) {
    return null
  }
  const normal = { x: -(last.y - first.y) / length, y: (last.x - first.x) / length }
  const distanceFromChord = (point: Point2D) => (point.x - first.x) * normal.x + (point.y - first.y) * normal.y
  const bow = Math.max(...guide.map((point) => Math.abs(distanceFromChord(point))))

  // Positions relative to the image centre in units of half the image diagonal
  const halfDiagonal = 0.5 * Math.sqrt(imageWidth * imageWidth + imageHeight * imageHeight)
  const centred = guide.map((point) => {
    return { x: (point.x - 0.5 * imageWidth) / halfDiagonal, y: (point.y - 0.5 * imageHeight) / halfDiagonal }
  })
  const errorFor = (k1: number) => straightnessError(centred.map((point) => {
    const scale = 1 + k1 * (point.x * point.x + point.y * point.y)
    return { x: scale * point.x, y: scale * point.y }
  }))

  // A coarse scan, then golden section refinement around the best value
  let k1 = 0
  let smallestError = Number.POSITIVE_INFINITY
  const scanStep = 0.01
  for (let candidate = -0.6; candidate <= 0.6 + 1e-9; candidate += scanStep) {
    const error = errorFor(candidate)
    if (error < smallestError) {
      smallestError = error
      k1 = candidate
    }
  }
  const goldenRatio = 0.5 * (Math.sqrt(5) - 1)
  let low = k1 - scanStep
  let high = k1 + scanStep
  for (let iteration = 0; iteration < 40; iteration++) {
    const a = high - goldenRatio * (high - low)
    const b = low + goldenRatio * (high - low)
    if (errorFor(a) < errorFor(b)) {
      high = b
    } else {
      low = a
    }
  }
  k1 = 0.5 * (low + high)

  // How far the edge is from the image centre, in half diagonals
  const centreDistance = Math.abs(distanceFromChord({ x: 0.5 * imageWidth, y: 0.5 * imageHeight })) / halfDiagonal

  return {
    bow: bow,
    length: length,
    k1: k1,
    isReliable: centreDistance > 0.2
  }
}
