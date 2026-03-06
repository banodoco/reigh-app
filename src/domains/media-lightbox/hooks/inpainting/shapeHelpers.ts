/**
 * Pure geometry functions for shape manipulation.
 * These are not hooks - just utility functions for hit testing and geometry calculations.
 */

import type { BrushStroke } from './types';

/**
 * Get the 4 corners of a rectangle (handles both 2-point and 4-point forms)
 */
export function getRectangleCorners(stroke: BrushStroke): Array<{ x: number; y: number }> {
  if (stroke.isFreeForm && stroke.points.length === 4) {
    // Free-form quadrilateral - return points as-is
    return stroke.points;
  }

  // Standard rectangle - calculate 4 corners from 2 points
  const startPoint = stroke.points[0];
  const endPoint = stroke.points[stroke.points.length - 1];

  const minX = Math.min(startPoint.x, endPoint.x);
  const maxX = Math.max(startPoint.x, endPoint.x);
  const minY = Math.min(startPoint.y, endPoint.y);
  const maxY = Math.max(startPoint.y, endPoint.y);

  return [
    { x: minX, y: minY }, // top-left (0)
    { x: maxX, y: minY }, // top-right (1)
    { x: maxX, y: maxY }, // bottom-right (2)
    { x: minX, y: maxY }  // bottom-left (3)
  ];
}

/**
 * Check if a point is near/inside a shape
 */
export function isPointOnShape(
  x: number,
  y: number,
  stroke: BrushStroke,
  threshold: number = 15
): boolean {
  if (!stroke.shapeType || stroke.shapeType === 'line') return false;

  if (stroke.shapeType === 'rectangle') {
    // For free-form rectangles, calculate bounding box from all corners
    if (stroke.isFreeForm && stroke.points.length === 4) {
      const minX = Math.min(...stroke.points.map(p => p.x));
      const maxX = Math.max(...stroke.points.map(p => p.x));
      const minY = Math.min(...stroke.points.map(p => p.y));
      const maxY = Math.max(...stroke.points.map(p => p.y));

      return x >= minX - threshold && x <= maxX + threshold &&
             y >= minY - threshold && y <= maxY + threshold;
    }

    // Standard rectangle - use first and last points
    const startPoint = stroke.points[0];
    const endPoint = stroke.points[stroke.points.length - 1];
    const minX = Math.min(startPoint.x, endPoint.x);
    const maxX = Math.max(startPoint.x, endPoint.x);
    const minY = Math.min(startPoint.y, endPoint.y);
    const maxY = Math.max(startPoint.y, endPoint.y);

    // Check if point is inside the rectangle (with threshold for easier selection)
    return x >= minX - threshold && x <= maxX + threshold &&
           y >= minY - threshold && y <= maxY + threshold;
  }

  return false;
}

/**
 * Get which corner index is clicked (returns 0-3 or null)
 */
export function getClickedCornerIndex(
  x: number,
  y: number,
  stroke: BrushStroke,
  threshold: number = 15
): number | null {
  if (stroke.shapeType !== 'rectangle') return null;

  const corners = getRectangleCorners(stroke);

  for (let i = 0; i < corners.length; i++) {
    const dist = Math.hypot(x - corners[i].x, y - corners[i].y);
    if (dist <= threshold) {
      return i;
    }
  }

  return null;
}

/**
 * Detect if click is on edge or corner of rectangle
 * Returns 'corner' for resizing, 'edge' for moving, null if neither
 */
export function getRectangleClickType(
  x: number,
  y: number,
  stroke: BrushStroke,
  threshold: number = 15
): 'corner' | 'edge' | null {
  if (stroke.shapeType !== 'rectangle') return null;

  // Check corners first
  if (getClickedCornerIndex(x, y, stroke, threshold) !== null) {
    return 'corner';
  }

  // Check edges
  const corners = getRectangleCorners(stroke);
  const minX = Math.min(...corners.map(c => c.x));
  const maxX = Math.max(...corners.map(c => c.x));
  const minY = Math.min(...corners.map(c => c.y));
  const maxY = Math.max(...corners.map(c => c.y));

  const onLeftEdge = Math.abs(x - minX) <= threshold && y >= minY - threshold && y <= maxY + threshold;
  const onRightEdge = Math.abs(x - maxX) <= threshold && y >= minY - threshold && y <= maxY + threshold;
  const onTopEdge = Math.abs(y - minY) <= threshold && x >= minX - threshold && x <= maxX + threshold;
  const onBottomEdge = Math.abs(y - maxY) <= threshold && x >= minX - threshold && x <= maxX + threshold;

  if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
    return 'edge';
  }

  return null;
}
