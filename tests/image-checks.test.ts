import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PhotoMetadata, readPhotoMetadata } from '../src/gui/analysis/exif'
import { metadataChecks, fieldOfViewCheck, opticalCentreCheck } from '../src/gui/analysis/photo-checks'
import { measureLensDistortion } from '../src/gui/analysis/lens-distortion'
import { edgeMapFromPixels, snapSegmentToEdge } from '../src/gui/analysis/edge-snap'
import { CameraParameters, Check } from '../src/gui/solver/solver-result'
import Point2D from '../src/gui/solver/point-2d'
import { loadProject, solve, randomNumbers } from './support'

function has(checks: Check[], level: string, text: string): boolean {
  return checks.some((check) => check.level == level && check.message.includes(text))
}

function hasWarning(checks: Check[]): boolean {
  return checks.some((check) => check.level == 'warning')
}

/**
 * Metadata of an untouched 6000 x 4000 frame shot with a 24 mm lens on 35 mm film
 */
function metadata(overrides: Partial<PhotoMetadata> = {}): PhotoMetadata {
  return {
    make: 'Canon',
    model: 'Canon EOS 5D',
    software: null,
    focalLength: 24,
    focalLength35mm: 24,
    pixelWidth: 6000,
    pixelHeight: 4000,
    sensorWidth: null,
    sensorHeight: null,
    digitalZoomRatio: null,
    ...overrides
  }
}

/**
 * The parts of the solved camera that the checks look at, for a 6000 x 4000 image
 */
function camera(relativeFocalLength: number, principalPoint: Point2D = { x: 0, y: 0 }): CameraParameters {
  return {
    imageWidth: 6000,
    imageHeight: 4000,
    relativeFocalLength: relativeFocalLength,
    principalPoint: principalPoint
  } as CameraParameters
}

test('metadata of real camera files is read', () => {
  const canon = readPhotoMetadata(loadProject('canon5d_16mm.fspy').image.data!)
  assert.ok(canon)
  assert.equal(canon.model, 'Canon EOS 5D')
  assert.equal(canon.focalLength, 16)
  assert.equal(canon.software, 'Adobe Photoshop CS2 Windows')
  assert.ok(canon.sensorWidth !== null && Math.abs(canon.sensorWidth - 36) < 0.5)

  const phone = readPhotoMetadata(loadProject('iphone6plus.fspy').image.data!)
  assert.ok(phone)
  assert.equal(phone.focalLength35mm, 29)
  assert.equal(phone.pixelWidth, 4032)

  // A screenshot without any metadata
  assert.equal(readPhotoMetadata(loadProject('defaults.fspy').image.data!), null)
})

test('crops and edits are found from metadata', () => {
  assert.equal(hasWarning(metadataChecks(metadata(), 6000, 4000)), false)
  assert.ok(has(metadataChecks(metadata(), 4000, 4000), 'warning', 'Cropped'))
  // Same proportions: resized, which is no sign of a crop
  assert.ok(has(metadataChecks(metadata(), 3000, 2000), 'info', 'Resized'))
  assert.equal(hasWarning(metadataChecks(metadata(), 3000, 2000)), false)
  // A portrait frame that the camera recorded as landscape
  assert.equal(hasWarning(metadataChecks(metadata(), 4000, 6000)), false)
  assert.ok(has(metadataChecks(metadata({ software: 'Adobe Photoshop 25.0 (Windows)' }), 6000, 4000), 'warning', 'Photoshop'))
  assert.equal(hasWarning(metadataChecks(metadata({ software: 'Firmware Version 1.1.2' }), 6000, 4000)), false)
  // Without metadata only the proportions are left to go by
  assert.ok(has(metadataChecks(null, 1000, 613), 'warning', 'probably cropped'))
  assert.equal(hasWarning(metadataChecks(null, 1920, 1080)), false)
})

test('the field of view is compared with the lens in the metadata', () => {
  // A 24 mm lens on a 36 mm wide frame has a relative focal length of 24 / 18
  const expected = 24 / 18
  assert.ok(has(fieldOfViewCheck(metadata(), camera(expected), true), 'info', 'agrees'))
  assert.ok(has(fieldOfViewCheck(metadata(), camera(1.6 * expected), true), 'warning', 'cropped to about 6'))
  assert.ok(has(fieldOfViewCheck(metadata(), camera(0.7 * expected), true), 'warning', 'wider'))
  assert.equal(fieldOfViewCheck(metadata({ focalLength: null, focalLength35mm: null }), camera(expected), true).length, 0)
})

