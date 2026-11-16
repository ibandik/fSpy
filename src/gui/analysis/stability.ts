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

import { StoreState } from '../types/store-state'
import { SolverResult } from '../solver/solver-result'
import { CalibrationMode } from '../types/global-settings'
import { PrincipalPointMode2VP } from '../types/calibration-settings'
import { ControlPointState, ControlPointsStateBase, ControlPointsState1VP, ControlPointsState2VP } from '../types/control-points-state'
import Solver from '../solver/solver'
import Transform from '../solver/transform'
import CoordinatesUtil, { ImageCoordinateFrame } from '../solver/coordinates-util'

/**
 * How much the result moves when the control points that define the
 * vanishing points are each off by one pixel. The errors of the individual
 * control point coordinates are taken to be independent and are combined
 * as a root sum of squares.
 */
export interface Stability {
  /** Change of the horizontal field of view in radians. Null if the field of view is not solved for. */
  fieldOfView: number | null
  /** Change of the camera orientation in radians */
  orientation: number
  /** Change of the principal point in pixels. Null if the principal point is not solved for. */
  principalPoint: number | null
  /** True if moving some control point by one pixel makes the solver fail */
  breaks: boolean
}

interface ControlPoints {
  base: ControlPointsStateBase
  oneVP: ControlPointsState1VP
  twoVP: ControlPointsState2VP
}

function solve(state: StoreState, controlPoints: ControlPoints): SolverResult {
  if (state.globalSettings.calibrationMode == CalibrationMode.OneVanishingPoint) {
    return Solver.solve1VP(
      state.calibrationSettingsBase,
      state.calibrationSettings1VP,
      controlPoints.base,
      controlPoints.oneVP,
      state.image
    )
  }
  return Solver.solve2VP(
    state.calibrationSettingsBase,
    state.calibrationSettings2VP,
    controlPoints.base,
    controlPoints.twoVP,
    state.image
  )
}

/**
 * The control points that the camera orientation and field of view depend on
 */
function vanishingPointControlPoints(state: StoreState, controlPoints: ControlPoints): ControlPointState[] {
  const points: ControlPointState[] = []
  const addLineSegments = (lineSegments: ControlPointState[][]) => {
    lineSegments.forEach((segment) => points.push(segment[0], segment[1]))
  }
  addLineSegments(controlPoints.base.firstVanishingPoint.lineSegments)
  if (state.globalSettings.calibrationMode == CalibrationMode.OneVanishingPoint) {
    points.push(controlPoints.oneVP.horizon[0], controlPoints.oneVP.horizon[1])
  } else {
    if (!state.calibrationSettings2VP.quadModeEnabled) {
      addLineSegments(controlPoints.twoVP.secondVanishingPoint.lineSegments)
    }
    if (state.calibrationSettings2VP.principalPointMode == PrincipalPointMode2VP.FromThirdVanishingPoint) {
      addLineSegments(controlPoints.twoVP.thirdVanishingPoint.lineSegments)
    }
  }
  return points
}

/**
 * The angle in radians of the rotation that takes one camera orientation to another
 */
function rotationAngle(a: Transform, b: Transform): number {
  // The trace of the product of one rotation and the inverse of the other
  let trace = 0
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      trace += a.matrix[row][column] * b.matrix[row][column]
    }
  }
  return Math.acos(Math.min(1, Math.max(-1, 0.5 * (trace - 1))))
}

/**
 * Computes how sensitive the current result is to the placement of the control points
 * @returns null if there is no result
 */
export function solveStability(state: StoreState): Stability | null {
  const imageWidth = state.image.width
  const imageHeight = state.image.height
  if (imageWidth === null || imageHeight === null) {
    return null
  }
  // Work on a copy. The control points are moved in place below.
  const controlPoints: ControlPoints = JSON.parse(JSON.stringify({
    base: state.controlPointsStateBase,
    oneVP: state.controlPointsState1VP,
    twoVP: state.controlPointsState2VP
  }))
  if (!solve(state, controlPoints).cameraParameters) {
    return null
  }

  const is2VPMode = state.globalSettings.calibrationMode == CalibrationMode.TwoVanishingPoints
  const principalPointIsSolved = is2VPMode &&
    state.calibrationSettings2VP.principalPointMode == PrincipalPointMode2VP.FromThirdVanishingPoint
  const pixelSize = { x: 1 / imageWidth, y: 1 / imageHeight }
  const toPixels = (principalPoint: { x: number, y: number }) => CoordinatesUtil.convert(
    principalPoint, ImageCoordinateFrame.ImagePlane, ImageCoordinateFrame.Absolute, imageWidth, imageHeight
  )

  let fieldOfViewSquares = 0
  let orientationSquares = 0
  let principalPointSquares = 0
  let breaks = false
  for (const point of vanishingPointControlPoints(state, controlPoints)) {
    for (const axis of ['x', 'y'] as ('x' | 'y')[]) {
      // Half the difference between the results one pixel to either side
      const position = point[axis]
      point[axis] = position + pixelSize[axis]
      const ahead = solve(state, controlPoints).cameraParameters
      point[axis] = position - pixelSize[axis]
      const behind = solve(state, controlPoints).cameraParameters
      point[axis] = position
      if (!ahead || !behind) {
        breaks = true
        continue
      }
      const fieldOfView = 0.5 * (ahead.horizontalFieldOfView - behind.horizontalFieldOfView)
      const orientation = 0.5 * rotationAngle(ahead.cameraTransform, behind.cameraTransform)
      const principalPointAhead = toPixels(ahead.principalPoint)
      const principalPointBehind = toPixels(behind.principalPoint)
      const principalPointX = 0.5 * (principalPointAhead.x - principalPointBehind.x)
      const principalPointY = 0.5 * (principalPointAhead.y - principalPointBehind.y)

      fieldOfViewSquares += fieldOfView * fieldOfView
      orientationSquares += orientation * orientation
      principalPointSquares += principalPointX * principalPointX + principalPointY * principalPointY
    }
  }

  return {
    fieldOfView: is2VPMode ? Math.sqrt(fieldOfViewSquares) : null,
    orientation: Math.sqrt(orientationSquares),
    principalPoint: principalPointIsSolved ? Math.sqrt(principalPointSquares) : null,
    breaks: breaks
  }
}
