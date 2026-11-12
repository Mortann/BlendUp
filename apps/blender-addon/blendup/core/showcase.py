"""Shared, deterministic layout for generated scenes (Blender Z-up)."""
from __future__ import annotations

import math


def arrange(bounds, spacing=1.5, *, aspect_ratio=None, small_first=False):
    """Keep original scale; center each footprint and put its lowest point on the floor."""
    spacing = max(0.1, float(spacing))
    if not bounds:
        return [], _floor_size(4.0, 4.0, aspect_ratio)
    if aspect_ratio is not None or small_first:
        return _arrange_rows(bounds, spacing, aspect_ratio, small_first)
    columns = max(1, math.ceil(math.sqrt(len(bounds))))
    rows = math.ceil(len(bounds) / columns)
    widths = [0.0] * columns
    depths = [0.0] * rows
    for i, (low, high) in enumerate(bounds):
        widths[i % columns] = max(widths[i % columns], high[0] - low[0], 0.25)
        depths[i // columns] = max(depths[i // columns], high[1] - low[1], 0.25)
    total_x = sum(widths) + spacing * (columns + 1)
    total_y = sum(depths) + spacing * (rows + 1)
    centers_x, centers_y = [], []
    x, y = -total_x / 2 + spacing, -total_y / 2 + spacing
    for width in widths:
        centers_x.append(x + width / 2)
        x += width + spacing
    for depth in depths:
        centers_y.append(y + depth / 2)
        y += depth + spacing
    offsets = []
    for i, (low, high) in enumerate(bounds):
        offsets.append((centers_x[i % columns] - (low[0] + high[0]) / 2,
                        centers_y[i // columns] - (low[1] + high[1]) / 2, -low[2]))
    return offsets, (max(4.0, total_x), max(4.0, total_y))


def _floor_size(width, depth, aspect_ratio):
    width, depth = max(4.0, width), max(4.0, depth)
    if aspect_ratio is None:
        return width, depth
    depth = max(depth, width / aspect_ratio)
    return depth * aspect_ratio, depth


def _arrange_rows(bounds, spacing, aspect_ratio, small_first):
    footprints = [(max(high[0] - low[0], 0.25), max(high[1] - low[1], 0.25)) for low, high in bounds]
    indices = list(range(len(bounds)))
    if small_first:
        indices.sort(key=lambda i: (bounds[i][1][2] - bounds[i][0][2], math.prod(footprints[i])))

    # Estimate a row width from the space occupied by the assets and their gaps.
    area = sum((width + spacing) * (depth + spacing) for width, depth in footprints)
    row_limit = max(max(width for width, _ in footprints), math.sqrt(area * (aspect_ratio or 1.0)) - spacing)
    # Keep a front and back row even when all assets would fit across a wide floor.
    row_capacity = math.ceil(len(bounds) / 2) if small_first else len(bounds)
    rows = []
    row, width, depth = [], 0.0, 0.0
    for i in indices:
        item_width, item_depth = footprints[i]
        if row and (len(row) >= row_capacity or width + spacing + item_width > row_limit):
            rows.append((row, width, depth))
            row, width, depth = [], 0.0, 0.0
        width += (spacing if row else 0.0) + item_width
        depth = max(depth, item_depth)
        row.append(i)
    rows.append((row, width, depth))

    total_width = max(width for _, width, _ in rows) + 2 * spacing
    total_depth = sum(depth + spacing for _, _, depth in rows) + spacing
    offsets = [None] * len(bounds)
    y = -total_depth / 2 + spacing
    for row, width, depth in rows:
        x = -width / 2
        for i in row:
            low, high = bounds[i]
            item_width, _ = footprints[i]
            offsets[i] = (x + item_width / 2 - (low[0] + high[0]) / 2,
                          y + depth / 2 - (low[1] + high[1]) / 2, -low[2])
            x += item_width + spacing
        y += depth + spacing
    return offsets, _floor_size(total_width, total_depth, aspect_ratio)
