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

import { CalibrationMode, Overlay3DGuide } from '../types/global-settings'
import { ControlPointPairIndex } from '../types/control-points-state'
import { PrincipalPointMode1VP, PrincipalPointMode2VP, Axis, ReferenceDistanceUnit } from '../types/calibration-settings'
import Point2D from '../solver/point-2d'
import { StoreState } from '../types/store-state'
import { ThunkAction, ThunkDispatch } from 'redux-thunk'
import Solver from '../solver/solver'
import { SolverResult } from '../solver/solver-result'
import { analyse } from '../analysis/analysis'
import { loadEdgeMap } from '../analysis/edge-map-loader'
import { snapSegmentToEdge } from '../analysis/edge-snap'
import SavedState from '../io/saved-state'
import { ImageState } from '../types/image-state'
import { OrientationFormat, PrincipalPointFormat, FieldOfViewFormat } from '../types/result-display-settings'

export enum ActionTypes {
  // IO actions
  LOAD_DEFAULT_STATE = 'LOAD_DEFAULT_STATE',
  LOAD_STATE = 'LOAD_STATE',
  SET_PROJECT_HAS_UNSAVED_CHANGES = 'SET_PROJECT_HAS_UNSAVED_CHANGES',
  SET_PROJECT_FILE_PATH = 'SET_PROJECT_FILE_PATH',

  // Global settings actions
  SET_CALIBRATION_MODE = 'SET_CALIBRATION_MODE',
  SET_IMAGE_OPACITY = 'SET_IMAGE_OPACITY',
  SET_OVERLAY_3D_GUIDE = 'SET_OVERLAY_3D_GUIDE',

  // Image loading actions
  SET_IMAGE = 'SET_IMAGE',

  // Calibration settings actions
  SET_QUAD_MODE_ENABLED = 'SET_QUAD_MODE_ENABLED',
  SET_REFERENCE_DISTANCE = 'SET_REFERENCE_DISTANCE',
  SET_REFERENCE_DISTANCE_UNIT = 'SET_REFERENCE_DISTANCE_UNIT',
  SET_REFERENCE_DISTANCE_AXIS = 'SET_REFERENCE_DISTANCE_AXIS',
  SET_CAMERA_PRESET = 'SET_CAMERA_PRESET',
  SET_CAMERA_SENSOR_SIZE = 'SET_CAMERA_SENSOR_SIZE',

  SET_PRINCIPAL_POINT_MODE_1VP = 'SET_PRINCIPAL_POINT_MODE_1VP',
  SET_PRINCIPAL_POINT_MODE_2VP = 'SET_PRINCIPAL_POINT_MODE_2VP',
  SET_FIRST_VANISHING_POINT_AXIS = 'SET_FIRST_VANISHING_POINT_AXIS',
  SET_SECOND_VANISHING_POINT_AXIS = 'SET_SECOND_VANISHING_POINT_AXIS',

  SET_ABSOLUTE_FOCAL_LENGTH_1VP = 'SET_RELATIVE_FOCAL_LENGTH_1VP',

  // Control point actions
  SET_PRINCIPAL_POINT = 'SET_PRINCIPAL_POINT',
  SET_ORIGIN = 'SET_ORIGIN',
  SET_REFERENCE_DISTANCE_ANCHOR = 'SET_REFERENCE_DISTANCE_ANCHOR',
  ADJUST_HORIZON = 'ADJUST_HORIZON',
  ADJUST_FIRST_VANISHING_POINT = 'ADJUST_FIRST_VANISHING_POINT',
  ADJUST_SECOND_VANISHING_POINT = 'ADJUST_SECOND_VANISHING_POINT',
  ADJUST_THIRD_VANISHING_POINT = 'ADJUST_THIRD_VANISHING_POINT',
  ADJUST_REFERENCE_DISTANCE_HANDLE = 'ADJUST_REFERENCE_DISTANCE_HANDLE',
  SET_VANISHING_POINT_LINE_COUNT = 'SET_VANISHING_POINT_LINE_COUNT',
  SET_VANISHING_POINT_LINE = 'SET_VANISHING_POINT_LINE',
  SET_SNAP_TO_EDGES = 'SET_SNAP_TO_EDGES',
  SET_LENS_DISTORTION_GUIDE_ENABLED = 'SET_LENS_DISTORTION_GUIDE_ENABLED',
  ADJUST_LENS_DISTORTION_GUIDE = 'ADJUST_LENS_DISTORTION_GUIDE',

