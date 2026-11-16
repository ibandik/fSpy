import { test } from 'node:test'
import assert from 'node:assert/strict'
import MathUtil from '../src/gui/solver/math-util'
import Point2D from '../src/gui/solver/point-2d'
import { withLineCount } from '../src/gui/solver/vanishing-point-lines'
import { VanishingPointControlState } from '../src/gui/types/control-points-state'
import { solveStability } from '../src/gui/analysis/stability'
import { loadProject, solve, randomNumbers } from './support'

const vanishingPoint = { x: 2600, y: -400 }
const starts = [
  { x: 200, y: 300 }, { x: 300, y: 900 }, { x: 900, y: 1200 },
  { x: 500, y: 600 }, { x: 1200, y: 800 }, { x: 150, y: 1100 }
]

/**
 * A line segment from a point towards the vanishing point, with end points moved by random amounts
 */
function segmentTowardsVanishingPoint(from: Point2D, noise: number, gaussian: () => number): [Point2D, Point2D] {
  const direction = MathUtil.normalized(MathUtil.difference(vanishingPoint, from))
  return [
    { x: from.x + noise * gaussian(), y: from.y + noise * gaussian() },
    { x: from.x + 400 * direction.x + noise * gaussian(), y: from.y + 400 * direction.y + noise * gaussian() }
  ]
}

test('exact lines meet at the vanishing point', () => {
  const fit = MathUtil.bestIntersection(starts.slice(0, 4).map((start) => segmentTowardsVanishingPoint(start, 0, () => 0)))
  assert.ok(fit)
  assert.ok(MathUtil.distance(fit.point, vanishingPoint) < 1e-6)
  assert.ok(fit.rmsError < 1e-9)
})

test('six noisy lines find the vanishing point better than two', () => {
  const { gaussian } = randomNumbers(12345)
  // The direction of the vanishing point from the image centre is what the camera solve uses
  const directionError = (point: Point2D) => {
    return Math.atan2(point.y - 750, point.x - 1000) - Math.atan2(vanishingPoint.y - 750, vanishingPoint.x - 1000)
  }
  let squaresWithTwo = 0
  let squaresWithSix = 0
  for (let trial = 0; trial < 400; trial++) {
    const lines = starts.map((start) => segmentTowardsVanishingPoint(start, 1.5, gaussian))
    squaresWithTwo += Math.pow(directionError(MathUtil.bestIntersection(lines.slice(0, 2))!.point), 2)
    squaresWithSix += Math.pow(directionError(MathUtil.bestIntersection(lines)!.point), 2)
  }
  assert.ok(Math.sqrt(squaresWithSix) < 0.7 * Math.sqrt(squaresWithTwo))
})

test('parallel lines have no vanishing point', () => {
  const lines: [Point2D, Point2D][] = [0, 5, 9].map((y): [Point2D, Point2D] => [{ x: 0, y: y }, { x: 10, y: y }])
  assert.equal(MathUtil.bestIntersection(lines), null)
})

test('adding lines to a vanishing point control does not move the vanishing point', () => {
  const control: VanishingPointControlState = {
    lineSegments: [
      [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.28 }],
      [{ x: 0.25, y: 0.8 }, { x: 0.45, y: 0.7 }]
    ]
  }
  const before = MathUtil.bestIntersection(control.lineSegments)!.point
  const grown = withLineCount(control, 5)
  assert.equal(grown.lineSegments.length, 5)
  assert.ok(MathUtil.distance(MathUtil.bestIntersection(grown.lineSegments)!.point, before) < 1e-6)
  // All five lines are in different places
  assert.equal(new Set(grown.lineSegments.map((segment) => segment[0].x.toFixed(4) + ',' + segment[0].y.toFixed(4))).size, 5)
  // Going back to two lines keeps the first two
  assert.deepEqual(withLineCount(grown, 2).lineSegments, control.lineSegments)
})

test('stability of a two vanishing point solve', () => {
  const state = loadProject('ref_distance_in_yards.fspy')
  const controlPointsBefore = JSON.stringify(state.controlPointsStateBase)
  const stability = solveStability(state)
  assert.ok(stability)
  assert.ok(stability.fieldOfView !== null && stability.fieldOfView > 0)
  assert.ok(stability.orientation > 0)
  assert.equal(stability.principalPoint, null)
  assert.equal(stability.breaks, false)
  assert.equal(JSON.stringify(state.controlPointsStateBase), controlPointsBefore)

  // Moving one handle by 20 pixels must not change the field of view by more than the estimate allows
  const fieldOfViewBefore = solve(state).cameraParameters!.horizontalFieldOfView
  const moved = loadProject('ref_distance_in_yards.fspy')
  moved.controlPointsStateBase.firstVanishingPoint.lineSegments[0][0].y += 20 / moved.image.height!
  const fieldOfViewAfter = solve(moved).cameraParameters!.horizontalFieldOfView
  assert.ok(Math.abs(fieldOfViewAfter - fieldOfViewBefore) <= 1.2 * 20 * stability.fieldOfView)
})
