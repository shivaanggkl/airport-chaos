"""Author and export the active NIGHTOWL airliner.

Run from the client directory:
  blender -b --python scripts/build-nightowl2-blender.py

Coordinates in the modeling helpers match the game: nose is local -Z, Y is up.
Blender's glTF exporter converts the temporary Blender axes back to game axes.
The previous private jet model is preserved in qa-assets/nightowl-backup1.glb.
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

OUTPUT = Path(__file__).resolve().parents[1] / "public/assets/models/aircraft/private-jet.glb"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
N = 48
TAU = math.tau


def to_blender(point):
    x, y, z = point
    return (x, -z, y)


def material(name, color, roughness, metallic=0.0):
    paint = bpy.data.materials.new(name)
    paint.diffuse_color = (*color, 1.0)
    paint.use_nodes = True
    principled = paint.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return paint


WHITE = material("N2_PEARL_WHITE", (0.91, 0.95, 0.98), 0.28, 0.10)
BLUE = material("N2_PAINT_PRIMARY", (0.035, 0.25, 0.62), 0.25, 0.12)
DEEP = material("N2_PAINT_ACCENT", (0.012, 0.105, 0.31), 0.28, 0.12)
PALE = material("N2_PALE_BLUE", (0.29, 0.63, 0.85), 0.28, 0.10)
GLASS = material("N2_COCKPIT_GLASS", (0.018, 0.065, 0.10), 0.17, 0.25)
WINDOW = material("N2_CABIN_GLASS", (0.035, 0.11, 0.18), 0.18, 0.18)
METAL = material("N2_BRUSHED_METAL", (0.45, 0.52, 0.57), 0.34, 0.72)
DARK = material("N2_DARK_METAL", (0.045, 0.060, 0.075), 0.39, 0.47)
TIRE = material("N2_TIRE", (0.026, 0.031, 0.039), 0.82)
TRIM = material("N2_PANEL_TRIM", (0.56, 0.64, 0.69), 0.58, 0.22)
LIGHT = material("N2_LIGHT", (0.92, 0.90, 0.73), 0.17)

objects = []


def mesh(name, vertices, faces, mats, face_materials=None, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([to_blender(v) for v in vertices], [], faces)
    data.materials.clear()
    for mat in mats:
        data.materials.append(mat)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for index, polygon in enumerate(data.polygons):
        polygon.use_smooth = smooth
        if face_materials:
            polygon.material_index = face_materials[index]
    objects.append(obj)
    return obj


def empty(name, point):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.25
    obj.location = to_blender(point)
    bpy.context.collection.objects.link(obj)
    return obj


def ring_loft(name, stations, mats, face_material=None, steps=N,
              cap_start=True, cap_end=True):
    vertices = []
    for z, cx, cy, rx, ry in stations:
        for j in range(steps):
            angle = TAU * j / steps
            vertices.append((cx + rx * math.cos(angle), cy + ry * math.sin(angle), z))
    faces = []
    indices = []
    for i in range(len(stations) - 1):
        for j in range(steps):
            faces.append((i * steps + j, i * steps + (j + 1) % steps,
                          (i + 1) * steps + (j + 1) % steps, (i + 1) * steps + j))
            indices.append(face_material(i, j) if face_material else 0)
    if cap_start:
        faces.append(tuple(reversed(tuple(range(steps)))))
        indices.append(0)
    if cap_end:
        faces.append(tuple((len(stations) - 1) * steps + j for j in range(steps)))
        indices.append(0)
    return mesh(name, vertices, faces, mats, indices)


FUSELAGE = [
    (-18.78, 0.06), (-18.55, 0.35), (-18.05, 0.82), (-17.4, 1.30),
    (-16.55, 1.67), (-15.45, 1.88), (-14.0, 1.97), (-11.5, 1.985),
    (-7.5, 1.985), (-3.0, 1.985), (1.5, 1.985), (6.0, 1.985),
    (10.5, 1.96), (12.8, 1.85), (14.4, 1.58), (15.9, 1.13),
    (17.1, 0.72), (18.1, 0.31), (18.78, 0.055),
]


def radius(z):
    if z <= FUSELAGE[0][0]:
        return FUSELAGE[0][1]
    for (a, ra), (b, rb) in zip(FUSELAGE, FUSELAGE[1:]):
        if a <= z <= b:
            t = (z - a) / (b - a)
            t = t * t * (3 - 2 * t)
            return ra + (rb - ra) * t
    return FUSELAGE[-1][1]


stations = []
for i in range(91):
    z = -18.78 + i * 37.56 / 90
    stations.append((z, 0, 0, radius(z), radius(z) * 0.945))


def fuselage_color(i, j):
    angle = TAU * (j + 0.5) / N
    return 1 if math.sin(angle) < -0.55 and -13.5 < stations[i][0] < 17.7 else 0


ring_loft("Smooth pressure cabin and rounded nose", stations, [WHITE, BLUE], fuselage_color)


def airfoil_loop(leading, trailing, span, height, thickness, axis="wing", steps=12):
    loop = []
    for i in range(steps + 1):
        t = i / steps
        chord = leading + (trailing - leading) * t
        camber = 0.035 * math.sin(math.pi * t)
        upper = thickness * (0.31 * math.sqrt(max(t, 0)) * (1 - t) + 0.025)
        if axis == "wing":
            loop.append((span, height + camber + upper, chord))
        else:
            loop.append((upper, span, chord))
    for i in range(steps - 1, 0, -1):
        t = i / steps
        chord = leading + (trailing - leading) * t
        lower = thickness * (0.20 * math.sqrt(t) * (1 - t) + 0.025)
        if axis == "wing":
            loop.append((span, height - lower, chord))
        else:
            loop.append((-lower, span, chord))
    return loop


def loft_perimeters(name, sections, mat, axis="wing"):
    loops = [airfoil_loop(*section, axis=axis) for section in sections]
    perimeter = len(loops[0])
    verts = [point for loop in loops for point in loop]
    faces = []
    faces.append(tuple(reversed(tuple(range(perimeter)))))
    for i in range(len(loops) - 1):
        for j in range(perimeter):
            a = i * perimeter + j
            b = i * perimeter + (j + 1) % perimeter
            faces.append((a, b, b + perimeter, a + perimeter))
    faces.append(tuple((len(loops) - 1) * perimeter + j for j in range(perimeter)))
    return mesh(name, verts, faces, [mat])


WING_SECTIONS = [
    # leading Z, trailing Z, absolute span, vertical center, airfoil thickness
    (-5.2, 5.25, 0.95, -1.52, 1.16),
    (-5.15, 5.15, 1.95, -1.48, 1.12),
    (-4.38, 5.02, 3.5, -1.31, 1.04),
    (-3.18, 4.90, 6.0, -1.09, 0.88),
    (-1.85, 4.85, 8.5, -0.85, 0.72),
    (-0.55, 4.78, 11.0, -0.57, 0.57),
    (0.85, 4.72, 14.0, -0.26, 0.39),
    (2.25, 4.64, 17.3, 0.11, 0.22),
    (2.39, 4.56, 17.55, 0.15, 0.17),
]
for side in (-1, 1):
    sections = [(a, b, span * side, y, thick) for a, b, span, y, thick in WING_SECTIONS]
    loft_perimeters(f"Continuous swept airfoil {side}", sections, WHITE)
    winglet = [
        (2.33, 4.53, side * 17.48, 0.20, 0.23),
        (2.35, 4.33, side * 17.67, 0.63, 0.20),
        (2.38, 4.12, side * 17.78, 1.23, 0.16),
        (2.43, 3.93, side * 17.88, 1.89, 0.13),
        (2.49, 3.68, side * 17.92, 2.28, 0.08),
    ]
    loft_perimeters(f"Curved blue sharklet {side}", winglet, BLUE)
    # Painted wingtip patch follows the upper surface, rather than covering
    # the wing with a flat box.
    patch = []
    for lead, trail, span, height, thick in sections[-3:]:
        patch.extend([(span, height + thick * 0.13 + 0.035, lead + 0.18),
                      (span, height + thick * 0.08 + 0.035, trail - 0.12)])
    mesh(f"Wingtip sweep paint {side}", patch, [(0, 1, 3, 2), (2, 3, 5, 4)], [BLUE], smooth=False)
    # Flap and aileron hinge line is restrained and flush with the upper wing.
    hinge = []
    for lead, trail, span, height, thick in sections[2:]:
        hinge.extend([(span, height + 0.04, trail - 0.54),
                      (span, height + 0.04, trail - 0.50)])
    faces = [(2 * j, 2 * j + 1, 2 * j + 3, 2 * j + 2) for j in range(len(hinge) // 2 - 1)]
    mesh(f"Flap seam {side}", hinge, faces, [TRIM], smooth=False)


FIN_SECTIONS = [
    (11.6, 18.15, 0.9, 0, 0.68),
    (12.3, 17.98, 1.8, 0, 0.62),
    (13.6, 18.05, 3.5, 0, 0.50),
    (15.0, 18.11, 5.4, 0, 0.37),
    (16.25, 18.18, 7.2, 0, 0.24),
    (16.82, 18.24, 8.6, 0, 0.12),
]
loft_perimeters("Single swept vertical tail", FIN_SECTIONS, BLUE, axis="fin")
for side in (-1, 1):
    stabilizer = [
        (12.7, 18.1, side * 1.2, 1.12, 0.38),
        (13.2, 18.0, side * 2.2, 1.25, 0.32),
        (14.5, 18.05, side * 4.4, 1.45, 0.23),
        (15.4, 18.1, side * 6.5, 1.64, 0.13),
    ]
    loft_perimeters(f"Swept horizontal stabilizer {side}", stabilizer, WHITE)


def side_patch(name, side, outline, mat, offset=0.022):
    # A four-corner decal must follow the curved pressure cabin. A single
    # planar quad cuts through the fuselage between its corners, leaving white
    # gaps in cockpit glass and broken patches around the aft windows.
    if len(outline) != 4:
        raise ValueError(f"{name} needs four outline corners")
    z_span = max(z for z, _ in outline) - min(z for z, _ in outline)
    y_span = max(y for _, y in outline) - min(y for _, y in outline)
    across = max(2, min(16, math.ceil(z_span / 0.35)))
    up = max(2, min(8, math.ceil(y_span / 0.30)))
    verts = []
    for row in range(up + 1):
        v = row / up
        for col in range(across + 1):
            u = col / across
            weights = ((1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v)
            z = sum(point[0] * weight for point, weight in zip(outline, weights))
            y = sum(point[1] * weight for point, weight in zip(outline, weights))
            r = radius(z)
            yy = min(abs(y / (r * 0.945)), 0.97)
            x = side * (r * math.sqrt(1 - yy * yy) + offset)
            verts.append((x, y, z))
    dz_u = outline[1][0] - outline[0][0]
    dy_u = outline[1][1] - outline[0][1]
    dz_v = outline[3][0] - outline[0][0]
    dy_v = outline[3][1] - outline[0][1]
    reverse = side * -(dz_u * dy_v - dy_u * dz_v) < 0
    faces = []
    for row in range(up):
        for col in range(across):
            a = row * (across + 1) + col
            face = (a, a + 1, a + across + 2, a + across + 1)
            faces.append(tuple(reversed(face)) if reverse else face)
    mesh(name, verts, faces, [mat], smooth=False)


def side_frame(name, side, z0, z1, y0, y1, mat, offset=0.060, stroke=0.025):
    # Draw a fine door seam without laying a large opaque polygon over the
    # blue fuselage stripe or any nearby windows.
    strips = [
        [(z0, y0), (z0 + stroke, y0), (z0 + stroke, y1), (z0, y1)],
        [(z1 - stroke, y0), (z1, y0), (z1, y1), (z1 - stroke, y1)],
        [(z0 + stroke, y0), (z1 - stroke, y0),
         (z1 - stroke, y0 + stroke), (z0 + stroke, y0 + stroke)],
        [(z0 + stroke, y1 - stroke), (z1 - stroke, y1 - stroke),
         (z1 - stroke, y1), (z0 + stroke, y1)],
    ]
    for index, outline in enumerate(strips):
        side_patch(f"{name} seam {index}", side, outline, mat, offset)


def top_patch(name, outline, mat, offset=0.045):
    verts = []
    steps = 6
    for j in range(steps + 1):
        v = j / steps
        for i in range(steps + 1):
            u = i / steps
            front_x = outline[0][0] * (1 - u) + outline[1][0] * u
            front_z = outline[0][1] * (1 - u) + outline[1][1] * u
            back_x = outline[3][0] * (1 - u) + outline[2][0] * u
            back_z = outline[3][1] * (1 - u) + outline[2][1] * u
            x = front_x * (1 - v) + back_x * v
            z = front_z * (1 - v) + back_z * v
            r = radius(z)
            ratio = min(abs(x / r), 0.98)
            verts.append((x, r * 0.945 * math.sqrt(1 - ratio * ratio) + offset, z))
    faces = []
    for j in range(steps):
        for i in range(steps):
            a = j * (steps + 1) + i
            face = (a, a + 1, a + steps + 2, a + steps + 1)
            faces.append(tuple(reversed(face)) if outline[1][0] > outline[0][0] else face)
    mesh(name, verts, faces, [mat], smooth=False)


# Two forward windscreen panes cross the nose crown. The adjoining side panes
# below complete the segmented cockpit visible from front and three-quarter.
for side in (-1, 1):
    windshield = [(side * 0.07, -17.65), (side * 0.82, -17.32),
                  (side * 1.03, -15.55), (side * 0.07, -15.70)]
    top_patch(f"Forward windscreen frame {side}", windshield, DEEP, 0.064)
    glass = [(side * 0.12, -17.52), (side * 0.76, -17.22),
             (side * 0.96, -15.68), (side * 0.12, -15.80)]
    top_patch(f"Forward windscreen glass {side}", glass, GLASS, 0.080)


# The low blue sweep is curved and tapering against the fuselage skin.
for side in (-1, 1):
    upper = [(-12.8, -0.60), (-9.5, -0.52), (-6.0, -0.49), (-2.5, -0.28),
             (1.5, 0.01), (5.5, 0.23), (10.5, 0.18), (14.3, -0.20), (16.3, -0.44)]
    lower = [(z, y - (0.20 if z < 0 else 0.34)) for z, y in upper]
    for i in range(len(upper) - 1):
        side_patch(f"Cabin sweep stripe {side} {i}", side,
                   [upper[i], upper[i + 1], lower[i + 1], lower[i]], BLUE, 0.037)
    # Symmetric, evenly spaced passenger windows; actual doors interrupt the row.
    for n in range(39):
        z = -12.25 + n * 0.65
        if any(abs(z - door) < 0.55 for door in (-13.45, -0.85, 0.55, 13.05)):
            continue
        side_patch(f"Passenger window {side} {n}", side,
                   [(z - 0.17, 0.72), (z + 0.17, 0.72),
                    (z + 0.17, 1.00), (z - 0.17, 1.00)], WINDOW, 0.052)
    for door_z, door_top in [(-13.45, 1.18), (13.05, 1.08)]:
        side_frame(f"Passenger door {side} {door_z}", side,
                   door_z - 0.34, door_z + 0.34, -0.54, door_top, TRIM)
        side_patch(f"Door window {side} {door_z}", side,
                   [(door_z - 0.12, 0.62), (door_z + 0.12, 0.62),
                    (door_z + 0.12, 0.85), (door_z - 0.12, 0.85)], WINDOW, 0.072)
    for door_z in (-0.85, 0.55):
        side_frame(f"Overwing exit {side} {door_z}", side,
                   door_z - 0.25, door_z + 0.25, 0.39, 1.18, TRIM)
        side_patch(f"Overwing exit window {side} {door_z}", side,
                   [(door_z - 0.11, 0.74), (door_z + 0.11, 0.74),
                    (door_z + 0.11, 0.96), (door_z - 0.11, 0.96)], WINDOW, 0.072)

    # Each cockpit pane is a separate oblique polygon with slim frame around it.
    for pane, outline in enumerate([
        [(-17.10, 0.60), (-16.62, 1.24), (-15.78, 1.37), (-15.80, 0.82)],
        [(-15.76, 0.84), (-15.73, 1.38), (-14.62, 1.36), (-14.75, 0.87)],
    ]):
        side_patch(f"Cockpit pane trim {side} {pane}", side, outline, DEEP, 0.060)
        zys = [(z + (0.035 if z < -16 else -0.02), y - 0.035) for z, y in outline]
        side_patch(f"Cockpit glass pane {side} {pane}", side, zys, GLASS, 0.069)
    # White stylized mountain mark: simple original geometry on both fin sides.
    mark = [(15.13, 4.24), (15.70, 5.62), (16.10, 5.13),
            (16.64, 6.38), (17.48, 4.36), (16.76, 4.36),
            (16.54, 5.02), (16.09, 4.55), (15.77, 5.00), (15.46, 4.24)]
    x = side * 0.18
    # One simple outline avoids coplanar triangles from overlapping at the
    # valleys of the mark, which otherwise flicker as the tail rotates.
    mesh(f"Original mountain mark {side}", [(x, y, z) for z, y in mark],
         [tuple(range(len(mark)))], [WHITE], smooth=False)


def cabin_wordmark(side):
    letters = bpy.data.curves.new("NIGHTOWL2 lettering", "FONT")
    letters.body = "NIGHTOWL2"
    letters.size = 0.72
    letters.space_character = 1.04
    font_object = bpy.data.objects.new("NIGHTOWL2 lettering source", letters)
    bpy.context.collection.objects.link(font_object)
    bpy.ops.object.select_all(action="DESELECT")
    font_object.select_set(True)
    bpy.context.view_layer.objects.active = font_object
    bpy.ops.object.convert(target="MESH")
    source = bpy.context.view_layer.objects.active
    source_vertices = [tuple(vertex.co) for vertex in source.data.vertices]
    source_faces = [tuple(poly.vertices) for poly in source.data.polygons]
    bpy.data.objects.remove(source, do_unlink=True)
    vertices = []
    for horizontal, vertical, _ in source_vertices:
        z = (-5.0 if side > 0 else -10.25) + horizontal * (-1 if side > 0 else 1)
        # Keep the branding in the clear band below the passenger windows.
        y = -0.28 + vertical
        r = radius(z)
        normalized = min(abs(y / (r * 0.945)), 0.98)
        x = side * (r * math.sqrt(1 - normalized * normalized) + 0.046)
        vertices.append((x, y, z))
    mesh(f"Original NIGHTOWL2 wordmark {side}", vertices, source_faces, [BLUE], smooth=False)


for side in (-1, 1):
    cabin_wordmark(side)


def tube(name, a, b, radius_value, mat, vertices=12):
    a, b = Vector(a), Vector(b)
    direction = (b - a).normalized()
    reference = Vector((0, 1, 0)) if abs(direction.y) < 0.9 else Vector((1, 0, 0))
    right = direction.cross(reference).normalized()
    up = direction.cross(right).normalized()
    verts = []
    for center in (a, b):
        for j in range(vertices):
            point = center + radius_value * (right * math.cos(TAU * j / vertices) +
                                             up * math.sin(TAU * j / vertices))
            verts.append(tuple(point))
    faces = [(j, (j + 1) % vertices, vertices + (j + 1) % vertices, vertices + j)
             for j in range(vertices)]
    faces.extend([tuple(reversed(range(vertices))), tuple(range(vertices, vertices * 2))])
    return mesh(name, verts, faces, [mat])


def nacelle(side):
    cx = side * 6.6
    cy = -2.68
    profile = [
        (-5.80, 0.82), (-5.65, 1.01), (-5.34, 1.11), (-4.78, 1.15),
        (-3.60, 1.15), (-2.35, 1.08), (-1.40, 0.89), (-0.82, 0.65),
    ]
    ring_loft(f"Underwing turbofan nacelle {side}",
              [(z, cx, cy, r, r) for z, r in profile], [WHITE], steps=48,
              cap_start=False)
    # Hollow intake throat, wrapped lip and recessed fan.
    ring_loft(f"Rounded metallic intake lip {side}",
              [(-5.88, cx, cy, 0.79, 0.79),
               (-5.80, cx, cy, 0.90, 0.90),
               (-5.65, cx, cy, 1.01, 1.01)], [METAL], steps=48,
              cap_start=False, cap_end=False)
    ring_loft(f"Dark recessed inlet {side}",
              [(-5.89, cx, cy, 0.76, 0.76),
               (-5.18, cx, cy, 0.73, 0.73),
               (-4.72, cx, cy, 0.67, 0.67)], [DARK], steps=48,
              cap_start=False, cap_end=False)
    ring_loft(f"Rear hot section {side}",
              [(-0.81, cx, cy, 0.63, 0.63),
               (-0.49, cx, cy, 0.56, 0.56),
               (-0.43, cx, cy, 0.49, 0.49)], [METAL], steps=48)
    ring_loft(f"Rear exhaust cavity {side}",
              [(-0.38, cx, cy, 0.43, 0.43), (-0.72, cx, cy, 0.41, 0.41)],
              [DARK], steps=32)
    blade_verts = []
    blade_faces = []
    for j in range(18):
        a = TAU * j / 18
        b = a + 0.27
        k = len(blade_verts)
        for r, angle, z in [(0.13, a, -4.64), (0.65, a + 0.15, -4.56),
                            (0.66, b + 0.08, -4.61), (0.14, b, -4.67)]:
            blade_verts.append((cx + r * math.cos(angle), cy + r * math.sin(angle), z))
        blade_faces.append((k, k + 1, k + 2, k + 3))
    mesh(f"Recessed fan blades {side}", blade_verts, blade_faces, [METAL], smooth=False)
    ring_loft(f"Fan hub {side}",
              [(-4.82, cx, cy, 0.12, 0.12), (-4.62, cx, cy, 0.20, 0.20),
               (-4.47, cx, cy, 0.10, 0.10)], [DARK], steps=24)
    # Swept wing pylon, with a broader root blended into the underside.
    mesh(f"Engine pylon {side}",
         [(cx - 0.40, -1.46, -3.96), (cx + 0.40, -1.46, -3.96),
          (cx + 0.25, -2.03, -4.31), (cx - 0.25, -2.03, -4.31),
          (cx - 0.36, -1.47, -1.80), (cx + 0.36, -1.47, -1.80),
          (cx + 0.22, -2.02, -1.88), (cx - 0.22, -2.02, -1.88)],
         [(0, 1, 2, 3), (0, 4, 5, 1), (3, 2, 6, 7),
          (0, 3, 7, 4), (1, 5, 6, 2), (4, 7, 6, 5)], [WHITE], smooth=False)
    empty(f"ExhaustSocket_{'Left' if side < 0 else 'Right'}", (cx, cy, -0.43))


for side in (-1, 1):
    nacelle(side)


def wheel(name, center, radius_value, width):
    x, y, z = center
    # Wheel axle is along X; dark tread and inset metallic hub share one axis.
    rings = [
        (x - width / 2, radius_value * 0.86),
        (x - width * 0.38, radius_value),
        (x + width * 0.38, radius_value),
        (x + width / 2, radius_value * 0.86),
    ]
    vertices = []
    count = 24
    for ring_x, r in rings:
        for j in range(count):
            angle = TAU * j / count
            vertices.append((ring_x, y + r * math.cos(angle), z + r * math.sin(angle)))
    faces = []
    for i in range(len(rings) - 1):
        for j in range(count):
            faces.append((i * count + j, i * count + (j + 1) % count,
                          (i + 1) * count + (j + 1) % count, (i + 1) * count + j))
    faces.extend([tuple(reversed(range(count))),
                  tuple((len(rings) - 1) * count + j for j in range(count))])
    mesh(name, vertices, faces, [TIRE])
    for face_x in (x - width / 2 - 0.012, x + width / 2 + 0.012):
        disk = [(face_x, y, z)]
        for j in range(count):
            angle = TAU * j / count
            disk.append((face_x, y + radius_value * 0.38 * math.cos(angle),
                         z + radius_value * 0.38 * math.sin(angle)))
        mesh(f"{name} metal hub", disk,
             [(0, j + 1, (j + 1) % count + 1) for j in range(count)], [METAL], smooth=False)


# Retractable gear remains a visual-only static QA asset.
tube("Nose gear strut", (0, -1.59, -15.0), (0, -3.25, -14.92), 0.105, METAL)
tube("Nose gear brace", (0, -2.12, -15.0), (0, -2.76, -14.20), 0.058, TRIM)
for side in (-1, 1):
    wheel(f"Nose twin wheel {side}", (side * 0.34, -3.48, -14.91), 0.47, 0.30)
    empty(f"GroundContact_Nose_{'Left' if side < 0 else 'Right'}",
          (side * 0.34, -3.95, -14.91))

for side in (-1, 1):
    x = side * 3.05
    tube(f"Main strut {side}", (x, -1.66, 2.12), (x, -3.28, 2.20), 0.14, METAL)
    tube(f"Main drag brace {side}", (x, -2.15, 2.15), (x + side * 0.51, -2.76, 3.35), 0.065, TRIM)
    for offset in (-0.32, 0.32):
        wheel(f"Main wheel {side} {offset}", (x + offset, -3.43, 2.28), 0.51, 0.35)
    empty(f"GroundContact_Main_{'Left' if side < 0 else 'Right'}", (x, -3.94, 2.28))

# Authored QA attachment points. The former red/green bulb meshes read as
# floating dots at this game's scale, so the wingtip stays clean.
empty("NoseReference", (0, 0, -18.78))
empty("CameraFrameCenter", (0, 0.25, 0))
empty("TailReference", (0, 8.6, 17.55))

# Merge mesh objects by material, leaving semantic empties untouched. This
# keeps the many small cabin details down to a handful of GLB draw calls.
for paint in list(bpy.data.materials):
    group = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH'
             and len(obj.data.materials) == 1 and obj.data.materials[0] == paint]
    if len(group) < 2:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for obj in group:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    bpy.ops.object.join()
    group[0].name = f"NIGHTOWL2_{paint.name}"

bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.context.scene.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
)
print(f"NIGHTOWL2 exported: {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