  //
  SET_SOLVER_RESULT = 'SET_SOLVER_RESULT',

  // Result display settings
  SET_ORIENTATION_DISPLAY_FORMAT = 'SET_ORIENTATION_DISPLAY_FORMAT',
  SET_PRINCIPAL_POINT_DISPLAY_FORMAT = 'SET_PRINCIPAL_POINT_DISPLAY_FORMAT',
  SET_FOV_DISPLAY_FORMAT = 'SET_FOV_DISPLAY_FORMAT',
  SET_DISPLAY_ABSOLUTE_FOCAL_LENGTH = 'SET_DISPLAY_ABSOLUTE_FOCAL_LENGTH',
  SET_SIDE_PANEL_VISIBILITY = 'SET_SIDE_PANEL_VISIBILITY'
}

export function recalculateCalibrationResult(): ThunkAction<void, StoreState, void, AppAction> {
  return (dispatch: ThunkDispatch<StoreState, void, AppAction>, getState: () => StoreState) => {
    setTimeout(() => {
      let state = getState()

      let result1VP = Solver.solve1VP(
        state.calibrationSettingsBase,
        state.calibrationSettings1VP,
        state.controlPointsStateBase,
        state.controlPointsState1VP,
        state.image
      )
      let result2VP = Solver.solve2VP(
        state.calibrationSettingsBase,
        state.calibrationSettings2VP,
        state.controlPointsStateBase,
        state.controlPointsState2VP,
        state.image
      )

      let is1VPMode = state.globalSettings.calibrationMode == CalibrationMode.OneVanishingPoint
      let result = is1VPMode ? result1VP : result2VP
      result.checks = analyse(state, result)
      dispatch(setSolverResult(result))
    },
    0)
  }
}

//
export interface LoadDefaultState {
  type: ActionTypes.LOAD_DEFAULT_STATE
}

export function loadDefaultState(): LoadDefaultState {
  return {
    type: ActionTypes.LOAD_DEFAULT_STATE
  }
}

//
export interface LoadState {
  type: ActionTypes.LOAD_STATE,
  savedState: SavedState,
  imageState: ImageState,
  projectFilePath: string,
  isExampleProject: boolean
}

export function loadState(
  savedState: SavedState,
  imageState: ImageState,
  projectFilePath: string,
  isExampleProject: boolean
): LoadState {
  return {
    type: ActionTypes.LOAD_STATE,
    savedState: savedState,
    imageState: imageState,
    projectFilePath: projectFilePath,
    isExampleProject: isExampleProject
  }
}

//
export interface SetProjectHasUnsavedChanged {
  type: ActionTypes.SET_PROJECT_HAS_UNSAVED_CHANGES
}

export function setProjectHasUnsavedChanges(): SetProjectHasUnsavedChanged {
  return {
    type: ActionTypes.SET_PROJECT_HAS_UNSAVED_CHANGES
  }
}

//
export interface SetProjectFilePath {
  type: ActionTypes.SET_PROJECT_FILE_PATH
  projectFilePath: string
}

export function setProjectFilePath(projectFilePath: string): SetProjectFilePath {
  return {
    type: ActionTypes.SET_PROJECT_FILE_PATH,
    projectFilePath: projectFilePath
  }
}

// Set active calibration mode
export interface SetCalibrationMode {
  type: ActionTypes.SET_CALIBRATION_MODE
  calibrationMode: CalibrationMode
}

export function setCalibrationMode(calibrationMode: CalibrationMode): SetCalibrationMode {
  return {
    type: ActionTypes.SET_CALIBRATION_MODE,
    calibrationMode: calibrationMode
  }
}

// Set image opacity
export interface SetImageOpacity {
  type: ActionTypes.SET_IMAGE_OPACITY
  opacity: number
}

export function setImageOpacity(opacity: number): SetImageOpacity {
  return {
    type: ActionTypes.SET_IMAGE_OPACITY,
    opacity: opacity
  }
}

// Set overlay 3D guide type
export interface SetOverlay3DGuide {
  type: ActionTypes.SET_OVERLAY_3D_GUIDE
  overlay3DGuide: Overlay3DGuide
}

export function setOverlay3DGuide(overlay3DGuide: Overlay3DGuide): SetOverlay3DGuide {
  return {
    type: ActionTypes.SET_OVERLAY_3D_GUIDE,
    overlay3DGuide: overlay3DGuide
  }
}

