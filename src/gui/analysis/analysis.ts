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
import { SolverResult, Check } from '../solver/solver-result'
import { CalibrationMode } from '../types/global-settings'
import { PrincipalPointMode2VP } from '../types/calibration-settings'
import { VanishingPointControlState } from '../types/control-points-state'
import { defaultLensDistortionGuide } from '../defaults/control-points-state'
import Solver from '../solver/solver'
import { readPhotoMetadata, PhotoMetadata } from './exif'
import { metadataChecks, fieldOfViewCheck, opticalCentreCheck } from './photo-checks'
import { solveStability, Stability } from './stability'
import { measureLensDistortion } from './lens-distortion'

// Reading the metadata again on every solve would be wasteful
const metadataCache = new WeakMap<Uint8Array, PhotoMetadata | null>()

function photoMetadata(imageData: Uint8Array): PhotoMetadata | null {
  if (!metadataCache.has(imageData)) {
    metadataCache.set(imageData, readPhotoMetadata(imageData))
  }
  return metadataCache.get(imageData)!
}

/**
 * Formats a change of an angle, e.g ±0.5°
 */
function degrees(radians: number): string {
  const value = 180 * radians / Math.PI
  if (value > 45) {
    // Far outside the range where the estimate means anything
    return 'more than 45°'
  }
  return '±' + value.toFixed(value < 1 ? 2 : 1) + '°'
}

function pixels(value: number): string {
  return value.toFixed(value < 10 ? 1 : 0) + ' px'
}

/**
 * The vanishing point controls that the user places lines for, with their numbers
 */
function activeVanishingPointControls(state: StoreState): { vanishingPoint: number, control: VanishingPointControlState }[] {
  const controls = [{ vanishingPoint: 1, control: state.controlPointsStateBase.firstVanishingPoint }]
  if (state.globalSettings.calibrationMode == CalibrationMode.TwoVanishingPoints) {
    if (!state.calibrationSettings2VP.quadModeEnabled) {
      controls.push({ vanishingPoint: 2, control: state.controlPointsState2VP.secondVanishingPoint })
    }
    if (state.calibrationSettings2VP.principalPointMode == PrincipalPointMode2VP.FromThirdVanishingPoint) {
      controls.push({ vanishingPoint: 3, control: state.controlPointsState2VP.thirdVanishingPoint })
    }
  }
  return controls
}

/**
 * Reports how well the lines of vanishing points with more than two lines agree
 */
function lineFitChecks(state: StoreState, imageDiagonal: number): Check[] {
  const checks: Check[] = []
  for (const { vanishingPoint, control } of activeVanishingPointControls(state)) {
    const lineCount = control.lineSegments.length
    const fit = lineCount > 2 ? Solver.vanishingPointFit(state.image, control) : null
    if (fit) {
      // A thousandth of the image diagonal is about a pixel on screen
      const linesDisagree = fit.rmsError > 0.002 * imageDiagonal
      checks.push({
        level: linesDisagree ? 'warning' : 'info',
        message: linesDisagree
          ? 'The ' + lineCount + ' lines of vanishing point ' + vanishingPoint + ' miss a common point by ' + pixels(fit.rmsError) + '. Check that they all follow parallel edges.'
          : 'The ' + lineCount + ' lines of vanishing point ' + vanishingPoint + ' agree to within ' + pixels(fit.rmsError) + '.'
      })
    }
  }
  return checks
}

/**
 * Reports how much the result depends on exact handle placement
 * @param handleError A realistic placement error in image pixels
 */
