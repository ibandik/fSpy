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

import Point2D from './point-2d'
import Vector3D from './vector-3d'
import Transform from './transform'

export default class MathUtil {

  static normalized(vector: Point2D): Point2D {
    let l = this.distance({ x: 0, y: 0 }, vector)
    if (l != 0) {
      return {
        x: vector.x / l,
        y: vector.y / l
      }
    }

    // zero length vector. really undefined, but return something anyway
    return {
      x: 0,
      y: 0
    }
  }

  static dot(a: Point2D, b: Point2D): number {
    return a.x * b.x + a.y * b.y
  }

  static difference(a: Point2D, b: Point2D): Point2D {
    return {
      x: a.x - b.x,
      y: a.y - b.y
    }
  }

  static distance(a: Point2D, b: Point2D): number {
    let dx = a.x - b.x
    let dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  static lineSegmentMidpoint(segment: [Point2D, Point2D]): Point2D {
    return {
      x: 0.5 * (segment[0].x + segment[1].x),
      y: 0.5 * (segment[0].y + segment[1].y)
    }
  }

  static lineIntersection(line1: [Point2D, Point2D], line2: [Point2D, Point2D]): Point2D | null {
    let d1 = this.distance(line1[0], line1[1])
    let d2 = this.distance(line2[0], line2[1])

    let epsilon = 1e-8
    if (Math.abs(d1) < epsilon || Math.abs(d2) < epsilon) {
      return null
    }

    // https://en.wikipedia.org/wiki/Line–line_intersection
    let x1 = line1[0].x
    let y1 = line1[0].y

    let x2 = line1[1].x
    let y2 = line1[1].y

    let x3 = line2[0].x
    let y3 = line2[0].y

    let x4 = line2[1].x
    let y4 = line2[1].y

    let denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if (Math.abs(denominator) < epsilon) {
      return null
    }

    return {
      x: ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denominator,
      y: ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denominator
    }
  }

  /**
   * Finds the point that a number of line segments point at. Two segments
   * give the intersection of their lines. For more, the result is the point
   * that fits all of them best: each segment is compared to the line from
   * its midpoint to the point, and the distances of the segment's end points
   * from that line are made as small as possible.
   * The coordinates must have the same scale in x and y, e.g pixels.
   * @returns the point and the root mean square of the end point distances,
   * or null if the segments are parallel or one of them has no length
   */
  static bestIntersection(lines: [Point2D, Point2D][]): { point: Point2D, rmsError: number } | null {
    if (lines.length < 2) {
      return null
    }
    if (lines.length == 2) {
      const intersection = this.lineIntersection(lines[0], lines[1])
      return intersection ? { point: intersection, rmsError: 0 } : null
    }

    const midpoints = lines.map((line) => this.lineSegmentMidpoint(line))
    const halfLengths = lines.map((line) => 0.5 * this.distance(line[0], line[1]))
    if (halfLengths.some((halfLength) => halfLength < 1e-8)) {
      return null
    }
    const normals = lines.map((line, i) => {
      return {
        x: -(line[1].y - line[0].y) / (2 * halfLengths[i]),
        y: (line[1].x - line[0].x) / (2 * halfLengths[i])
      }
    })

    // The end point distance of a segment is h * |n . (p - m)| / |p - m|, with
    // midpoint m, normal n and half length h. Without the division this is a
    // linear least squares problem, so solve that repeatedly with the division
    // by the current distance to the point as a weight.
    let point = { x: 0, y: 0 }
    let weights = lines.map(() => 1)
    let residuals = lines.map(() => 0)
    for (let iteration = 0; iteration < 10; iteration++) {
      let a11 = 0
      let a12 = 0
      let a22 = 0
      let b1 = 0
      let b2 = 0
      normals.forEach((normal, i) => {
        const offset = this.dot(normal, midpoints[i])
        a11 += weights[i] * normal.x * normal.x
        a12 += weights[i] * normal.x * normal.y
        a22 += weights[i] * normal.y * normal.y
        b1 += weights[i] * normal.x * offset
        b2 += weights[i] * normal.y * offset
      })
      const determinant = a11 * a22 - a12 * a12
      if (Math.abs(determinant) < 1e-12 * (a11 + a22) * (a11 + a22)) {
        // All segments are parallel
        return null
      }
      point = {
        x: (a22 * b1 - a12 * b2) / determinant,
        y: (a11 * b2 - a12 * b1) / determinant
      }
      normals.forEach((normal, i) => {
        const toPoint = this.difference(point, midpoints[i])
        const distance = Math.max(1e-8, Math.sqrt(this.dot(toPoint, toPoint)))
        weights[i] = (halfLengths[i] / distance) * (halfLengths[i] / distance)
        residuals[i] = halfLengths[i] * Math.abs(this.dot(normal, toPoint)) / distance
      })
    }

    const meanSquare = residuals.reduce((sum, residual) => sum + residual * residual, 0) / residuals.length
    return { point: point, rmsError: Math.sqrt(meanSquare) }
  }

  static triangleOrthoCenter(k: Point2D, l: Point2D, m: Point2D): Point2D {
    let a = k.x
    let b = k.y
    let c = l.x
    let d = l.y
    let e = m.x
    let f = m.y

    let N = b * c + d * e + f * a - c * f - b * e - a * d
    let x = ((d - f) * b * b + (f - b) * d * d + (b - d) * f * f + a * b * (c - e) + c * d * (e - a) + e * f * (a - c)) / N
    let y = ((e - c) * a * a + (a - e) * c * c + (c - a) * e * e + a * b * (f - d) + c * d * (b - f) + e * f * (d - b)) / N

    return {
      x: x, y: y
    }
  }

  static thirdTriangleVertex(firstVertex: Point2D, secondVertex: Point2D, orthocenter: Point2D): Point2D {
    let a = firstVertex
    let b = secondVertex
    let o = orthocenter

    // compute p, the orthogonal projection of the orthocenter onto the line through a and b
    let aToB = this.normalized({ x: b.x - a.x, y: b.y - a.y })
    let proj = this.dot(aToB, this.difference(o, a))
    let p = {
      x: a.x + proj * aToB.x,
      y: a.y + proj * aToB.y
    }

    // the vertex c can be expressed as p + hn, where n is orthogonal to ab.
    let n = { x: aToB.y, y: -aToB.x }
    let h = this.dot(this.difference(a, p), this.difference(o, b)) / (this.dot(n, this.difference(o, b)))

    return {
      x: p.x + h * n.x,
      y: p.y + h * n.y
    }
  }

  static linePlaneIntersection(
    p0: Vector3D, p1: Vector3D, p2: Vector3D, la: Vector3D, lb: Vector3D
  ): Vector3D {
    // https://en.wikipedia.org/wiki/Line–plane_intersection
    let p01 = p1.subtracted(p0)
    let p02 = p2.subtracted(p0)
    let lab = lb.subtracted(la)
    let numerator = (p01.cross(p02)).dot(la.subtracted(p0))
    let denominator = -(lab.dot(p01.cross(p02)))
    let t = numerator / denominator
    return new Vector3D(
      la.x + t * lab.x,
      la.y + t * lab.y,
      la.z + t * lab.z
    )
  }

  static shortestLineSegmentBetweenLines(p1: Vector3D, p2: Vector3D, p3: Vector3D, p4: Vector3D): [Vector3D, Vector3D] {
    // TODO: gracefully handle parallel lines
    // http://paulbourke.net/geometry/pointlineplane/

    function d(m: number, n: number, o: number, p: number): number {
      // dmnop = (xm - xn)(xo - xp) + (ym - yn)(yo - yp) + (zm - zn)(zo - zp)
      let allPoints = [p1, p2, p3, p4]
      let pm = allPoints[m - 1]
      let pn = allPoints[n - 1]
      let po = allPoints[o - 1]
      let pp = allPoints[p - 1]
      return (pm.x - pn.x) * (po.x - pp.x) + (pm.y - pn.y) * (po.y - pp.y) + (pm.z - pn.z) * (po.z - pp.z)
    }

    let muaNumerator = d(1, 3, 4, 3) * d(4, 3, 2, 1) - d(1, 3, 2, 1) * d(4, 3, 4, 3)
    let muaDenominator = d(2, 1, 2, 1) * d(4, 3, 4, 3) - d(4, 3, 2, 1) * d(4, 3, 2, 1)
    let mua = muaNumerator / muaDenominator
    let mub = (d(1, 3, 4, 3) + mua * d(4, 3, 2, 1)) / d(4, 3, 4, 3)

    return [
      new Vector3D(
        p1.x + mua * (p2.x - p1.x),
        p1.y + mua * (p2.y - p1.y),
        p1.z + mua * (p2.z - p1.z)
      ),
      new Vector3D(
        p3.x + mub * (p4.x - p3.x),
        p3.y + mub * (p4.y - p3.y),
        p3.z + mub * (p4.z - p3.z)
      )
    ]
  }

  static perspectiveUnproject(
    point: Vector3D,
    viewTransform: Transform,
    principalPoint: Point2D,
    horizontalFieldOfView: number
  ): Vector3D {
    let transform = this.modelViewProjection(
      viewTransform,
      principalPoint,
      horizontalFieldOfView
    ).inverted()
    return transform.transformedVector(point, true)
  }

  static perspectiveProject(
    point: Vector3D,
    viewTransform: Transform,
    principalPoint: Point2D,
    horizontalFieldOfView: number
  ): Point2D {
    let projected = this.modelViewProjection(
      viewTransform,
      principalPoint,
      horizontalFieldOfView
    ).transformedVector(
      point,
      true
    )
    return projected
  }

  static pointsAreOnTheSameSideOfLine(l1: Point2D, l2: Point2D, p1: Point2D, p2: Point2D): boolean {
    let lineDirection = {
      x: l2.x - l1.x,
      y: l2.y - l1.y
    }

    let lineNormal = {
      x: lineDirection.y,
      y: -lineDirection.x
    }

    let l1ToP1 = {
      x: p1.x - l1.x,
      y: p1.y - l1.y
    }

    let l1ToP2 = {
      x: p2.x - l1.x,
      y: p2.y - l1.y
    }

    let dot1 = l1ToP1.x * lineNormal.x + l1ToP1.y * lineNormal.y
    let dot2 = l1ToP2.x * lineNormal.x + l1ToP2.y * lineNormal.y

    return dot1 * dot2 > 0
  }

  static matrixToAxisAngle(transform: Transform): [number, number, number, number] {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToAngle/
    const m00 = transform.matrix[0][0]
    const m01 = transform.matrix[0][1]
    const m02 = transform.matrix[0][2]
    const m10 = transform.matrix[1][0]
    const m11 = transform.matrix[1][1]
    const m12 = transform.matrix[1][2]
    const m20 = transform.matrix[2][0]
    const m21 = transform.matrix[2][1]
    const m22 = transform.matrix[2][2]

    const x = (m21 - m12) / Math.sqrt((m21 - m12) * (m21 - m12) + (m02 - m20) * (m02 - m20) + (m10 - m01) * (m10 - m01))
    const y = (m02 - m20) / Math.sqrt((m21 - m12) * (m21 - m12) + (m02 - m20) * (m02 - m20) + (m10 - m01) * (m10 - m01))
    const z = (m10 - m01) / Math.sqrt((m21 - m12) * (m21 - m12) + (m02 - m20) * (m02 - m20) + (m10 - m01) * (m10 - m01))
    const angle = Math.acos((m00 + m11 + m22 - 1) / 2)

    return [x, y, z, angle]
  }

  static matrixToQuaternion(transform: Transform): [number, number, number, number] {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/
    const m00 = transform.matrix[0][0]
    const m01 = transform.matrix[0][1]
    const m02 = transform.matrix[0][2]
    const m10 = transform.matrix[1][0]
    const m11 = transform.matrix[1][1]
    const m12 = transform.matrix[1][2]
    const m20 = transform.matrix[2][0]
    const m21 = transform.matrix[2][1]
    const m22 = transform.matrix[2][2]

    const qw = Math.sqrt(1 + m00 + m11 + m22) / 2
    const qx = (m21 - m12) / (4 * qw)
    const qy = (m02 - m20) / (4 * qw)
    const qz = (m10 - m01) / (4 * qw)
    return [qx, qy, qz, qw]
  }

  private static modelViewProjection(
    viewTransform: Transform,
    principalPoint: Point2D,
    horizontalFieldOfView: number
  ): Transform {
    let s = 1 / Math.tan(0.5 * horizontalFieldOfView)
    let n = 0.01
    let f = 10
    let projectionTransform = Transform.fromMatrix([
      [s, 0, -principalPoint.x, 0],
      [0, s, -principalPoint.y, 0],
      [0, 0, -(f + n) / (f - n), -2 * f * n / (f - n)],
      [0, 0, -1, 0]
    ])
    return viewTransform.leftMultiplied(projectionTransform)
  }
}