//
export interface SetImage {
  type: ActionTypes.SET_IMAGE
  url: string
  data: Buffer
  width: number
  height: number
}
export function setImage(url: string, data: Buffer, width: number, height: number): SetImage {
  return {
    type: ActionTypes.SET_IMAGE,
    url: url,
    data: data,
    width: width,
    height: height
  }
}

//
export interface SetQuadModeEnabled {
  type: ActionTypes.SET_QUAD_MODE_ENABLED
  quadModeEnabled: boolean
}

export function setQuadModeEnabled(quadModeEnabled: boolean): SetQuadModeEnabled {
  return {
    type: ActionTypes.SET_QUAD_MODE_ENABLED,
    quadModeEnabled: quadModeEnabled
  }
}

//
export interface SetPrincipalPointMode1VP {
  type: ActionTypes.SET_PRINCIPAL_POINT_MODE_1VP
  principalPointMode: PrincipalPointMode1VP
}

export function setPrincipalPointMode1VP(principalPointMode: PrincipalPointMode1VP): SetPrincipalPointMode1VP {
  return {
    type: ActionTypes.SET_PRINCIPAL_POINT_MODE_1VP,
    principalPointMode: principalPointMode
  }
}

//
export interface SetPrincipalPointMode2VP {
  type: ActionTypes.SET_PRINCIPAL_POINT_MODE_2VP
  principalPointMode: PrincipalPointMode2VP
}

export function setPrincipalPointMode2VP(principalPointMode: PrincipalPointMode2VP): SetPrincipalPointMode2VP {
  return {
    type: ActionTypes.SET_PRINCIPAL_POINT_MODE_2VP,
    principalPointMode: principalPointMode
  }
}

//
export interface SetFirstVanishingPointAxis {
  type: ActionTypes.SET_FIRST_VANISHING_POINT_AXIS
  axis: Axis
}

export function setFirstVanishingPointAxis(axis: Axis): SetFirstVanishingPointAxis {
  return {
    type: ActionTypes.SET_FIRST_VANISHING_POINT_AXIS,
    axis: axis
  }
}

//
export interface SetSecondVanishingPointAxis {
  type: ActionTypes.SET_SECOND_VANISHING_POINT_AXIS,
  axis: Axis
}

export function setSecondVanishingPointAxis(axis: Axis): SetSecondVanishingPointAxis {
  return {
    type: ActionTypes.SET_SECOND_VANISHING_POINT_AXIS,
    axis: axis
  }
}

//

export interface SetAbsoluteFocalLength1VP {
  type: ActionTypes.SET_ABSOLUTE_FOCAL_LENGTH_1VP,
  absoluteFocalLength: number
}

export function setAbsoluteFocalLength1VP(absoluteFocalLength: number): SetAbsoluteFocalLength1VP {
  return {
    type: ActionTypes.SET_ABSOLUTE_FOCAL_LENGTH_1VP,
    absoluteFocalLength: absoluteFocalLength
  }
}

//
export interface SetReferenceDistance {
  type: ActionTypes.SET_REFERENCE_DISTANCE,
  distance: number
}

export function setReferenceDistance(distance: number): SetReferenceDistance {
  return {
    type: ActionTypes.SET_REFERENCE_DISTANCE,
    distance: distance
  }
}

//
export interface SetReferenceDistanceUnit {
  type: ActionTypes.SET_REFERENCE_DISTANCE_UNIT,
  unit: ReferenceDistanceUnit
}

export function setReferenceDistanceUnit(unit: ReferenceDistanceUnit): SetReferenceDistanceUnit {
  return {
    type: ActionTypes.SET_REFERENCE_DISTANCE_UNIT,
    unit: unit
  }
}

//
export interface SetReferenceDistanceAxis {
  type: ActionTypes.SET_REFERENCE_DISTANCE_AXIS,
  axis: Axis | null
}

export function setReferenceDistanceAxis(axis: Axis | null): SetReferenceDistanceAxis {
  return {
    type: ActionTypes.SET_REFERENCE_DISTANCE_AXIS,
    axis: axis
  }
}

//
export interface SetCameraPreset {
  type: ActionTypes.SET_CAMERA_PRESET,
  cameraPresetId: string | null
}

export function setCameraPreset(cameraPresetId: string | null): SetCameraPreset {
  return {
    type: ActionTypes.SET_CAMERA_PRESET,
    cameraPresetId: cameraPresetId
  }
}