function stabilityChecks(stability: Stability, handleError: number, horizontalFieldOfView: number): Check[] {
  const checks: Check[] = []
  if (stability.breaks) {
    checks.push({
      level: 'warning',
      message: 'Moving a handle by one pixel makes the solve fail. The vanishing lines are in a borderline position.'
    })
  }
  const orientation = handleError * stability.orientation
  const effects: string[] = []
  let isFragile = orientation > 2 * Math.PI / 180
  if (stability.fieldOfView !== null) {
    const fieldOfView = handleError * stability.fieldOfView
    effects.push('the field of view by ' + degrees(fieldOfView))
    isFragile = isFragile || fieldOfView > 0.05 * horizontalFieldOfView
  }
  effects.push('the camera orientation by ' + degrees(orientation))
  if (stability.principalPoint !== null) {
    effects.push('the optical centre by ±' + pixels(handleError * stability.principalPoint))
  }
  const lastEffect = effects.pop()
  checks.push({
    level: isFragile ? 'warning' : 'info',
    message: 'Handles that are each off by ' + handleError + ' px change ' +
      (effects.length > 0 ? effects.join(', ') + ' and ' : '') + lastEffect + '.' +
      (isFragile ? ' The result is fragile: use longer lines, or lines that are further apart.' : '')
  })
  return checks
}

function lensDistortionChecks(state: StoreState, imageWidth: number, imageHeight: number): Check[] {
  if (!state.globalSettings.lensDistortionGuideEnabled) {
    return []
  }
  const guide = (state.controlPointsStateBase.lensDistortionGuide || defaultLensDistortionGuide).map((point) => {
    return { x: point.x * imageWidth, y: point.y * imageHeight }
  })
  const distortion = measureLensDistortion(guide, imageWidth, imageHeight)
  if (!distortion) {
    return []
  }
  const size = pixels(distortion.bow) + ' over ' + distortion.length.toFixed(0) + ' px'
  if (distortion.bow < 0.001 * distortion.length) {
    return [{
      level: 'info',
      message: 'The traced edge is straight to within ' + size + ', so there is no lens distortion to speak of along it.'
    }]
  }
  if (!distortion.isReliable) {
    return [{
      level: 'warning',
      message: 'The traced edge bows by ' + size + ', but it runs too close to the image centre to measure the lens. Trace an edge near the border.'
    }]
  }
  return [{
    level: 'warning',
    message: 'The traced edge bows by ' + size + ': ' + (distortion.k1 > 0 ? 'barrel' : 'pincushion') + ' distortion, k1 ≈ ' + distortion.k1.toFixed(3) +
      '. Lines near the border bend with it, so undistort the image first for an accurate match. ' +
      '(Undistorted = distorted × (1 + k1 r²) about the image centre, r in half diagonals.)'
  }]
}

/**
 * Looks at the image and the solver result for things the user should know
 * about: how far the result can be trusted, and signs that the photo is
 * cropped, edited or distorted.
 */
export function analyse(state: StoreState, result: SolverResult): Check[] {
  const image = state.image
  if (image.data === null || image.width === null || image.height === null) {
    return []
  }
  const is1VPMode = state.globalSettings.calibrationMode == CalibrationMode.OneVanishingPoint
  const cameraParameters = result.cameraParameters
  const metadata = photoMetadata(image.data)
  const imageDiagonal = Math.sqrt(image.width * image.width + image.height * image.height)
  const checks: Check[] = []

  // How far the result can be trusted
  let stability: Stability | null = null
  // A thousandth of the long side of the image is about a pixel on screen
  const handleError = Math.max(1, Math.round(Math.max(image.width, image.height) / 1000))
  if (cameraParameters) {
    checks.push(...lineFitChecks(state, imageDiagonal))
    stability = solveStability(state)
    if (stability) {
      checks.push(...stabilityChecks(stability, handleError, cameraParameters.horizontalFieldOfView))
    }
  }

  // Signs of a cropped or edited photo
  checks.push(...metadataChecks(metadata, image.width, image.height))
  if (cameraParameters) {
    checks.push(...fieldOfViewCheck(metadata, cameraParameters, !is1VPMode))
    if (stability && stability.principalPoint !== null) {
      checks.push(...opticalCentreCheck(cameraParameters, handleError * stability.principalPoint))
    }
  }

  checks.push(...lensDistortionChecks(state, image.width, image.height))
  return checks
}
