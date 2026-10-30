"""Author the Firehawk mesh offline with Blender, then export its game-ready GLB.

Run from client/: blender -b --python scripts/build-firehawk-blender.py
Geometry is authored in game coordinates (+Y up, -Z forward) and converted to
Blender's Z-up space only at the mesh boundary. Blender is not a runtime need.
"""
import math
from pathlib import Path

import bpy
from mathutils import Vector


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def color(hex_value):
    # Blender shader colors are linear; convert authored sRGB swatches before
    # glTF export so the deep red livery does not wash out to pink.
    channels = [int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(channel / 12.92 if channel <= .04045 else
                 ((channel + .055) / 1.055) ** 2.4 for channel in channels)


def material(name, rgb, roughness, metalness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color(rgb), 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color(rgb), 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metalness
    return mat


BASE = material('AC_LIVERY_BASE', 'b2bec6', .31, .50)
RED = material('AC_LIVERY_PRIMARY', 'd52030', .78, .0)
FIN = material('AC_FIREHAWK_FIN', 'd52030', .78, .0)
MARK = material('AC_FIREHAWK_MARK', 'b2bec6', .31, .50)
MISSILE_NOSE = material('AC_MISSILE_NOSE', '225a84', .38, .18)
SILVER = material('AC_LIVERY_ACCENT', '9eacb6', .28, .55)
PANEL = material('AC_PANEL_LINES', '8496a4', .56, .10)
GLASS = material('AC_GLASS', '08111b', .16, .12)
DARK = material('AC_DARK', '20262b', .43, .12)
METAL = material('AC_METAL', '7a8790', .30, .67)
TIRE = material('AC_TIRE', '101417', .82, .02)
INLET = material('AC_INLET_VOID', '030507', .96, .0)
GLASS.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = .96
GLASS.surface_render_method = 'BLENDED'


def game_to_blender(point):
    x, y, z = point
    return (x, -z, y)


def mesh(name, vertices, faces, mat, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([game_to_blender(vertex) for vertex in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    for polygon in data.polygons:
        polygon.use_smooth = smooth
    return obj


def loft(name, sections, mat, radial=32, square=.96, inward=False):
    """Cross-section loft: (Z, width, height, Y-center)."""
    vertices, faces = [], []
    for z, width, height, cy in sections:
        for j in range(radial):
            angle = math.tau * j / radial
            c, s = math.cos(angle), math.sin(angle)
            x = width * math.copysign(abs(c) ** square, c)
            y = cy + height * math.copysign(abs(s) ** square, s)
            vertices.append((x, y, z))
    for i in range(len(sections) - 1):
        for j in range(radial):
            a = i * radial + j
            b = i * radial + (j + 1) % radial
            c = (i + 1) * radial + j
            d = (i + 1) * radial + (j + 1) % radial
            face = (a, b, d, c)
            faces.append(tuple(reversed(face)) if inward else face)
    return mesh(name, vertices, faces, mat)


def beam(name, start, end, radius_start, radius_end, mat, sides=12):
    a, b = Vector(start), Vector(end)
    axis = (b - a).normalized()
    tangent = axis.cross(Vector((1, 0, 0)))
    if tangent.length < .01:
        tangent = axis.cross(Vector((0, 1, 0)))
    tangent.normalize()
    bitangent = axis.cross(tangent).normalized()
    vertices = []
    for center, radius in ((a, radius_start), (b, radius_end)):
        for j in range(sides):
            direction = tangent * math.cos(math.tau * j / sides) + bitangent * math.sin(math.tau * j / sides)
            vertices.append(tuple(center + radius * direction))
    faces = []
    for j in range(sides):
        n = (j + 1) % sides
        faces.append((j, n, sides + n, sides + j))
    faces.extend([tuple(reversed(range(sides))), tuple(range(sides, sides * 2))])
    return mesh(name, vertices, faces, mat)


def tube_polyline(name, points, radius, mat, sides=8):
    vertices, faces = [], []
    positions = [Vector(point) for point in points]
    for i, point in enumerate(positions):
        tangent = (positions[min(i + 1, len(positions) - 1)] -
                   positions[max(i - 1, 0)]).normalized()
        across = tangent.cross(Vector((0, 0, 1)))
        if across.length < .01:
            across = tangent.cross(Vector((1, 0, 0)))
        across.normalize()
        up = tangent.cross(across).normalized()
        for j in range(sides):
            v = point + radius * (across * math.cos(math.tau * j / sides) +
                                  up * math.sin(math.tau * j / sides))
            vertices.append(tuple(v))
    for i in range(len(positions) - 1):
        for j in range(sides):
            n = (j + 1) % sides
            a = i * sides + j
            faces.append((a, i * sides + n, (i + 1) * sides + n, a + sides))
    return mesh(name, vertices, faces, mat)


def ribbon(name, points, mat, smooth=False):
    # Points are already draped onto a target surface. Split into triangles so
    # the color remains crisp and never depends on alpha or texture filtering.
    faces = [tuple(range(len(points)))]
    return mesh(name, points, faces, mat, smooth)


def fin_plate(name, outline, half_thickness, mat):
    # A closed thin plate gives the missile fins a visible edge from any angle.
    points = [Vector(point) for point in outline]
    offset = Vector(half_thickness)
    if (points[1] - points[0]).cross(points[2] - points[0]).dot(offset) < 0:
        points.reverse()
    count = len(points)
    vertices = [tuple(point - offset) for point in points]
    vertices += [tuple(point + offset) for point in points]
    faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
    faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count)
                 for i in range(count))
    return mesh(name, vertices, faces, mat, False)


body_sections = [
    (-3.48, .31, .27, -.02), (-3.22, .36, .30, -.01),
    (-2.87, .42, .34, .00), (-2.44, .48, .38, .02),
    (-2.00, .54, .41, .03), (-1.52, .62, .43, .035),
    (-1.04, .69, .45, .03), (-.55, .78, .47, .015),
    (0, .84, .48, .005), (.63, .86, .47, .00),
    (1.25, .80, .44, -.005), (1.91, .69, .41, -.01),
    (2.55, .58, .39, -.015), (3.16, .51, .38, -.02),
    (3.64, .45, .36, -.02), (3.88, .42, .34, -.02),
]
loft('Fuselage continuous white shell', body_sections, BASE, radial=48, square=.83)
loft('Long charcoal radome', [
    (-5.02, .003, .003, -.10), (-4.92, .027, .024, -.09),
    (-4.73, .088, .078, -.08), (-4.48, .16, .14, -.065),
    (-4.20, .23, .20, -.045), (-3.84, .29, .25, -.025),
    body_sections[0],
], DARK, radial=48)
loft('Low blended dorsal spine', [
    (-.19, .16, .035, .43), (.24, .22, .085, .44),
    (.78, .25, .13, .43), (1.29, .23, .16, .42),
    (1.78, .20, .17, .40), (2.30, .13, .10, .39),
], BASE, radial=20)


# Main wing stations specify an actual airfoil volume instead of a flat
# extruded triangle. The near-root leading-edge extension flows into the
# fuselage; spanwise curvature and taper continue into a thin clipped tip.
# The fighter's source silhouette is roughly one-and-a-half times as long as
# it is wide. Keep that proportion in the authored mesh, not in camera zoom.
wing_span_factor = .87
wing_stations = [
    # The leading-edge shoulder and outer wing share one closed airfoil.
    (.34, -2.38, .48, .20, .10),
    (.47, -2.29, .93, .19, .12),
    (.65, -2.04, 1.38, .13, .16),
    (.86, -1.72, 1.67, .055, .19),
    (1.07, -1.56, 1.70, .017, .205),
    (1.42 * wing_span_factor, -1.35, 1.68, .022, .18),
    (1.88 * wing_span_factor, -1.09, 1.62, .030, .15),
    (2.35 * wing_span_factor, -.82, 1.54, .045, .12),
    (2.83 * wing_span_factor, -.54, 1.44, .061, .09),
    (3.25 * wing_span_factor, -.31, 1.34, .078, .067),
    (3.51 * wing_span_factor, -.17, 1.29, .084, .05),
]
profile = [0, .025, .085, .18, .32, .50, .68, .82, .92, .975, 1]


def station_at(x):
    for i in range(len(wing_stations) - 1):
        a, b = wing_stations[i:i + 2]
        if x <= b[0]:
            t = max(0, min(1, (x - a[0]) / (b[0] - a[0])))
            return tuple(a[j] + (b[j] - a[j]) * t for j in range(5))
    return wing_stations[-1]


def wing_point(side, x, fraction, upper=True, lift=.0):
    x *= wing_span_factor
    _, lead, trail, cy, thickness = station_at(x)
    z = lead + (trail - lead) * fraction
    camber = .016 * math.sin(math.pi * fraction)
    section = math.sin(math.pi * fraction) ** .72
    y = cy + camber + thickness * section * (.62 if upper else -.38)
    return (side * x, y + (lift if upper else -lift), z)


def wing_underside_y(x, z):
    _, lead, trail, cy, thickness = station_at(abs(x))
    fraction = max(0, min(1, (z - lead) / (trail - lead)))
    section = math.sin(math.pi * fraction)
    return cy + .016 * section - thickness * section ** .72 * .38


def wing_surface(name, stations, side, mat, thickness_factor=1):
    vertices, faces = [], []
    perimeter = len(profile) * 2 - 2
    for x, lead, trail, cy, thickness in stations:
        for fraction in profile:
            section = math.sin(math.pi * fraction) ** .72
            y = cy + .016 * math.sin(math.pi * fraction) + thickness * thickness_factor * section * .62
            vertices.append((side * x, y, lead + (trail - lead) * fraction))
        for fraction in reversed(profile[1:-1]):
            section = math.sin(math.pi * fraction) ** .72
            y = cy + .016 * math.sin(math.pi * fraction) - thickness * thickness_factor * section * .38
            vertices.append((side * x, y, lead + (trail - lead) * fraction))
    for i in range(len(stations) - 1):
        for j in range(perimeter):
            a = i * perimeter + j
            b = i * perimeter + (j + 1) % perimeter
            c = (i + 1) * perimeter + j
            d = (i + 1) * perimeter + (j + 1) % perimeter
            face = (a, b, d, c)
            faces.append(face if side > 0 else tuple(reversed(face)))
    root_cap = tuple(range(perimeter))
    tip_cap = tuple(range((len(stations) - 1) * perimeter, len(stations) * perimeter))
    faces.append(tuple(reversed(root_cap)) if side > 0 else root_cap)
    faces.append(tip_cap if side > 0 else tuple(reversed(tip_cap)))
    return mesh(name, vertices, faces, mat)


def upper_mark(name, side, coordinates, mat, lift=.009):
    points = [wing_point(side, x, fraction, lift=lift) for x, fraction in coordinates]
    # Top-facing winding for both mirrored sides.
    a, b, c = [Vector(point) for point in points[:3]]
    if (b - a).cross(c - a).y < 0:
        points.reverse()
    return ribbon(name, points, mat)


for side in (-1, 1):
    wing_surface('Shaped swept main wing', wing_stations, side, BASE)
    # This inset matches the hull on Inferno and becomes a broad gold wing
    # field on Midnight Black, below the existing raised feather markings.
    field_stations = [
        (1.38, .31, .51), (1.83, .23, .64), (2.57, .18, .69),
        (3.18, .19, .61), (3.24, .19, .25),
    ]
    field_steps = 8
    field_vertices = [
        wing_point(side, x, front + (rear - front) * j / field_steps, lift=.006)
        for x, front, rear in field_stations for j in range(field_steps + 1)
    ]
    field_faces = []
    for i in range(len(field_stations) - 1):
        for j in range(field_steps):
            a = i * (field_steps + 1) + j
            b = a + field_steps + 1
            face = (a, b, b + 1, a + 1)
            p, q, r = [Vector(field_vertices[index]) for index in face[:3]]
            field_faces.append(face if (q - p).cross(r - p).y > 0 else tuple(reversed(face)))
    mesh('Firehawk wing color field', field_vertices, field_faces, MARK)
    # Each red field is a designed, multi-part wing motif. Slender silver
    # separators and aileron seams make it read as aircraft paint, not tape.
    upper_mark('Red racing feather forward', side, [
        (.93, .26), (1.39, .22), (2.05, .16), (3.21, .10),
        (3.31, .17), (2.75, .24), (2.33, .31), (1.74, .40), (.97, .43),
    ], RED)
    upper_mark('Red racing feather aft', side, [
        (1.14, .55), (1.62, .53), (2.18, .47), (3.16, .41),
        (3.08, .49), (2.30, .60), (1.64, .69), (1.16, .68),
    ], RED)
    upper_mark('White falcon wing flash', side, [
        (2.02, .22), (2.64, .17), (2.92, .16), (2.60, .22),
        (2.32, .29), (2.45, .25), (2.13, .32),
    ], MARK, .018)
    upper_mark('White falcon trailing feather', side, [
        (2.13, .32), (2.45, .25), (2.58, .25), (2.29, .35),
    ], MARK, .018)
    upper_mark('Aileron hinge', side, [
        (1.22, .83), (3.36, .83), (3.36, .845), (1.22, .845),
    ], PANEL)
    upper_mark('Leading edge panel break', side, [
        (.98, .13), (2.91, .12), (2.92, .127), (.98, .138),
    ], PANEL)
    upper_mark('Outer wing panel seam', side, [
        (3.19, .08), (3.20, .08), (3.20, .92), (3.19, .92),
    ], PANEL)
    upper_mark('Inner wing control seam', side, [
        (1.75, .78), (1.77, .78), (1.78, .94), (1.76, .94),
    ], PANEL)
    # Visual-only stores follow the wing on both sides.
    tip_x = side * 3.51 * wing_span_factor
    store_x = side * 2.26 * wing_span_factor
    store_y = -.38
    missile_x = tip_x - side * .08
    missile_y = -.19
    # The wingtip weapon has a long red fuselage, blue seeker, pale pointed
    # nose, and four swept tail fins like the supplied aircraft reference.
    beam('Wingtip missile body', (missile_x, missile_y, -.75),
         (missile_x, missile_y, .76), .068, .063, RED, 16)
    beam('Wingtip missile seeker', (missile_x, missile_y, -1.04),
         (missile_x, missile_y, -.75), .025, .068, MISSILE_NOSE, 16)
    beam('Wingtip missile nose', (missile_x, missile_y, -1.13),
         (missile_x, missile_y, -1.04), .002, .025, BASE, 12)
    beam('Wingtip missile aft taper', (missile_x, missile_y, .76),
         (missile_x, missile_y, .87), .063, .025, RED, 12)
    for direction, fin_mat in ((1, RED), (-1, SILVER)):
        fin_plate('Wingtip missile vertical fin', [
            (missile_x, missile_y + direction * .04, .43),
            (missile_x, missile_y + direction * .22, .64),
            (missile_x, missile_y + direction * .22, .82),
            (missile_x, missile_y + direction * .04, .77),
        ], (.012, 0, 0), fin_mat)
        fin_plate('Wingtip missile horizontal fin', [
            (missile_x + side * direction * .04, missile_y, .43),
            (missile_x + side * direction * .18, missile_y, .64),
            (missile_x + side * direction * .18, missile_y, .82),
            (missile_x + side * direction * .04, missile_y, .77),
        ], (0, .012, 0), fin_mat)
    # A launch rail overlaps both the wing airfoil and the missile body.
    rail_top = wing_underside_y(missile_x, .23) + .018
    rail_bottom = missile_y + .03
    fin_plate('Wingtip missile launch rail', [
        (missile_x, rail_top, .02),
        (missile_x, rail_top, .62),
        (missile_x, rail_bottom, .56),
        (missile_x, rail_bottom, .08),
    ], (.026, 0, 0), SILVER)
    # The inboard store is a larger drop-tank shape than the outer missile.
    # Keep its nose just ahead of the wing and its tapered rear below the wing.
    store_sections = [
        (-1.34, .005, .005, store_y), (-1.27, .055, .055, store_y),
        (-1.10, .115, .11, store_y), (-.85, .145, .135, store_y),
        (-.46, .155, .14, store_y), (.35, .155, .14, store_y),
        (.91, .14, .125, store_y), (1.17, .09, .085, store_y),
        (1.31, .005, .005, store_y),
    ]
    store = loft('Large underwing store', store_sections, SILVER, radial=20)
    store.location.x = store_x
    # The pylon begins inside the airfoil and ends inside the store body, so
    # neither side can show a gap as the wing tapers across its span.
    pylon_profile = [
        (-.32, wing_underside_y(store_x, -.32) + .06),
        (.58, wing_underside_y(store_x, .58) + .06),
        (.43, store_y + .06), (-.16, store_y + .06),
    ]
    pylon_vertices = [(store_x + offset, y, z)
                      for offset in (-.045, .045)
                      for z, y in pylon_profile]
    pylon_faces = [(3, 2, 1, 0), (4, 5, 6, 7)]
    pylon_faces.extend((i, (i + 1) % 4, (i + 1) % 4 + 4, i + 4)
                       for i in range(4))
    mesh('Store pylon', pylon_vertices, pylon_faces, SILVER, False)


def tail_wing(side):
    stations = [(.38, 2.23, 3.65, .16, .12), (.81, 2.42, 3.58, .18, .10),
                (1.32, 2.70, 3.43, .22, .067), (1.69, 2.84, 3.36, .25, .035)]
    wing_surface('Swept horizontal stabilizer', stations, side, BASE, .80)
    ribbon('Red tailplane sweep', [
        (side * .65, .255, 2.62), (side * 1.49, .275, 2.96),
        (side * 1.54, .275, 3.03), (side * .73, .255, 2.78),
    ], RED)
    beam('Red tailplane tip', (side * 1.69, .25, 2.88),
         (side * 1.69, .25, 3.33), .038, .030, RED, 8)


for side in (-1, 1):
    tail_wing(side)


def fin():
    def shell(name, outline, half_width):
        vertices = [(side * half_width(y), y, z)
                    for side in (-1, 1) for z, y in outline]
        count = len(outline)
        faces = [tuple(range(count - 1, -1, -1)),
                 tuple(range(count, count * 2))]
        for i in range(count):
            n = (i + 1) % count
            faces.append((i, n, count + n, count + i))
        mesh(name, vertices, faces, FIN, False)

    # The broad root fairing blends into the fuselage. The thinner swept fin
    # sits inside its top, leaving a real step rather than a painted divider.
    def fairing_width(y):
        return .13 - .055 * max(0, min(1, (y - .24) / .36))

    shell('Tapered lower fin fairing', [
        (1.43, .24), (3.59, .25), (3.48, .54),
        (3.42, .60), (1.93, .60),
    ], fairing_width)
    shell('Swept upper vertical stabilizer', [
        (1.86, .50), (3.48, .50), (3.38, .93),
        (3.18, 1.58), (3.1314, 1.75), (2.66, 1.75),
        (2.61, 1.65), (2.43, 1.27),
    ], lambda y: .06)
    # The three-panel tip belongs inside the original fin silhouette. Its
    # sides share the fin's thickness and its lower edge meets the red shell.
    cap_edges = ((2.66, 2.75), (2.8171, 2.86),
                 (2.9271, 2.937), (3.1314, 3.08))
    for index, cap_material in enumerate((DARK, MARK, DARK)):
        lower_front, upper_front = cap_edges[index]
        lower_rear, upper_rear = cap_edges[index + 1]
        fin_plate('Integrated stabilizer tip panel', [
            (0, 1.75, lower_front), (0, 1.75, lower_rear),
            (0, 1.93, upper_rear), (0, 1.93, upper_front),
        ], (.06, 0, 0), cap_material)
    # A mirrored, original falcon-wing silhouette, deliberately without text.
    graphic = [
        [(1.98, .62), (2.41, .79), (2.76, 1.08), (3.06, 1.20),
         (2.82, 1.18), (2.57, 1.00), (2.26, .80)],
        [(2.36, .83), (2.69, 1.16), (2.90, 1.57), (2.79, 1.66),
         (2.58, 1.26)],
        [(2.60, 1.05), (2.90, 1.19), (3.19, 1.35),
         (2.98, 1.39), (2.73, 1.25)],
        [(2.26, .80), (2.57, .99), (2.91, 1.05),
         (2.70, 1.09), (2.38, .94)],
    ]
    for side in (-1, 1):
        for points in graphic:
            ribbon('Original white falcon fin mark',
                   [(side * .067, y + .03, z) for z, y in points], MARK)
        ribbon('Fin rudder hinge', [
            (side * .067, .70, 3.40), (side * .067, 1.55, 3.19),
            (side * .067, 1.55, 3.204), (side * .067, .70, 3.414),
        ], PANEL)
        ribbon('Lower fin aft registration band', [
            (side * (fairing_width(.42) + .007), .42, 3.36),
            (side * (fairing_width(.42) + .007), .42, 3.52),
            (side * (fairing_width(.54) + .007), .54, 3.48),
            (side * (fairing_width(.54) + .007), .54, 3.36),
        ], MARK)
        # The aircraft designation is flat fin paint, like the reference tail
        # code. Separate, non-overlapping bars keep its two letters crisp.
        bars = (
            (.04, .13, 0, 1), (.13, .41, .84, 1), (.13, .36, .47, .63),
            (.56, .65, 0, 1), (.87, .96, 0, 1), (.65, .87, .47, .63),
        )
        letters, faces = [], []
        for left, right, bottom, top in bars:
            first = len(letters)
            for u, v in ((left, bottom), (right, bottom),
                         (right, top), (left, top)):
                # Slant the lettering slightly and mirror its reading order.
                along = u + .035 * v
                z = 2.70 + .42 * (along if side < 0 else 1 - along)
                y = .43 + .14 * v
                letters.append((side * (fairing_width(y) + .007), y, z))
            faces.append(tuple(range(first, first + 4)))
        mesh('Painted FH fin code', letters, faces, MARK, False)


fin()


def canopy_surface():
    # A dark recessed cockpit well remains legible beneath the tinted shell.
    mesh('Cockpit opening', [(-.32, .39, -2.57), (.32, .39, -2.57),
         (.44, .39, -1.52), (.33, .39, -.36), (-.33, .39, -.36),
         (-.44, .39, -1.52)], [(0, 1, 2, 3, 4, 5)], DARK, False)
    loft('Pilot seat', [(-1.32, .17, .14, .46), (-1.05, .20, .18, .48),
         (-.74, .17, .19, .48)], DARK, radial=16)
    loft('Pilot helmet', [(-1.49, .11, .11, .62), (-1.32, .14, .13, .64),
         (-1.14, .10, .10, .62)], DARK, radial=16)
    sections = [
        (-2.90, .015, .015, .35), (-2.72, .12, .075, .36),
        (-2.50, .22, .17, .37), (-2.27, .31, .27, .38),
        (-2.04, .38, .34, .39), (-1.78, .43, .39, .40),
        (-1.48, .45, .42, .40), (-1.19, .45, .42, .40),
        (-.90, .41, .38, .40), (-.65, .34, .31, .39),
        (-.41, .24, .22, .38), (-.22, .12, .10, .36),
        (-.10, .015, .015, .35),
    ]
    steps = 32
    vertices, faces = [], []
    for z, width, rise, base in sections:
        for j in range(steps + 1):
            angle = math.pi * j / steps
            vertices.append((width * math.cos(angle), base + rise * math.sin(angle), z))
    for i in range(len(sections) - 1):
        for j in range(steps):
            a = i * (steps + 1) + j
            c = a + steps + 1
            faces.append((a, a + 1, c + 1, c))
    mesh('Elongated dark bubble canopy and windshield', vertices, faces, GLASS)
    for side in (-1, 1):
        rail = [(side * width, base + .008, z) for z, width, _, base in sections]
        tube_polyline('Canopy lower rail', rail, .015, METAL, 8)
    # Thin transverse arch clearly separates forward windscreen from canopy.
    z, width, rise, base = sections[5]
    arch = [(width * math.cos(math.pi * j / steps),
             base + rise * math.sin(math.pi * j / steps) + .008, z)
            for j in range(steps + 1)]
    tube_polyline('Canopy transverse frame', arch, .012, METAL, 8)
    # Follow the canopy's own stations so the windscreen trim stays seated on
    # the glass and joins the transverse frame instead of floating above it.
    for side in (-1, 1):
        angle = math.pi * (.25 if side > 0 else .75)
        tube_polyline('Angled windscreen frame', [
            (width * math.cos(angle), base + rise * math.sin(angle) + .008, z)
            for z, width, rise, base in sections[1:6]
        ], .011, METAL, 8)


canopy_surface()


def body_surface_x(z, y):
    for first, second in zip(body_sections, body_sections[1:]):
        if z <= second[0]:
            t = (z - first[0]) / (second[0] - first[0])
            width, height, cy = [first[i] + t * (second[i] - first[i]) for i in (1, 2, 3)]
            break
    else:
        _, width, height, cy = body_sections[-1]
    vertical = min(1, abs((y - cy) / height)) ** (2 / .83)
    return width * max(0, 1 - vertical) ** (.83 / 2)


for side in (-1, 1):
    path = [(-2.21, .245, .215), (-1.52, .325, .270),
            (-.72, .370, .315), (.32, .380, .325),
            (1.33, .340, .290), (2.15, .260, .220),
            (2.73, .150, .135)]
    vertices = []
    for z, upper, lower in path:
        for y in (upper, lower):
            x = side * (body_surface_x(z, y) + .012)
            vertices.append((x, y, z))
    faces = []
    for i in range(len(path) - 1):
        a = i * 2
        face = (a, a + 1, a + 3, a + 2)
        faces.append(face if side > 0 else tuple(reversed(face)))
    mesh('Sweeping red fuselage ribbon', vertices, faces, RED)


def intake():
    # The real chin duct is flattened across its crown and belly, with cut
    # shoulders rather than a circular pipe. Carry that section aft into the
    # ventral fairing; its crown remains buried inside the fuselage.
    section_profile = [
        (1, .24), (.98, .58), (.88, .84), (.68, .98), (.48, 1),
        (-.48, 1), (-.68, .98), (-.88, .84), (-.98, .58), (-1, .24),
        (-.98, -.25), (-.85, -.70), (-.62, -.92), (-.40, -1),
        (.40, -1), (.62, -.92), (.85, -.70), (.98, -.25),
    ]

    def duct_ring(section):
        z, width, height, cy = section
        return [(width * x, cy + height * y, z) for x, y in section_profile]

    def duct_loft(name, sections, mat, inward=False):
        count = len(section_profile)
        vertices = [vertex for section in sections for vertex in duct_ring(section)]
        faces = []
        for i in range(len(sections) - 1):
            for j in range(count):
                a, b = i * count + j, i * count + (j + 1) % count
                c, d = a + count, b + count
                face = (a, b, d, c)
                faces.append(tuple(reversed(face)) if inward else face)
        return mesh(name, vertices, faces, mat)

    rings = [(-2.10, .40, .27, -.64), (-1.92, .44, .29, -.64),
             (-1.55, .45, .29, -.60), (-1.02, .43, .25, -.53),
             (-.48, .47, .23, -.46), (.18, .52, .23, -.43),
             (.86, .54, .21, -.41), (1.56, .49, .19, -.39),
             (2.25, .39, .17, -.37), (2.91, .27, .13, -.34),
             (3.43, .11, .07, -.29)]
    duct_loft('Flattened chin intake and aft duct', rings, SILVER)
    lip_outer = rings[0]
    lip_inner = (-2.105, .32, .18, -.64)
    count = len(section_profile)
    vertices = duct_ring(lip_outer) + duct_ring(lip_inner)
    faces = []
    for j in range(count):
        n = (j + 1) % count
        faces.append((j, n, count + n, count + j))
    mesh('Formed intake lip', vertices, faces, DARK)
    mouth = duct_ring((-2.14, .305, .175, -.64))
    mesh('Deep black chin intake opening', mouth,
         [tuple(range(count))], INLET, False)
    duct_loft('Recessed single inlet throat',
              [lip_inner, (-1.94, .28, .17, -.63), (-1.38, .21, .13, -.55)],
              INLET, inward=True)
    mesh('Dark inlet depth', duct_ring((-1.39, .21, .13, -.55)),
         [tuple(reversed(range(count)))], INLET, False)


intake()


def centerline_tank():
    # A flattened carrier overlaps the intake duct and tapers into its aft
    # underside. It gives the lower store a continuous, substantial mounting
    # surface without adding another round tube below the fuselage.
    loft('Layered ventral carrier fairing', [
        (-1.72, .19, .065, -.79), (-1.46, .35, .12, -.75),
        (-.95, .43, .15, -.71), (-.20, .45, .16, -.68),
        (.55, .46, .17, -.64), (1.30, .43, .16, -.60),
        (2.05, .35, .14, -.53), (2.65, .25, .10, -.46),
        (3.16, .09, .055, -.38),
    ], SILVER, radial=24, square=.43)
    # The tank and its swept saddle remain above the deployed landing gear.
    loft('Centerline underslung tank', [
        (-1.90, .005, .005, -1.09), (-1.78, .06, .05, -1.09),
        (-1.61, .12, .09, -1.08), (-1.38, .15, .11, -1.07),
        (-.92, .17, .12, -1.06), (-.20, .17, .12, -1.05),
        (.30, .14, .10, -1.04), (.62, .07, .055, -1.03),
        (.73, .005, .005, -1.02),
    ], SILVER, radial=24, square=.90)
    fin_plate('Swept centerline store saddle', [
        (0, -.76, -1.67), (0, -.79, -1.18),
        (0, -.81, -.35), (0, -.80, .43),
        (0, -.97, .48), (0, -1.01, .24),
        (0, -.98, -1.43),
    ], (.11, 0, 0), METAL)
    # The two matching swept plates share one fore/aft station. Their roots
    # disappear into opposite sides of the carrier and their lower edges cant
    # outward, leaving the centerline store clear.
    plate_profile = [(-.58, .97), (-.54, 2.12),
                     (-.95, 1.97), (-.99, 1.25)]
    for side, name in ((-1, 'Left'), (1, 'Right')):
        fin_plate(f'{name} red ventral plate', [
            (side * (.27 + .30 * (-.58 - y)), y, z)
            for y, z in plate_profile
        ], (.035, 0, 0), RED)


centerline_tank()


def nozzle():
    loft('Single jet nozzle sleeve', [(3.73, .43, .38, -.02),
                                      (3.96, .42, .39, -.02),
                                      (4.17, .39, .37, -.02)], METAL, radial=32)
    loft('Deep dark engine interior', [(3.84, .32, .30, -.02),
                                       (4.15, .32, .30, -.02)], DARK, radial=32, inward=True)
    mesh('Engine tunnel depth',
         [(0, -.02, 3.84)] + [(math.cos(math.tau * j / 32) * .32,
                              -.02 + math.sin(math.tau * j / 32) * .30, 3.84) for j in range(32)],
         [(0, 1 + j, 1 + (j + 1) % 32) for j in range(32)], DARK, False)
    for j in range(16):
        a = math.tau * j / 16
        b = math.tau * (j + .82) / 16
        ribbon('Individual metallic nozzle petal', [
            (.433 * math.cos(a), -.02 + .385 * math.sin(a), 3.83),
            (.433 * math.cos(b), -.02 + .385 * math.sin(b), 3.83),
            (.397 * math.cos(b), -.02 + .377 * math.sin(b), 4.16),
            (.397 * math.cos(a), -.02 + .377 * math.sin(a), 4.16),
        ], SILVER)
    vertices, faces = [], []
    for radius in (.39, .32):
        for j in range(32):
            a = math.tau * j / 32
            vertices.append((radius * math.cos(a), -.02 + radius * math.sin(a), 4.17))
    for j in range(32):
        n = (j + 1) % 32
        faces.append((j, n, 32 + n, 32 + j))
    mesh('Concentric nozzle exit ring', vertices, faces, METAL)
    exit_disk = []
    for z in (4.155, 4.152):
        exit_disk.append((0, -.02, z))
        exit_disk.extend((.313 * math.cos(math.tau * j / 32),
                          -.02 + .29 * math.sin(math.tau * j / 32), z)
                         for j in range(32))
    mesh('Dark recessed exhaust face', exit_disk,
         [(0, 1 + j, 1 + (j + 1) % 32) for j in range(32)] +
         [(33, 34 + (j + 1) % 32, 34 + j) for j in range(32)],
         TIRE, False)


nozzle()


def wheel(name, x, y, z, radius, width):
    # Rounded tire cross-section wrapped about its horizontal axle.
    profiles = [(-width / 2, radius * .78), (-width * .35, radius),
                (width * .35, radius), (width / 2, radius * .78)]
    vertices, faces = [], []
    radial = 16
    for dx, ring_radius in profiles:
        for j in range(radial):
            angle = math.tau * j / radial
            vertices.append((x + dx, y + ring_radius * math.cos(angle),
                             z + ring_radius * math.sin(angle)))
    for i in range(len(profiles) - 1):
        for j in range(radial):
            n = (j + 1) % radial
            a = i * radial + j
            faces.append((a, i * radial + n, (i + 1) * radial + n, a + radial))
    for end, ring in ((-1, 0), (1, (len(profiles) - 1) * radial)):
        center_index = len(vertices)
        vertices.append((x + end * width / 2, y, z))
        for j in range(radial):
            n = (j + 1) % radial
            face = (center_index, ring + j, ring + n)
            faces.append(face if end > 0 else tuple(reversed(face)))
    mesh(name + ' rubber tire', vertices, faces, TIRE)
    for side in (-1, 1):
        hub_x = x + side * (width / 2 + .004)
        hub = [(hub_x, y, z)] + [(hub_x, y + radius * .43 * math.cos(math.tau * j / radial),
                                 z + radius * .43 * math.sin(math.tau * j / radial)) for j in range(radial)]
        hub_faces = [(0, j + 1, (j + 1) % radial + 1) if side > 0 else
                     (0, (j + 1) % radial + 1, j + 1) for j in range(radial)]
        mesh(name + ' wheel hub', hub, hub_faces, METAL, False)


for side in (-1, 1):
    x, z = side * .86, .81
    wheel('Main landing gear', x, -1.02, z, .23, .18)
    beam('Main oleo strut', (side * .68, -.40, z - .12), (x, -.91, z), .065, .048, METAL)
    beam('Main gear diagonal brace', (side * .52, -.45, z + .28), (x, -.80, z), .034, .028, METAL, 8)
wheel('Nose landing gear', 0, -1.08, -2.68, .17, .15)
beam('Nose oleo strut', (0, -.37, -2.59), (0, -.98, -2.68), .055, .042, METAL)
beam('Nose scissor brace', (0, -.56, -2.38), (0, -.84, -2.68), .025, .023, METAL, 8)


# Keep the visual landing gear separate so flight can stow it without touching
# wheel contacts, collisions, or the ground/airborne state machine.
root = bpy.data.objects.new('Redspear_Fighter', None)
bpy.context.collection.objects.link(root)
gear_root = bpy.data.objects.new('FighterLandingGear', None)
bpy.context.collection.objects.link(gear_root)
gear_root.parent = root
for mat in (BASE, RED, FIN, MARK, MISSILE_NOSE, SILVER, PANEL, GLASS, DARK, METAL, TIRE, INLET):
    for gear in (False, True):
        objects = [obj for obj in bpy.data.objects if obj.type == 'MESH' and
                   obj.data.materials[0] == mat and
                   obj.name.startswith(('Main ', 'Nose ')) == gear]
        if not objects:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        joined.name = ('Gear_' if gear else '') + mat.name
        joined.parent = gear_root if gear else root

socket = bpy.data.objects.new('ExhaustSocket_Main', None)
bpy.context.collection.objects.link(socket)
socket.location = game_to_blender((0, -.02, 4.18))
socket.parent = root

output = Path(__file__).resolve().parents[1] / 'public/assets/models/aircraft/fighter.glb'
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB',
                          export_cameras=False, export_lights=False)
print(f'Firehawk exported to {output}')
