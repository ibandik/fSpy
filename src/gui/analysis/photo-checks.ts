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

import { PhotoMetadata } from './exif'
import { CameraParameters, Check } from '../solver/solver-result'
import CoordinatesUtil, { ImageCoordinateFrame } from '../solver/coordinates-util'

// Programs that edit images, as opposed to camera firmware
const EDITING_SOFTWARE = /photoshop|lightroom|gimp|affinity|capture one|snapseed|pixelmator|darktable|luminar|paint|acdsee|picasa|photoscape|rawtherapee|dxo|on1|skylum|canva|figma|imagemagick|irfanview|faststone|preview|vsco|picsart/i

// Proportions that cameras and phones produce, long side over short side
const CAMERA_ASPECT_RATIOS = [1, 5 / 4, 4 / 3, 3 / 2, 16 / 9, 2]

// Half the diagonal of a 36 x 24 mm frame
const HALF_DIAGONAL_35MM = 21.633

// How far the field of view may be from the metadata before it is reported
const FIELD_OF_VIEW_TOLERANCE = 0.15

// How far the optical centre may be from the image centre before it
// is reported, as a fraction of half the image diagonal
const OFF_CENTRE_TOLERANCE = 0.1

function percent(fraction: number): string {
  return (100 * fraction).toFixed(0) + ' %'
}

function degrees(radians: number): string {
  return (180 * radians / Math.PI).toFixed(0) + '°'
}

/**
 * Checks based on the camera metadata of the image alone
 */
export function metadataChecks(
  metadata: PhotoMetadata | null,
  imageWidth: number,
  imageHeight: number
): Check[] {
  const checks: Check[] = []

  // Many cameras repeat the make in the model name
  let camera = metadata !== null && metadata.model !== null ? metadata.model : ''
  if (metadata !== null && metadata.make !== null && camera.toLowerCase().indexOf(metadata.make.toLowerCase()) < 0) {
    camera = (metadata.make + ' ' + camera).trim()
  }
  let lens = ''
  if (metadata !== null && metadata.focalLength !== null) {
    lens = parseFloat(metadata.focalLength.toFixed(2)) + ' mm lens'
    if (metadata.focalLength35mm !== null) {
      lens += ' (' + metadata.focalLength35mm + ' mm equivalent)'
    }
  } else if (metadata !== null && metadata.focalLength35mm !== null) {
    lens = metadata.focalLength35mm + ' mm equivalent lens'
  }
  let sensor = ''
  if (metadata !== null && metadata.sensorWidth !== null && metadata.sensorHeight !== null) {
    sensor = metadata.sensorWidth.toFixed(1) + ' × ' + metadata.sensorHeight.toFixed(1) + ' mm sensor'
  }
  const description = [camera, lens, sensor].filter((part) => part.length > 0)

  if (description.length > 0) {
    checks.push({
      level: 'info',
      message: 'Metadata: ' + description.join(', ') + '.'
    })
  } else {
    checks.push({
      level: 'info',
      message: 'No camera or lens in the metadata, as in screenshots, downloads and many edited exports. A crop cannot be found from metadata.'
    })
    const aspectRatio = Math.max(imageWidth, imageHeight) / Math.min(imageWidth, imageHeight)
    const isCameraAspectRatio = CAMERA_ASPECT_RATIOS.some((ratio) => Math.abs(aspectRatio / ratio - 1) < 0.015)
    if (!isCameraAspectRatio) {
      checks.push({
        level: 'warning',
        message: 'The proportions ' + imageWidth + ' × ' + imageHeight + ' are not ones cameras produce, so the image is probably cropped.'
      })
    }
  }
  if (metadata === null) {
    return checks
  }

  if (metadata.software !== null && EDITING_SOFTWARE.test(metadata.software)) {
    checks.push({
      level: 'warning',
      message: 'Saved by ' + metadata.software + ', so it may have been cropped or retouched.'
    })
  }

  if (metadata.pixelWidth !== null && metadata.pixelHeight !== null) {
    // The recorded size may be for the unrotated frame
    const sameOrientation = (metadata.pixelWidth >= metadata.pixelHeight) == (imageWidth >= imageHeight)
    const recordedWidth = sameOrientation ? metadata.pixelWidth : metadata.pixelHeight
    const recordedHeight = sameOrientation ? metadata.pixelHeight : metadata.pixelWidth
    if (recordedWidth != imageWidth || recordedHeight != imageHeight) {
      const recordedSize = recordedWidth + ' × ' + recordedHeight + ' px'
      const aspectRatioChange = (imageWidth / imageHeight) / (recordedWidth / recordedHeight)
      if (Math.abs(aspectRatioChange - 1) > 0.01) {
        checks.push({
          level: 'warning',
          message: 'Cropped: the camera recorded ' + recordedSize + ', and the image is ' + imageWidth + ' × ' + imageHeight + ' px with other proportions.'
        })
      } else {
        checks.push({
          level: 'info',
          message: 'Resized from ' + recordedSize + '. The proportions are the same, so this alone is no sign of a crop.'
        })
      }
    }
  }

  if (metadata.digitalZoomRatio !== null && metadata.digitalZoomRatio > 1.01) {
    checks.push({
      level: 'warning',
      message: 'Digital zoom × ' + parseFloat(metadata.digitalZoomRatio.toFixed(2)) + ' was used, so the frame is a crop of the sensor.'
    })
  }

  return checks
}

/**
 * Compares the field of view of the camera to the lens recorded in the metadata.
 * @param focalLengthIsSolved true if the focal length was computed from
 * vanishing points, false if the user entered it
 */
