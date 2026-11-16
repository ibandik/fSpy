import { readFileSync } from 'fs'
import { join } from 'path'
import Solver from '../src/gui/solver/solver'
import { SolverResult } from '../src/gui/solver/solver-result'
import { StoreState } from '../src/gui/types/store-state'
import { CalibrationMode } from '../src/gui/types/global-settings'
import { analyse } from '../src/gui/analysis/analysis'

/**
 * The size in pixels of a JPEG or PNG image
 */
function imageSize(image: Buffer): [number, number] {
  if (image.toString('latin1', 1, 4) == 'PNG') {
    return [image.readUInt32BE(16), image.readUInt32BE(20)]
  }
  let offset = 2
  while (offset + 9 < image.length) {
    const marker = image[offset + 1]
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker != 0xc4 && marker != 0xc8 && marker != 0xcc
    if (isStartOfFrame) {
      return [image.readUInt16BE(offset + 7), image.readUInt16BE(offset + 5)]
    }
    offset += 2 + image.readUInt16BE(offset + 2)
  }
  throw new Error('Unknown image format')
}

/**
 * Loads one of the projects in the test_data folder as the state the app would have after opening it
 */
export function loadProject(fileName: string): StoreState {
  // The compiled tests are in __tests__/tests
  const buffer = readFileSync(join(__dirname, '..', '..', 'test_data', fileName))
  const stateSize = buffer.readUInt32LE(8)
  const savedState = JSON.parse(buffer.subarray(16, 16 + stateSize).toString())
  const image = buffer.subarray(16 + stateSize)
  const [width, height] = imageSize(image)
  return { ...savedState, image: { data: image, width: width, height: height, url: null } }
}

/**
 * Solves the way the app does when something changes, including the checks
 */
export function solve(state: StoreState): SolverResult {
  const result = state.globalSettings.calibrationMode == CalibrationMode.OneVanishingPoint
    ? Solver.solve1VP(
      state.calibrationSettingsBase,
      state.calibrationSettings1VP,
      state.controlPointsStateBase,
      state.controlPointsState1VP,
      state.image
    )
    : Solver.solve2VP(
      state.calibrationSettingsBase,
      state.calibrationSettings2VP,
      state.controlPointsStateBase,
      state.controlPointsState2VP,
      state.image
    )
  result.checks = analyse(state, result)
  return result
}

/**
 * Repeatable pseudo random numbers
 */
export function randomNumbers(seed: number): { uniform: () => number, gaussian: () => number } {
  const uniform = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const gaussian = () => Math.sqrt(-2 * Math.log(uniform() + 1e-12)) * Math.cos(2 * Math.PI * uniform())
  return { uniform: uniform, gaussian: gaussian }
}
