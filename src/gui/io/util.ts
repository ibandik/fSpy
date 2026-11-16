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

import { join } from 'path'
import { ipcRenderer } from 'electron'
import { ShowErrorMessage } from '../ipc-messages'

/**
 * Shows a native error dialog. For use in the renderer process.
 */
export function showErrorBox(title: string, content: string) {
  ipcRenderer.send(ShowErrorMessage.type, new ShowErrorMessage(title, content))
}

export function loadImage(
  imageBuffer: Buffer,
  onLoad: (width: number, height: number, url: string) => void,
  onError: () => void
) {
  // A Buffer is a Uint8Array, which the DOM types don't know
  let blob = new Blob([imageBuffer as unknown as BlobPart])
  let url = URL.createObjectURL(blob)
  let image = new Image()
  image.src = url
  image.onload = (_: Event) => {
    onLoad(image.width, image.height, url)
  }
  image.onerror = (_) => {
    onError()
  }
}

export function resourceURL(fileName: string): string {
  if (process.resourcesPath != null) {
    if (process.env.DEV) {
      return join(`file://${process.cwd()}`, 'assets/electron', fileName)
    } else {
      return join(process.resourcesPath, fileName)
    }
  }

  return ''
}

export function resourcePath(fileName: string): string {
  if (process.resourcesPath != null) {
    if (process.env.DEV) {
      return join(process.cwd(), 'assets/electron', fileName)
    } else {
      return join(process.resourcesPath, fileName)
    }
  }

  return ''
}