export function fieldOfViewCheck(
  metadata: PhotoMetadata | null,
  cameraParameters: CameraParameters,
  focalLengthIsSolved: boolean
): Check[] {
  if (metadata === null) {
    return []
  }
  // Half the image diagonal in image plane coordinates, where the long
  // side of the image spans -1 to 1, see ImageCoordinateFrame.ImagePlane
  const aspectRatio = cameraParameters.imageWidth / cameraParameters.imageHeight
  const halfDiagonal = aspectRatio <= 1 ? Math.sqrt(1 + aspectRatio * aspectRatio) : Math.sqrt(1 + 1 / (aspectRatio * aspectRatio))

  // The relative focal length the full frame would have with the recorded lens
  let expectedFocalLength = 0
  let lens = ''
  if (metadata.focalLength !== null && metadata.sensorWidth !== null && metadata.sensorHeight !== null) {
    expectedFocalLength = metadata.focalLength / (0.5 * Math.max(metadata.sensorWidth, metadata.sensorHeight))
    lens = 'the ' + parseFloat(metadata.focalLength.toFixed(2)) + ' mm lens and sensor in the metadata'
  } else if (metadata.focalLength35mm !== null) {
    expectedFocalLength = halfDiagonal * metadata.focalLength35mm / HALF_DIAGONAL_35MM
    lens = 'the ' + metadata.focalLength35mm + ' mm equivalent lens in the metadata'
  } else {
    return []
  }
  const ratio = cameraParameters.relativeFocalLength / expectedFocalLength
  const fieldOfView = degrees(2 * Math.atan(halfDiagonal / cameraParameters.relativeFocalLength))
  const expectedFieldOfView = degrees(2 * Math.atan(halfDiagonal / expectedFocalLength))
  const source = focalLengthIsSolved ? 'solved' : 'entered'
  const comparison = fieldOfView + ' against ' + expectedFieldOfView + ' across the diagonal'

  if (ratio > 1 + FIELD_OF_VIEW_TOLERANCE) {
    return [{
      level: 'warning',
      message: 'The ' + source + ' field of view is narrower than ' + lens + ': ' + comparison + '. ' +
        (focalLengthIsSolved
          ? 'The image looks cropped to about ' + percent(1 / ratio) + ' of the frame, or the vanishing lines are off.'
          : 'Check the focal length and sensor size, or the image is cropped to about ' + percent(1 / ratio) + ' of the frame.')
    }]
  } else if (ratio < 1 - FIELD_OF_VIEW_TOLERANCE) {
    return [{
      level: 'warning',
      message: 'The ' + source + ' field of view is wider than ' + lens + ': ' + comparison + '. ' +
        'A crop cannot widen the view, so check the ' + (focalLengthIsSolved ? 'vanishing lines.' : 'focal length and sensor size.')
    }]
  }
  return [{
    level: 'info',
    message: 'The ' + source + ' field of view agrees with ' + lens + ' (' + comparison + ').'
  }]
}

/**
 * Checks if the optical centre measured from three vanishing
 * points is where an uncropped photo has it, in the middle.
 * @param uncertainty How far the optical centre moves, in pixels, with realistic handle placement errors
 */
export function opticalCentreCheck(cameraParameters: CameraParameters, uncertainty: number): Check[] {
  const imageWidth = cameraParameters.imageWidth
  const imageHeight = cameraParameters.imageHeight
  const centre = CoordinatesUtil.convert(
    cameraParameters.principalPoint,
    ImageCoordinateFrame.ImagePlane,
    ImageCoordinateFrame.Absolute,
    imageWidth,
    imageHeight
  )
  const offsetX = centre.x - 0.5 * imageWidth
  const offsetY = centre.y - 0.5 * imageHeight
  const offset = Math.sqrt(offsetX * offsetX + offsetY * offsetY)
  const halfDiagonal = 0.5 * Math.sqrt(imageWidth * imageWidth + imageHeight * imageHeight)

  if (offset < 2 * uncertainty) {
    return [{
      level: 'info',
      message: 'The optical centre is ' + offset.toFixed(0) + ' px from the image centre, but it moves by ±' + uncertainty.toFixed(0) +
        ' px with small handle errors, so this says nothing about a crop. It needs a third vanishing point with clearly converging lines.'
    }]
  }

  if (offset <= OFF_CENTRE_TOLERANCE * halfDiagonal) {
    return [{
      level: 'info',
      message: 'The optical centre is ' + offset.toFixed(0) + ' px from the image centre, so there is no sign of an off-centre crop.'
    }]
  }

  // If cropped, the full frame is at least as large as the smallest
  // frame that has the optical centre in the middle and holds the image
  const fullWidth = 2 * Math.max(centre.x, imageWidth - centre.x)
  const fullHeight = 2 * Math.max(centre.y, imageHeight - centre.y)
  // Leave out a direction in which the optical centre has hardly moved
  const directions: string[] = []
  if (Math.abs(offsetX) >= 0.005 * imageWidth) {
    directions.push(percent(Math.abs(offsetX) / imageWidth) + ' of the width to the ' + (offsetX > 0 ? 'right of' : 'left of'))
  }
  if (Math.abs(offsetY) >= 0.005 * imageHeight) {
    directions.push(percent(Math.abs(offsetY) / imageHeight) + ' of the height ' + (offsetY > 0 ? 'below' : 'above'))
  }
  return [{
    level: 'warning',
    message: 'The optical centre is ' + directions.join(' and ') + ' the image centre. ' +
      'The photo was cropped off-centre, from a frame of at least ' + fullWidth.toFixed(0) + ' × ' + fullHeight.toFixed(0) + ' px, or shot with a shift lens.'
  }]
}