//
export interface SetCameraSensorSize {
  type: ActionTypes.SET_CAMERA_SENSOR_SIZE,
  width: number | undefined
  height: number | undefined
}

export function setCameraSensorSize(width: number | undefined, height: number | undefined): SetCameraSensorSize {
  return {
    type: ActionTypes.SET_CAMERA_SENSOR_SIZE,
    width: width,
    height: height
  }
}

// Set principal point
export interface SetPrincipalPoint {
  type: ActionTypes.SET_PRINCIPAL_POINT
  position: Point2D
}

export function setPrincipalPoint(position: Point2D): SetPrincipalPoint {
  return {
    type: ActionTypes.SET_PRINCIPAL_POINT,
    position: position
  }
}

// Set origin
export interface SetOrigin {
  type: ActionTypes.SET_ORIGIN
  position: Point2D
}

export function setOrigin(position: Point2D): SetOrigin {
  return {
    type: ActionTypes.SET_ORIGIN,
    position: position
  }
}

// Set reference distance anchor
export interface SetReferenceDistanceAnchor {
  type: ActionTypes.SET_REFERENCE_DISTANCE_ANCHOR
  position: Point2D
}

export function setReferenceDistanceAnchor(position: Point2D): SetReferenceDistanceAnchor {
  return {
    type: ActionTypes.SET_REFERENCE_DISTANCE_ANCHOR,
    position: position
  }
}

// Adjust horizon (i.e set the position one endpoint of the horizon line)
export interface AdjustHorizon {
  type: ActionTypes.ADJUST_HORIZON,
  controlPointIndex: ControlPointPairIndex,
  position: Point2D
}

export function adjustHorizon(
  controlPointIndex: ControlPointPairIndex,
  position: Point2D
): AdjustHorizon {
  return {
    type: ActionTypes.ADJUST_HORIZON,
    controlPointIndex: controlPointIndex,
    position: position
  }
}

//
export interface AdjustFirstVanishingPoint {
  type: ActionTypes.ADJUST_FIRST_VANISHING_POINT,
  lineSegmentIndex: number,
  controlPointIndex: ControlPointPairIndex,
  position: Point2D
}

export function adjustFirstVanishingPoint(
  lineSegmentIndex: number,
  controlPointIndex: ControlPointPairIndex,
  position: Point2D
): AdjustFirstVanishingPoint {
  return {
    type: ActionTypes.ADJUST_FIRST_VANISHING_POINT,
    lineSegmentIndex: lineSegmentIndex,
    controlPointIndex: controlPointIndex,
    position: position
  }
}

//
export interface AdjustSecondVanishingPoint {
  type: ActionTypes.ADJUST_SECOND_VANISHING_POINT
  lineSegmentIndex: number
  controlPointIndex: ControlPointPairIndex
  position: Point2D
}

export function adjustSecondVanishingPoint(
  lineSegmentIndex: number,
  controlPointIndex: ControlPointPairIndex,
  position: Point2D
): AdjustSecondVanishingPoint {
  return {
    type: ActionTypes.ADJUST_SECOND_VANISHING_POINT,
    lineSegmentIndex: lineSegmentIndex,
    controlPointIndex: controlPointIndex,
    position: position
  }
}

//
export interface AdjustThirdVanishingPoint {
  type: ActionTypes.ADJUST_THIRD_VANISHING_POINT
  lineSegmentIndex: number
  controlPointIndex: ControlPointPairIndex
  position: Point2D
}

export function adjustThirdVanishingPoint(
  lineSegmentIndex: number,
  controlPointIndex: ControlPointPairIndex,
  position: Point2D
): AdjustThirdVanishingPoint {
  return {
    type: ActionTypes.ADJUST_THIRD_VANISHING_POINT,
    lineSegmentIndex: lineSegmentIndex,
    controlPointIndex: controlPointIndex,
    position: position
  }
}

//

export interface AdjustReferenceDistanceHandle {
  type: ActionTypes.ADJUST_REFERENCE_DISTANCE_HANDLE,
  handleIndex: number,
  position: number
}

export function adjustReferenceDistanceHandle(
  handleIndex: number,
  position: number
): AdjustReferenceDistanceHandle {
  return {
    type: ActionTypes.ADJUST_REFERENCE_DISTANCE_HANDLE,
    handleIndex: handleIndex,
    position: position
  }
}

