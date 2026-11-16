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

import { CameraParameters } from '../solver/solver-result'
import { CalibrationSettingsBase, ReferenceDistanceUnit } from '../types/calibration-settings'
import { cameraPresets } from '../solver/camera-presets'

/**
 * Everything needed to build a Houdini camera, as plain data
 * that can be sent from the renderer to the main process.
 */
export interface HoudiniCameraData {
  /**
   * Camera to world matrix, first three rows, with the translation
   * in the last column. The world is y up, like Houdini.
   */
  cameraToWorld: number[][]
  /** The fSpy axis that was up in the image and got rotated to +y, or null if +y was up already */
  convertedUpAxis: string | null
  imageWidth: number
  imageHeight: number
  /** Houdini focal length in mm. Matches the focal length shown in fSpy */
  focalLength: number
  /** Houdini aperture in mm, i.e the sensor size along the image width */
  aperture: number
  /** Houdini screen window offset, in fractions of the image width and height */
  windowX: number
  windowY: number
  /** Name and length in meters of the reference distance unit, or null if there is no reference distance with a unit */
  unitName: string | null
  metersPerUnit: number | null
}

export interface HoudiniExportPayload {
  camera: HoudiniCameraData
  image: Uint8Array | null
}

const metersPerReferenceDistanceUnit: { [unit: string]: number } = {
  [ReferenceDistanceUnit.Millimeters]: 0.001,
  [ReferenceDistanceUnit.Centimeters]: 0.01,
  [ReferenceDistanceUnit.Meters]: 1,
  [ReferenceDistanceUnit.Kilometers]: 1000,
  [ReferenceDistanceUnit.Inches]: 0.0254,
  [ReferenceDistanceUnit.Feet]: 0.3048,
  [ReferenceDistanceUnit.Miles]: 1609.344
}

// Rotations taking each fSpy world axis to Houdini's up axis, +y
const rotationsToYUp: { name: string, up: number[], rotation: number[][] }[] = [
  { name: '+x', up: [1, 0, 0], rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] },
  { name: '-x', up: [-1, 0, 0], rotation: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]] },
  { name: '-y', up: [0, -1, 0], rotation: [[-1, 0, 0], [0, -1, 0], [0, 0, 1]] },
  { name: '+z', up: [0, 0, 1], rotation: [[1, 0, 0], [0, 0, 1], [0, -1, 0]] },
  { name: '-z', up: [0, 0, -1], rotation: [[1, 0, 0], [0, 0, -1], [0, 1, 0]] }
]

export function houdiniCameraData(
  cameraParameters: CameraParameters,
  settings: CalibrationSettingsBase
): HoudiniCameraData {
  const imageWidth = cameraParameters.imageWidth
  const imageHeight = cameraParameters.imageHeight

  // Half the size of the image in image plane coordinates,
  // see ImageCoordinateFrame.ImagePlane
  const aspectRatio = imageWidth / imageHeight
  const halfWidth = aspectRatio <= 1 ? aspectRatio : 1
  const halfHeight = aspectRatio <= 1 ? 1 : 1 / aspectRatio

  // Same sensor logic as the focal length shown in the result panel:
  // the long side of the sensor spans the long side of the image
  const cameraData = settings.cameraData
  let sensorWidth = cameraData.customSensorWidth
  let sensorHeight = cameraData.customSensorHeight
  if (cameraData.presetId && cameraPresets[cameraData.presetId]) {
    sensorWidth = cameraPresets[cameraData.presetId].sensorWidth
    sensorHeight = cameraPresets[cameraData.presetId].sensorHeight
  }
  let sensorLongSide = sensorHeight > 0 && sensorWidth / sensorHeight > 1 ? sensorWidth : sensorHeight
  if (!(sensorLongSide > 0)) {
    sensorLongSide = 36
  }

  // The world axis closest to the up direction of the image becomes +y
  const matrix = cameraParameters.cameraTransform.matrix
  const cameraUp = [matrix[0][1], matrix[1][1], matrix[2][1]]
  let cameraToWorld = matrix.slice(0, 3).map((row) => row.slice())
  let convertedUpAxis: string | null = null
  let bestAlignment = cameraUp[1]
  for (const candidate of rotationsToYUp) {
    const alignment = candidate.up[0] * cameraUp[0] + candidate.up[1] * cameraUp[1] + candidate.up[2] * cameraUp[2]
    if (alignment > bestAlignment) {
      bestAlignment = alignment
      convertedUpAxis = candidate.name
      cameraToWorld = candidate.rotation.map((rotationRow) => {
        return [0, 1, 2, 3].map((column) => {
          return rotationRow[0] * matrix[0][column] + rotationRow[1] * matrix[1][column] + rotationRow[2] * matrix[2][column]
        })
      })
    }
  }

  const unit = settings.referenceDistanceUnit
  const hasUnit = settings.referenceDistanceAxis !== null && metersPerReferenceDistanceUnit[unit] !== undefined

  return {
    cameraToWorld: cameraToWorld,
    convertedUpAxis: convertedUpAxis,
    imageWidth: imageWidth,
    imageHeight: imageHeight,
    focalLength: 0.5 * sensorLongSide * cameraParameters.relativeFocalLength,
    aperture: sensorLongSide * halfWidth,
    // Houdini moves the window, not the principal point, hence the sign
    windowX: -cameraParameters.principalPoint.x / (2 * halfWidth),
    windowY: -cameraParameters.principalPoint.y / (2 * halfHeight),
    unitName: hasUnit ? unit.toLowerCase() : null,
    metersPerUnit: hasUnit ? metersPerReferenceDistanceUnit[unit] : null
  }
}

