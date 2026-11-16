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

import { EdgeMap, edgeMapFromPixels } from './edge-snap'

// Larger images are scaled down to this size before looking for edges
const MAX_EDGE_MAP_SIZE = 2048

let cachedImageUrl: string | null = null
let cachedEdgeMap: Promise<EdgeMap> | null = null

/**
 * Reads the pixels of the image at a URL and computes its edge map.
 * The edge map of the last image is kept. Only works in the renderer process.
 */
export function loadEdgeMap(imageUrl: string): Promise<EdgeMap> {
  if (cachedImageUrl == imageUrl && cachedEdgeMap) {
    return cachedEdgeMap
  }
  cachedImageUrl = imageUrl
  cachedEdgeMap = new Promise<EdgeMap>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, MAX_EDGE_MAP_SIZE / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(scale * image.width))
      canvas.height = Math.max(1, Math.round(scale * image.height))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('No canvas to read the image pixels with'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      resolve(edgeMapFromPixels(pixels.data, canvas.width, canvas.height))
    }
    image.onerror = () => {
      reject(new Error('Failed to load the image'))
    }
    image.src = imageUrl
  })
  return cachedEdgeMap
}