// Set calibration result
export interface SetSolverResult {
  type: ActionTypes.SET_SOLVER_RESULT,
  result: SolverResult
}

export interface SetVanishingPointLineCount {
  type: ActionTypes.SET_VANISHING_POINT_LINE_COUNT
  /** 0, 1 or 2 for the first, second or third vanishing point */
  vanishingPointIndex: number
  lineCount: number
}

export function setVanishingPointLineCount(vanishingPointIndex: number, lineCount: number): SetVanishingPointLineCount {
  return {
    type: ActionTypes.SET_VANISHING_POINT_LINE_COUNT,
    vanishingPointIndex: vanishingPointIndex,
    lineCount: lineCount
  }
}

// Replaces one line segment of a vanishing point control, e.g after snapping it to an edge
export interface SetVanishingPointLine {
  type: ActionTypes.SET_VANISHING_POINT_LINE
  /** 0, 1 or 2 for the first, second or third vanishing point */
  vanishingPointIndex: number
  lineSegmentIndex: number
  lineSegment: [Point2D, Point2D]
}

export function setVanishingPointLine(
  vanishingPointIndex: number,
  lineSegmentIndex: number,
  lineSegment: [Point2D, Point2D]
): SetVanishingPointLine {
  return {
    type: ActionTypes.SET_VANISHING_POINT_LINE,
    vanishingPointIndex: vanishingPointIndex,
    lineSegmentIndex: lineSegmentIndex,
    lineSegment: lineSegment
  }
}

// How far, in edge map pixels, an end point of a line may move when the line snaps to an edge.
// The edge map is up to 2048 pixels wide, so this is about six pixels on screen.
const EDGE_SNAP_SEARCH_RADIUS = 12

/**
 * Moves a line of a vanishing point control onto the nearest
 * image edge, if snapping is turned on and there is an edge nearby
 */
export function snapVanishingPointLineToEdge(
  vanishingPointIndex: number,
  lineSegmentIndex: number
): ThunkAction<void, StoreState, void, AppAction> {
  return (dispatch: ThunkDispatch<StoreState, void, AppAction>, getState: () => StoreState) => {
    const imageUrl = getState().image.url
    if (!getState().globalSettings.snapToEdges || imageUrl === null) {
      return
    }
    loadEdgeMap(imageUrl).then((edgeMap) => {
      const state = getState()
      const controlStates = [
        state.controlPointsStateBase.firstVanishingPoint,
        state.controlPointsState2VP.secondVanishingPoint,
        state.controlPointsState2VP.thirdVanishingPoint
      ]
      const lineSegment = controlStates[vanishingPointIndex].lineSegments[lineSegmentIndex]
      if (state.image.url !== imageUrl || !lineSegment) {
        return
      }
      const snapped = snapSegmentToEdge(
        edgeMap,
        { x: lineSegment[0].x * edgeMap.width, y: lineSegment[0].y * edgeMap.height },
        { x: lineSegment[1].x * edgeMap.width, y: lineSegment[1].y * edgeMap.height },
        EDGE_SNAP_SEARCH_RADIUS
      )
      if (snapped) {
        dispatch(setVanishingPointLine(vanishingPointIndex, lineSegmentIndex, [
          { x: snapped[0].x / edgeMap.width, y: snapped[0].y / edgeMap.height },
          { x: snapped[1].x / edgeMap.width, y: snapped[1].y / edgeMap.height }
        ]))
      }
    }).catch((_) => {
      // Without pixels to look at, the line stays where it was put
    })
  }
}

export interface SetSnapToEdges {
  type: ActionTypes.SET_SNAP_TO_EDGES
  enabled: boolean
}

export function setSnapToEdges(enabled: boolean): SetSnapToEdges {
  return {
    type: ActionTypes.SET_SNAP_TO_EDGES,
    enabled: enabled
  }
}

export interface SetLensDistortionGuideEnabled {
  type: ActionTypes.SET_LENS_DISTORTION_GUIDE_ENABLED
  enabled: boolean
}

export function setLensDistortionGuideEnabled(enabled: boolean): SetLensDistortionGuideEnabled {
  return {
    type: ActionTypes.SET_LENS_DISTORTION_GUIDE_ENABLED,
    enabled: enabled
  }
}

export interface AdjustLensDistortionGuide {
  type: ActionTypes.ADJUST_LENS_DISTORTION_GUIDE
  pointIndex: number
  position: Point2D
}

