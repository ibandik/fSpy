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

/**
 * The camera metadata (EXIF) of a photo that is useful for
 * judging whether the photo is the full, unaltered camera frame.
 */
export interface PhotoMetadata {
  make: string | null
  model: string | null
  /** The program or firmware that wrote the file */
  software: string | null
  /** Focal length in mm */
  focalLength: number | null
  /** Focal length in mm of a lens with the same field of view on 35 mm film */
  focalLength35mm: number | null
  /** The image size in pixels as recorded by the camera */
  pixelWidth: number | null
  pixelHeight: number | null
  /** The size of the sensor in mm, when the camera recorded enough to tell */
  sensorWidth: number | null
  sensorHeight: number | null
  digitalZoomRatio: number | null
}

const TAG_MAKE = 0x010f
const TAG_MODEL = 0x0110
const TAG_SOFTWARE = 0x0131
const TAG_EXIF_IFD = 0x8769
const TAG_FOCAL_LENGTH = 0x920a
const TAG_PIXEL_WIDTH = 0xa002
const TAG_PIXEL_HEIGHT = 0xa003
const TAG_FOCAL_PLANE_X_RESOLUTION = 0xa20e
const TAG_FOCAL_PLANE_Y_RESOLUTION = 0xa20f
const TAG_FOCAL_PLANE_RESOLUTION_UNIT = 0xa210
const TAG_DIGITAL_ZOOM_RATIO = 0xa404
const TAG_FOCAL_LENGTH_35MM = 0xa405

// Length in mm of the focal plane resolution units 2 (inch), 3 (cm), 4 (mm) and 5 (um)
const RESOLUTION_UNITS_MM: { [unit: number]: number } = { 2: 25.4, 3: 10, 4: 1, 5: 0.001 }

// Bytes per value for the TIFF field types 1 to 12
const TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8]

/**
 * Reads the camera metadata of a JPEG image.
 * @returns null if the data is not a JPEG image or has no EXIF block
 */
export function readPhotoMetadata(data: Uint8Array): PhotoMetadata | null {
  try {
    const tiffOffset = findExifBlock(data)
    return tiffOffset === null ? null : parseTiff(data, tiffOffset)
  } catch {
    // Truncated or malformed metadata
    return null
  }
}

/**
 * @returns the offset of the TIFF header inside the EXIF segment of a JPEG file
 */
function findExifBlock(data: Uint8Array): number | null {
  if (data.length < 4 || data[0] != 0xff || data[1] != 0xd8) {
    return null
  }
  let offset = 2
  while (offset + 4 <= data.length && data[offset] == 0xff) {
    const marker = data[offset + 1]
    if (marker == 0xda || marker == 0xd9) {
      // Start of the image data or end of the image
      return null
    }
    const size = (data[offset + 2] << 8) | data[offset + 3]
    const isExif = marker == 0xe1 &&
      String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]) == 'Exif'
    if (isExif) {
      return offset + 10
    }
    offset += 2 + size
  }
  return null
}

function parseTiff(data: Uint8Array, tiffOffset: number): PhotoMetadata | null {
  const view = new DataView(data.buffer, data.byteOffset + tiffOffset, data.byteLength - tiffOffset)
  const byteOrder = view.getUint16(0)
  if (byteOrder != 0x4949 && byteOrder != 0x4d4d) {
    return null
  }
  const littleEndian = byteOrder == 0x4949

  // Reads the entries of an image file directory into a map from tag to value
  const readDirectory = (directoryOffset: number): { [tag: number]: string | number } => {
    const values: { [tag: number]: string | number } = {}
    const entryCount = view.getUint16(directoryOffset, littleEndian)
    for (let i = 0; i < entryCount; i++) {
      const entryOffset = directoryOffset + 2 + 12 * i
      const tag = view.getUint16(entryOffset, littleEndian)
      const type = view.getUint16(entryOffset + 2, littleEndian)
      const count = view.getUint32(entryOffset + 4, littleEndian)
      const byteCount = (TYPE_SIZES[type] || 0) * count
      // Values of up to four bytes are stored in the entry itself
      const valueOffset = byteCount <= 4 ? entryOffset + 8 : view.getUint32(entryOffset + 8, littleEndian)
      if (byteCount == 0 || valueOffset + byteCount > view.byteLength) {
        continue
      }
      switch (type) {
        case 2: {
          let text = ''
          for (let j = 0; j < count; j++) {
            const character = view.getUint8(valueOffset + j)
            if (character == 0) {
              break
            }
            text += String.fromCharCode(character)
          }
          values[tag] = text.trim()
          break
        }
        case 3:
          values[tag] = view.getUint16(valueOffset, littleEndian)
          break
        case 4:
          values[tag] = view.getUint32(valueOffset, littleEndian)
          break
        case 5: {
          const denominator = view.getUint32(valueOffset + 4, littleEndian)
          if (denominator != 0) {
            values[tag] = view.getUint32(valueOffset, littleEndian) / denominator
          }
          break
        }
      }
    }
    return values
  }

  const text = (value: string | number | undefined) => typeof value == 'string' && value.length > 0 ? value : null
  const positiveNumber = (value: string | number | undefined) => typeof value == 'number' && value > 0 ? value : null

  const image = readDirectory(view.getUint32(4, littleEndian))
  const exifOffset = image[TAG_EXIF_IFD]
  const exif = typeof exifOffset == 'number' ? readDirectory(exifOffset) : {}

  // The sensor size follows from the pixel count and the pixel density on the sensor
  const pixelWidth = positiveNumber(exif[TAG_PIXEL_WIDTH])
  const pixelHeight = positiveNumber(exif[TAG_PIXEL_HEIGHT])
  const resolutionUnit = RESOLUTION_UNITS_MM[exif[TAG_FOCAL_PLANE_RESOLUTION_UNIT] as number]
  const sensorSide = (pixels: number | null, resolution: number | null) => {
    if (pixels === null || resolution === null || resolutionUnit === undefined) {
      return null
    }
    const size = resolutionUnit * pixels / resolution
    // Guard against nonsense values some cameras and editors write
    return size > 1 && size < 110 ? size : null
  }

  return {
    make: text(image[TAG_MAKE]),
    model: text(image[TAG_MODEL]),
    software: text(image[TAG_SOFTWARE]),
    focalLength: positiveNumber(exif[TAG_FOCAL_LENGTH]),
    focalLength35mm: positiveNumber(exif[TAG_FOCAL_LENGTH_35MM]),
    pixelWidth: pixelWidth,
    pixelHeight: pixelHeight,
    sensorWidth: sensorSide(pixelWidth, positiveNumber(exif[TAG_FOCAL_PLANE_X_RESOLUTION])),
    sensorHeight: sensorSide(pixelHeight, positiveNumber(exif[TAG_FOCAL_PLANE_Y_RESOLUTION])),
    digitalZoomRatio: positiveNumber(exif[TAG_DIGITAL_ZOOM_RATIO])
  }
}
