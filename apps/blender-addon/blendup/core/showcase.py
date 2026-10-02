"""Shared, deterministic layout for generated scenes (Blender Z-up)."""
from __future__ import annotations

import math


def arrange(bounds, spacing=1.5):
    """Keep original scale; center each footprint and put its lowest point on the floor."""
    if not bounds:
        return [], (4.0, 4.0)
    columns = max(1, math.ceil(math.sqrt(len(bounds))))
    rows = math.ceil(len(bounds) / columns)
    widths = [0.0] * columns
    depths = [0.0] * rows
    for i, (low, high) in enumerate(bounds):
        widths[i % columns] = max(widths[i % columns], high[0] - low[0], 0.25)
        depths[i // columns] = max(depths[i // columns], high[1] - low[1], 0.25)
    spacing = max(0.1, float(spacing))
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
