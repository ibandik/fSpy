import { test } from 'node:test'
import assert from 'node:assert/strict'
import { houdiniCameraData, houdiniCameraName, houdiniCameraScript } from '../src/gui/io/houdini-export'
import { loadProject, solve } from './support'

// The expected numbers are from cameras that were checked in Houdini 21 and 22: the origin,
// the principal point and the vanishing points of the project line up with the Houdini camera.

test('camera of a project with a reference distance in feet', () => {
  const state = loadProject('ref_distance_in_yards.fspy')
  // Projects from before version 1.0.3 store yards, which the app converts when loading
  state.calibrationSettingsBase.referenceDistanceUnit = 'Feet' as any
  state.calibrationSettingsBase.referenceDistance *= 3
  const camera = houdiniCameraData(solve(state).cameraParameters!, state.calibrationSettingsBase)

  assert.equal(camera.imageWidth, 5184)
  assert.equal(camera.imageHeight, 3456)
  // Canon 60D, 22.3 mm wide sensor
  assert.ok(Math.abs(camera.aperture - 22.3) < 1e-9)
  assert.ok(Math.abs(camera.focalLength - 26.013) < 0.001)
  // The principal point is in the image centre. The offsets can be negative zero.
  assert.ok(camera.windowX == 0 && camera.windowY == 0)
  assert.equal(camera.unitName, 'feet')
  assert.equal(camera.metersPerUnit, 0.3048)
  // The project has z up, Houdini has y up
  assert.equal(camera.convertedUpAxis, '+z')
  const cameraUp = [camera.cameraToWorld[0][1], camera.cameraToWorld[1][1], camera.cameraToWorld[2][1]]
  assert.ok(cameraUp[1] > Math.abs(cameraUp[0]) && cameraUp[1] > Math.abs(cameraUp[2]))
  // 529.41 feet from the origin
  const position = [camera.cameraToWorld[0][3], camera.cameraToWorld[1][3], camera.cameraToWorld[2][3]]
  assert.ok(Math.abs(Math.hypot(position[0], position[1], position[2]) - 529.4122) < 0.001)
})

test('a principal point away from the centre becomes a screen window offset', () => {
  const state = loadProject('pp problem landscape.fspy')
  const camera = houdiniCameraData(solve(state).cameraParameters!, state.calibrationSettingsBase)
  assert.ok(Math.abs(camera.windowX - -0.10444444444444445) < 1e-9)
  assert.ok(Math.abs(camera.windowY - 0.21867501304121018) < 1e-9)
  assert.equal(camera.unitName, null)

  const script = houdiniCameraScript(camera, 'fspy_test', 'C:\\photos\\plate.jpg')
  assert.ok(script.includes('\'vm_background\': "C:/photos/plate.jpg"'))
  assert.ok(script.includes('setApplyZoomToBackgroundImage(False)'))
  // One statement per line, so that the script can be pasted into the Python shell
  for (const line of script.trim().split('\n')) {
    assert.ok(!line.startsWith(' '), line)
  }
})

test('a centred camera leaves the viewports alone and needs no image', () => {
  const state = loadProject('canon5d_16mm.fspy')
  const camera = houdiniCameraData(solve(state).cameraParameters!, state.calibrationSettingsBase)
  // The focal length that was entered in fSpy for the Canon 5D
  assert.ok(Math.abs(camera.focalLength - 16) < 1e-9)
  assert.ok(Math.abs(camera.aperture - 36) < 1e-9)
  const script = houdiniCameraScript(camera, 'fspy_test', null)
  assert.ok(!script.includes('setApplyZoomToBackgroundImage'))
  assert.ok(!script.includes('vm_background'))
  assert.ok(script.includes('hou.scaleFromMKS'))
})

test('camera names are valid Houdini node names', () => {
  assert.equal(houdiniCameraName('my shot-01.py'), 'fspy_my_shot_01')
  assert.equal(houdiniCameraName('fspy_camera.py'), 'fspy_camera')
})
