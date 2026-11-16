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
 * The brightness gradient of an image, used to find edges
 */
export interface EdgeMap {
  width: number
  height: number
  gradientX: Float32Array
  gradientY: Float32Array
}

/**
 * Computes the brightness gradient of an image with a Sobel filter
 * @param rgba The pixels of the image, four bytes per pixel, row by row
 */
export function edgeMapFromPixels(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): EdgeMap {
  const brightness = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    brightness[i] = 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]
  }
  const gradientX = new Float32Array(width * height)
  const gradientY = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const topLeft = brightness[i - width - 1]
      const top = brightness[i - width]
      const topRight = brightness[i - width + 1]
      const left = brightness[i - 1]
      const right = brightness[i + 1]
      const bottomLeft = brightness[i + width - 1]
      const bottom = brightness[i + width]
      const bottomRight = brightness[i + width + 1]
      gradientX[i] = 0.125 * (topRight + 2 * right + bottomRight - topLeft - 2 * left - bottomLeft)
      gradientY[i] = 0.125 * (bottomLeft + 2 * bottom + bottomRight - topLeft - 2 * top - topRight)
    }
  }
  return { width: width, height: height, gradientX: gradientX, gradientY: gradientY }
}

/**
 * Samples a gradient component between pixels. Zero outside the image.
 */
function sample(values: Float32Array, edgeMap: EdgeMap, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 + 1 >= edgeMap.width || y0 + 1 >= edgeMap.height) {
    return 0
  }
  const fx = x - x0
  const fy = y - y0
  const i = y0 * edgeMap.width + x0
  return (1 - fy) * ((1 - fx) * values[i] + fx * values[i + 1]) +
    fy * ((1 - fx) * values[i + edgeMap.width] + fx * values[i + edgeMap.width + 1])
}

/**
 * How strong and consistent the edge under a line segment is: the mean
 * brightness change per pixel across the segment. An edge that is light
 * on one side all along the segment scores higher than a mix of both.
 */
export function edgeStrength(edgeMap: EdgeMap, start: Point2D, end: Point2D): number {
  const length = Math.sqrt((end.x - start.x) * (end.x - start.x) + (end.y - start.y) * (end.y - start.y))
  if (length < 1e-6) {
    return 0
  }
  const normalX = -(end.y - start.y) / length
  const normalY = (end.x - start.x) / length
  const sampleCount = 32
  let sum = 0
  for (let i = 0; i < sampleCount; i++) {
    const t = (i + 0.5) / sampleCount
    const x = start.x + t * (end.x - start.x)
    const y = start.y + t * (end.y - start.y)
    sum += normalX * sample(edgeMap.gradientX, edgeMap, x, y) + normalY * sample(edgeMap.gradientY, edgeMap, x, y)
  }
  return Math.abs(sum) / sampleCount
}

// Brightness change per pixel, on a scale of 0 to 255, below which there is no edge to speak of
const MIN_EDGE_STRENGTH = 2

/**
 * Moves a line segment onto the strongest image edge near it. Both end
 * points move sideways only, by up to searchRadius pixels each.
 * @param start The start of the segment in edge map pixels
 * @param end The end of the segment in edge map pixels
 * @returns the moved segment, or null if there is no clear edge nearby
 */
export function snapSegmentToEdge(
  edgeMap: EdgeMap,
  start: Point2D,
  end: Point2D,
  searchRadius: number
): [Point2D, Point2D] | null {
  const length = Math.sqrt((end.x - start.x) * (end.x - start.x) + (end.y - start.y) * (end.y - start.y))
  if (length < 4) {
    return null
  }
  const normal = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length }
  const step = 0.5
  let best: [Point2D, Point2D] | null = null
  let bestStrength = MIN_EDGE_STRENGTH
  for (let startOffset = -searchRadius; startOffset <= searchRadius; startOffset += step) {
    for (let endOffset = -searchRadius; endOffset <= searchRadius; endOffset += step) {
      const movedStart = { x: start.x + startOffset * normal.x, y: start.y + startOffset * normal.y }
      const movedEnd = { x: end.x + endOffset * normal.x, y: end.y + endOffset * normal.y }
      const strength = edgeStrength(edgeMap, movedStart, movedEnd)
      if (strength > bestStrength) {
        bestStrength = strength
        best = [movedStart, movedEnd]
      }
    }
  }
  return best
}