test('an optical centre away from the image centre points at an off-centre crop', () => {
  // 15 % of the width to the right is 0.3 in image plane coordinates
  const offCentre = opticalCentreCheck(camera(1.3, { x: 0.3, y: 0 }), 20)
  assert.ok(has(offCentre, 'warning', '15 % of the width to the right of the image centre'))
  assert.ok(has(offCentre, 'warning', '7800 × 4000'))
  assert.ok(has(opticalCentreCheck(camera(1.3, { x: 0.01, y: 0 }), 5), 'info', 'no sign'))
  // Not when the optical centre is too uncertain to say
  assert.ok(has(opticalCentreCheck(camera(1.3, { x: 0.3, y: 0 }), 600), 'info', 'says nothing about a crop'))
})

test('lens distortion is measured from a bowed edge', () => {
  const width = 4000
  const height = 3000
  const halfDiagonal = 2500
  // The distorted position of a point, for undistorted = distorted * (1 + k1 r^2)
  const distort = (point: Point2D, k1: number) => {
    const x = point.x - width / 2
    const y = point.y - height / 2
    let distortedX = x
    let distortedY = y
    for (let iteration = 0; iteration < 50; iteration++) {
      const scale = 1 + k1 * (distortedX * distortedX + distortedY * distortedY) / (halfDiagonal * halfDiagonal)
      distortedX = x / scale
      distortedY = y / scale
    }
    return { x: distortedX + width / 2, y: distortedY + height / 2 }
  }
  const edgeNearBorder = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ x: 300 + t * 3400, y: 250 + t * 120 }))
  for (const k1 of [0.08, -0.05]) {
    const measured = measureLensDistortion(edgeNearBorder.map((point) => distort(point, k1)), width, height)!
    assert.ok(Math.abs(measured.k1 - k1) < 0.002)
    assert.ok(measured.isReliable)
  }
  const straight = measureLensDistortion(edgeNearBorder, width, height)!
  assert.ok(straight.bow < 1e-6 && Math.abs(straight.k1) < 1e-3)

  // Radial distortion leaves lines through the image centre straight
  const edgeThroughCentre = [0, 0.25, 0.5, 0.75, 1].map((t) => distort({ x: 300 + t * 3400, y: 1450 + t * 100 }, 0.08))
  assert.equal(measureLensDistortion(edgeThroughCentre, width, height)!.isReliable, false)
})

test('a line snaps onto a nearby image edge', () => {
  const width = 400
  const height = 300
  const { uniform } = randomNumbers(12345)
  // A slightly noisy picture, dark on one side of a line and light on the other
  const edgeStart = { x: 50, y: 100 }
  const edgeEnd = { x: 350, y: 160 }
  const edgeLength = Math.hypot(edgeEnd.x - edgeStart.x, edgeEnd.y - edgeStart.y)
  const normal = { x: -(edgeEnd.y - edgeStart.y) / edgeLength, y: (edgeEnd.x - edgeStart.x) / edgeLength }
  const distanceToEdge = (point: Point2D) => (point.x - edgeStart.x) * normal.x + (point.y - edgeStart.y) * normal.y
  const pixels = new Uint8ClampedArray(4 * width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const brightness = 60 + 140 / (1 + Math.exp(-2 * distanceToEdge({ x: x, y: y }))) + 6 * (uniform() - 0.5)
      pixels.set([brightness, brightness, brightness, 255], 4 * (y * width + x))
    }
  }
  const edgeMap = edgeMapFromPixels(pixels, width, height)

  // A line placed a few pixels off the edge and slightly rotated
  const start = { x: 100 + 5 * normal.x, y: 110 + 5 * normal.y }
  const end = { x: 300 - 4 * normal.x, y: 150 - 4 * normal.y }
  const snapped = snapSegmentToEdge(edgeMap, start, end, 8)
  assert.ok(snapped)
  assert.ok(Math.abs(distanceToEdge(snapped[0])) < 0.6 && Math.abs(distanceToEdge(snapped[1])) < 0.6)

  // No edge near this one
  assert.equal(snapSegmentToEdge(edgeMap, { x: 100, y: 30 }, { x: 300, y: 40 }, 8), null)
})

test('the checks of a real project', () => {
  const checks = solve(loadProject('iphone6plus.fspy')).checks
  assert.ok(has(checks, 'info', 'Apple iPhone 6s, 4.15 mm lens (29 mm equivalent)'))
  assert.ok(has(checks, 'info', 'field of view agrees'))
  assert.ok(has(checks, 'info', 'Handles that are each off by 4 px'))
})
