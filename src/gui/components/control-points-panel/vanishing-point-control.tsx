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

import * as React from 'react'
import ControlPolyline from './control-polyline'
import ControlPoint from './control-point'
import { Group } from 'react-konva'
import { VanishingPointControlState } from '../../types/control-points-state'
import Point2D from '../../solver/point-2d'
import MathUtil from '../../solver/math-util'

interface VanishingPointControlProps {
  hideControlPoints?: boolean
  color: string
  controlState: VanishingPointControlState
  vanishingPoint: Point2D | null
  vanishingPointIndex: number
  onControlPointDrag(
    lineSegmentIndex: number,
    pointPairIndex: number,
    position: Point2D
  ): void
  /** Called when a control point of a line segment is released */
  onLineDragEnd?(lineSegmentIndex: number): void
}

export default class VanishingPointControl extends React.PureComponent<VanishingPointControlProps> {
  render() {
    return (
      <Group>
        {this.renderVanishingPoint()}
        {this.props.controlState.lineSegments.map((_, index) => this.renderLineSegment(index))}
      </Group>
    )
  }

  private renderLineSegment(index: number) {
    const onDragEnd = () => {
      if (this.props.onLineDragEnd) {
        this.props.onLineDragEnd(index)
      }
    }
    return (
      <Group key={index}>
        <ControlPolyline
          number={this.props.vanishingPointIndex + 1}
          points={this.props.controlState.lineSegments[index]}
          color={this.props.color}
        />
        <ControlPoint
          hidden={this.props.hideControlPoints}
          absolutePosition={this.props.controlState.lineSegments[index][0]}
          onControlPointDrag={(position: Point2D) => {
            this.props.onControlPointDrag(index, 0, position)
          }}
          onControlPointDragEnd={onDragEnd}
          fill={this.props.color}
        />
        <ControlPoint
          hidden={this.props.hideControlPoints}
          absolutePosition={this.props.controlState.lineSegments[index][1]}
          onControlPointDrag={(position: Point2D) => {
            this.props.onControlPointDrag(index, 1, position)
          }}
          onControlPointDragEnd={onDragEnd}
          fill={this.props.color}
        />
      </Group>
    )
  }

  private renderVanishingPoint() {
    const vanishingPoint = this.props.vanishingPoint
    if (!vanishingPoint) {
      return null
    }

    // A dimmed line from the middle of each line segment to the vanishing point
    return (
      <Group>
        {this.props.controlState.lineSegments.map((segment, index) => (
          <ControlPolyline
            key={index}
            color={this.props.color}
            dimmed={true}
            points={[MathUtil.lineSegmentMidpoint(segment as [Point2D, Point2D]), vanishingPoint]}
          />
        ))}
      </Group>
    )
  }
}