/**
 * Returns a valid Houdini node name for the camera, based on the name
 * of the exported script.
 */
export function houdiniCameraName(scriptFileName: string): string {
  const name = scriptFileName.replace(/\.py$/i, '').replace(/[^A-Za-z0-9_]/g, '_')
  return name.toLowerCase().startsWith('fspy') ? name : 'fspy_' + name
}

/**
 * Returns a Python script that creates or updates a camera in Houdini.
 * The script has one statement per line and no blocks, so that it also
 * works when pasted into the Houdini Python shell.
 */
export function houdiniCameraScript(
  camera: HoudiniCameraData,
  cameraName: string,
  imagePath: string | null
): string {
  const rows = camera.cameraToWorld
  const scale = camera.metersPerUnit !== null ? ' * unit_scale' : ''
  // hou.Matrix4 has the translation in the last row, so write the transpose
  const matrixRows = [0, 1, 2].map((column) => {
    return '(' + rows[0][column] + ', ' + rows[1][column] + ', ' + rows[2][column] + ', 0)'
  })
  matrixRows.push('(' + rows[0][3] + scale + ', ' + rows[1][3] + scale + ', ' + rows[2][3] + scale + ', 1)')

  const parameters = [
    '\'resx\': ' + camera.imageWidth,
    '\'resy\': ' + camera.imageHeight,
    '\'aspect\': 1',
    '\'focal\': ' + camera.focalLength,
    '\'aperture\': ' + camera.aperture,
    '\'winx\': ' + camera.windowX,
    '\'winy\': ' + camera.windowY
  ]
  if (imagePath !== null) {
    // New cameras come with the background image switched off
    parameters.push('\'vm_bgenable\': 1')
    parameters.push('\'vm_background\': ' + JSON.stringify(imagePath.replace(/\\/g, '/')))
  }

  const lines = [
    '# Camera solved in fSpy. Run with File > Run Script in Houdini,',
    '# or paste into the Python shell.',
    '# Running it again updates /obj/' + cameraName + ' instead of making a new camera.'
  ]
  if (camera.convertedUpAxis !== null) {
    lines.push('# The fSpy ' + camera.convertedUpAxis + ' axis points up in the image. It was rotated to y, the up axis of Houdini.')
  }
  lines.push('import hou')
  if (camera.metersPerUnit !== null) {
    lines.push('unit_scale = ' + camera.metersPerUnit + ' * hou.scaleFromMKS(\'m1\')  # ' + camera.unitName + ' in fSpy to Houdini units')
  }
  lines.push(
    'existing_camera = hou.node(\'/obj/' + cameraName + '\')',
    'camera = existing_camera or hou.node(\'/obj\').createNode(\'cam\', \'' + cameraName + '\')',
    '_ = existing_camera or camera.moveToGoodPosition()',
    'camera.setParms({' + parameters.join(', ') + '})',
    'camera.setWorldTransform(hou.Matrix4((' + matrixRows.join(', ') + ')))'
  )

  return lines.join('\n') + '\n'
}