export function adjustLensDistortionGuide(pointIndex: number, position: Point2D): AdjustLensDistortionGuide {
  return {
    type: ActionTypes.ADJUST_LENS_DISTORTION_GUIDE,
    pointIndex: pointIndex,
    position: position
  }
}

export function setSolverResult(result: SolverResult): SetSolverResult {
  return {
    type: ActionTypes.SET_SOLVER_RESULT,
    result: result
  }
}

// Result display settings
export interface SetOrientationDisplayFormat {
  type: ActionTypes.SET_ORIENTATION_DISPLAY_FORMAT,
  displayFormat: OrientationFormat
}

export function setOrientationDisplayFormat(displayFormat: OrientationFormat): SetOrientationDisplayFormat {
  return {
    type: ActionTypes.SET_ORIENTATION_DISPLAY_FORMAT,
    displayFormat: displayFormat
  }
}

export interface SetPrincipalPointDisplayFormat {
  type: ActionTypes.SET_PRINCIPAL_POINT_DISPLAY_FORMAT,
  displayFormat: PrincipalPointFormat
}

export function setPrincipalPointDisplayFormat(displayFormat: PrincipalPointFormat): SetPrincipalPointDisplayFormat {
  return {
    type: ActionTypes.SET_PRINCIPAL_POINT_DISPLAY_FORMAT,
    displayFormat: displayFormat
  }
}

export interface SetFieldOfViewDisplayFormat {
  type: ActionTypes.SET_FOV_DISPLAY_FORMAT,
  displayFormat: FieldOfViewFormat
}

export function setFieldOfViewDisplayFormat(displayFormat: FieldOfViewFormat): SetFieldOfViewDisplayFormat {
  return {
    type: ActionTypes.SET_FOV_DISPLAY_FORMAT,
    displayFormat: displayFormat
  }
}

export interface SetDisplayAbsoluteFocalLength {
  type: ActionTypes.SET_DISPLAY_ABSOLUTE_FOCAL_LENGTH,
  displayAbsoluteFocalLength: boolean
}

export function SetDisplayAbsoluteFocalLength(displayAbsoluteFocalLength: boolean): SetDisplayAbsoluteFocalLength {
  return {
    type: ActionTypes.SET_DISPLAY_ABSOLUTE_FOCAL_LENGTH,
    displayAbsoluteFocalLength: displayAbsoluteFocalLength
  }
}

export interface SetSidePanelVisibility {
  type: ActionTypes.SET_SIDE_PANEL_VISIBILITY,
  panelsAreVisible: boolean
}

export function setSidePanelVisibility(panelsAreVisible: boolean): SetSidePanelVisibility {
  return {
    type: ActionTypes.SET_SIDE_PANEL_VISIBILITY,
    panelsAreVisible: panelsAreVisible
  }
}

// Define a type covering all actions
export type AppAction =
  LoadState |
  LoadDefaultState |
  SetProjectFilePath |
  SetProjectHasUnsavedChanged |
  SetCalibrationMode |
  SetImageOpacity |
  SetOverlay3DGuide |
  SetImage |
  SetQuadModeEnabled |
  SetPrincipalPointMode1VP |
  SetPrincipalPointMode2VP |
  SetFirstVanishingPointAxis |
  SetSecondVanishingPointAxis |
  SetAbsoluteFocalLength1VP |
  SetReferenceDistanceAxis |
  SetReferenceDistanceUnit |
  SetCameraPreset |
  SetCameraSensorSize |
  SetReferenceDistance |
  SetOrigin |
  SetReferenceDistanceAnchor |
  SetPrincipalPoint |
  AdjustHorizon |
  AdjustReferenceDistanceHandle |
  AdjustFirstVanishingPoint |
  AdjustSecondVanishingPoint |
  AdjustThirdVanishingPoint |
  SetVanishingPointLineCount |
  SetVanishingPointLine |
  SetSnapToEdges |
  SetLensDistortionGuideEnabled |
  AdjustLensDistortionGuide |
  SetSolverResult |
  SetOrientationDisplayFormat |
  SetFieldOfViewDisplayFormat |
  SetPrincipalPointDisplayFormat |
  SetDisplayAbsoluteFocalLength |
  SetSidePanelVisibility

// A list of action types that trigger calibration result calculation
export const actionTypesTriggeringRecalculation: ActionTypes[] = [
  ActionTypes.LOAD_DEFAULT_STATE,
  ActionTypes.LOAD_STATE,

  ActionTypes.SET_IMAGE,
  ActionTypes.SET_CALIBRATION_MODE,

  ActionTypes.SET_QUAD_MODE_ENABLED,
  ActionTypes.SET_REFERENCE_DISTANCE,
  ActionTypes.SET_REFERENCE_DISTANCE_UNIT,
  ActionTypes.SET_REFERENCE_DISTANCE_AXIS,
  ActionTypes.SET_CAMERA_PRESET,
  ActionTypes.SET_CAMERA_SENSOR_SIZE,

  ActionTypes.SET_PRINCIPAL_POINT_MODE_1VP,
  ActionTypes.SET_PRINCIPAL_POINT_MODE_2VP,
  ActionTypes.SET_FIRST_VANISHING_POINT_AXIS,
  ActionTypes.SET_SECOND_VANISHING_POINT_AXIS,

  ActionTypes.SET_ABSOLUTE_FOCAL_LENGTH_1VP,
  ActionTypes.SET_PRINCIPAL_POINT,
  ActionTypes.SET_ORIGIN,
  ActionTypes.SET_REFERENCE_DISTANCE_ANCHOR,
  ActionTypes.ADJUST_HORIZON,
  ActionTypes.ADJUST_FIRST_VANISHING_POINT,
  ActionTypes.ADJUST_SECOND_VANISHING_POINT,
  ActionTypes.ADJUST_THIRD_VANISHING_POINT,
  ActionTypes.ADJUST_REFERENCE_DISTANCE_HANDLE,
  ActionTypes.SET_VANISHING_POINT_LINE_COUNT,
  ActionTypes.SET_VANISHING_POINT_LINE,
  ActionTypes.SET_LENS_DISTORTION_GUIDE_ENABLED,
  ActionTypes.ADJUST_LENS_DISTORTION_GUIDE
]

export const actionTypesSettingNeedsSaveFlag: ActionTypes[] = [
  ActionTypes.SET_CALIBRATION_MODE,
  ActionTypes.SET_IMAGE_OPACITY,
  ActionTypes.SET_OVERLAY_3D_GUIDE,

  ActionTypes.SET_IMAGE,

  ActionTypes.SET_QUAD_MODE_ENABLED,
  ActionTypes.SET_REFERENCE_DISTANCE,
  ActionTypes.SET_REFERENCE_DISTANCE_UNIT,
  ActionTypes.SET_REFERENCE_DISTANCE_AXIS,
  ActionTypes.SET_CAMERA_PRESET,
  ActionTypes.SET_CAMERA_SENSOR_SIZE,

  ActionTypes.SET_PRINCIPAL_POINT_MODE_1VP,
  ActionTypes.SET_PRINCIPAL_POINT_MODE_2VP,
  ActionTypes.SET_FIRST_VANISHING_POINT_AXIS,
  ActionTypes.SET_SECOND_VANISHING_POINT_AXIS,

  ActionTypes.SET_ABSOLUTE_FOCAL_LENGTH_1VP,

  ActionTypes.SET_PRINCIPAL_POINT,
  ActionTypes.SET_ORIGIN,
  ActionTypes.SET_REFERENCE_DISTANCE_ANCHOR,
  ActionTypes.ADJUST_HORIZON,
  ActionTypes.ADJUST_FIRST_VANISHING_POINT,
  ActionTypes.ADJUST_SECOND_VANISHING_POINT,
  ActionTypes.ADJUST_THIRD_VANISHING_POINT,
  ActionTypes.ADJUST_REFERENCE_DISTANCE_HANDLE,
  ActionTypes.SET_VANISHING_POINT_LINE_COUNT,
  ActionTypes.SET_VANISHING_POINT_LINE,
  ActionTypes.SET_SNAP_TO_EDGES,
  ActionTypes.SET_LENS_DISTORTION_GUIDE_ENABLED,
  ActionTypes.ADJUST_LENS_DISTORTION_GUIDE,

  ActionTypes.SET_PRINCIPAL_POINT_DISPLAY_FORMAT,
  ActionTypes.SET_FOV_DISPLAY_FORMAT,
  ActionTypes.SET_ORIENTATION_DISPLAY_FORMAT,
  ActionTypes.SET_DISPLAY_ABSOLUTE_FOCAL_LENGTH
]
