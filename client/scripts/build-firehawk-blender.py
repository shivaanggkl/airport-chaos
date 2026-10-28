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
    return tuple(int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def material(name, rgb, roughness, metalness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color(rgb), 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color(rgb), 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metalness
    return mat


BASE = material('AC_LIVERY_BASE', 'e8eced', .31, .14)
RED = material('AC_LIVERY_PRIMARY', 'd52030', .78, .0)
SILVER = material('AC_LIVERY_ACCENT', 'bfcbd0', .32, .31)
PANEL = material('AC_PANEL_LINES', '8496a4', .56, .10)
GLASS = material('AC_GLASS', '0b1724', .20, .19)
DARK = material('AC_DARK', '20262b', .43, .12)
METAL = material('AC_METAL', '7a8790', .30, .67)
TIRE = material('AC_TIRE', '101417', .82, .02)
INLET = material('AC_INLET_VOID', '030507', .96, .0)
GLASS.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = .88
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


body_sections = [
    (-3.48, .31, .27, -.02), (-3.22, .37, .30, -.01),
    (-2.87, .42, .34, .00), (-2.44, .49, .38, .01),
    (-2.00, .55, .42, .01), (-1.52, .63, .45, .01),
    (-1.04, .72, .47, .00), (-.55, .82, .47, -.01),
    (0, .85, .47, -.01), (.63, .82, .46, -.01),
    (1.25, .73, .43, -.01), (1.91, .61, .41, -.01),
    (2.55, .54, .39, -.02), (3.16, .49, .38, -.02),
    (3.64, .45, .36, -.02), (3.88, .42, .34, -.02),
]
loft('Fuselage continuous white shell', body_sections, BASE, radial=48, square=.83)
loft('Long charcoal radome', [
    (-4.68, .003, .003, -.10), (-4.51, .075, .065, -.09),
    (-4.24, .18, .15, -.06), (-3.86, .28, .24, -.03), body_sections[0],
], DARK, radial=48)
loft('Low blended dorsal spine', [
    (-.19, .16, .035, .43), (.24, .22, .085, .44),
    (.78, .25, .13, .43), (1.29, .23, .16, .42),
    (1.78, .20, .17, .40), (2.30, .13, .10, .39),
], BASE, radial=20)


# Main wing stations specify an actual airfoil volume instead of a flat
# extruded triangle. The near-root leading-edge extension flows into the
# fuselage; spanwise curvature and taper continue into a thin clipped tip.
wing_stations = [
    (.56, -1.70, 1.66, .01, .22),
    (.78, -1.66, 1.68, .01, .215),
    (1.06, -1.46, 1.67, .015, .20),
    (1.42, -1.22, 1.62, .022, .18),
    (1.88, -.96, 1.55, .030, .15),
    (2.35, -.70, 1.46, .045, .12),
    (2.83, -.42, 1.36, .061, .09),
    (3.25, -.19, 1.26, .078, .067),
    (3.51, -.07, 1.22, .084, .05),
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
    _, lead, trail, cy, thickness = station_at(x)
    z = lead + (trail - lead) * fraction
    camber = .016 * math.sin(math.pi * fraction)
    section = math.sin(math.pi * fraction) ** .72
    y = cy + camber + thickness * section * (.62 if upper else -.38)
    return (side * x, y + (lift if upper else -lift), z)


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
    cap = tuple(range((len(stations) - 1) * perimeter, len(stations) * perimeter))
    faces.append(cap if side > 0 else tuple(reversed(cap)))
    return mesh(name, vertices, faces, mat)


def upper_mark(name, side, coordinates, mat):
    points = [wing_point(side, x, fraction, lift=.009) for x, fraction in coordinates]
    # Top-facing winding for both mirrored sides.
    a, b, c = [Vector(point) for point in points[:3]]
    if (b - a).cross(c - a).y < 0:
        points.reverse()
    return ribbon(name, points, mat)


for side in (-1, 1):
    wing_surface('Shaped swept main wing', wing_stations, side, BASE)
    # A separate curved leading-edge root fairing carries the wing into the
    # upper fuselage. It fills the abrupt triangle at the cockpit shoulder.
    mesh('Blended leading-edge root extension', [
        (side * .47, .22, -2.33), (side * .61, .24, -2.17),
        (side * .83, .20, -1.91), (side * 1.06, .15, -1.46),
        (side * .80, .02, -1.49), (side * .53, .09, -1.93),
    ], [(0, 1, 2, 3, 4, 5) if side > 0 else (5, 4, 3, 2, 1, 0)], BASE)
    # Each red field is a designed, multi-part wing motif. Slender silver
    # separators and aileron seams make it read as aircraft paint, not tape.
    upper_mark('Red racing feather forward', side, [
        (.93, .26), (1.39, .23), (2.05, .18), (3.21, .11),
        (3.31, .16), (2.45, .26), (1.74, .34), (.97, .37),
    ], RED)
    upper_mark('Red racing feather aft', side, [
        (1.06, .56), (1.54, .54), (2.14, .49), (3.19, .44),
        (3.12, .50), (2.24, .59), (1.57, .66), (1.09, .66),
    ], RED)
    upper_mark('Aileron hinge', side, [
        (1.22, .83), (3.36, .83), (3.36, .845), (1.22, .845),
    ], PANEL)
    upper_mark('Outer wing panel seam', side, [
        (3.19, .08), (3.20, .08), (3.20, .92), (3.19, .92),
    ], PANEL)
    upper_mark('Inner wing control seam', side, [
        (1.75, .78), (1.77, .78), (1.78, .94), (1.76, .94),
    ], PANEL)
    # Tip plates and visual-only stores use the same low-cost material slots.
    beam('Red wingtip', wing_point(side, 3.51, .12, lift=-.10),
         wing_point(side, 3.51, .88, lift=-.10), .066, .055, RED, 8)
    beam('Underwing store', (side * 2.26, -.23, -.17), (side * 2.26, -.23, .79), .12, .10, SILVER, 12)
    beam('Store pylon', (side * 2.26, -.07, .24), (side * 2.26, -.23, .24), .06, .045, METAL, 8)


def tail_wing(side):
    stations = [(.38, 2.23, 3.65, .16, .12), (.81, 2.42, 3.58, .18, .10),
                (1.32, 2.70, 3.43, .22, .067), (1.69, 2.84, 3.36, .25, .035)]
    wing_surface('Swept horizontal stabilizer', stations, side, BASE, .80)
    beam('Red tailplane tip', (side * 1.69, .25, 2.88),
         (side * 1.69, .25, 3.33), .038, .030, RED, 8)


for side in (-1, 1):
    tail_wing(side)


def fin():
    outline = [
        (1.45, .30), (3.53, .34), (3.38, .88),
        (3.18, 1.58), (3.08, 1.91), (2.75, 1.93),
        (2.61, 1.65), (2.45, 1.24),
    ]
    vertices = [(x, y, z) for x in (-.065, .065) for z, y in outline]
    count = len(outline)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for i in range(count):
        n = (i + 1) % count
        faces.append((i, n, count + n, count + i))
    mesh('Single swept red vertical stabilizer', vertices, faces, RED, False)
    # A mirrored, original falcon-wing silhouette, deliberately without text.
    graphic = [
        [(1.98, .62), (2.41, .79), (2.76, 1.08), (3.06, 1.20),
         (2.82, 1.18), (2.57, 1.00), (2.26, .80)],
        [(2.36, .83), (2.69, 1.16), (2.90, 1.57), (2.79, 1.66),
         (2.58, 1.26)],
        [(2.60, 1.05), (2.90, 1.19), (3.19, 1.35),
         (2.98, 1.39), (2.73, 1.25)],
    ]
    for side in (-1, 1):
        for points in graphic:
            ribbon('Original white falcon fin mark',
                   [(side * .071, y, z) for z, y in points], BASE)
        ribbon('Fin rudder hinge', [
            (side * .071, .52, 3.34), (side * .071, 1.56, 3.09),
            (side * .071, 1.56, 3.104), (side * .071, .52, 3.355),
        ], PANEL)


fin()


def canopy_surface():
    # A dark recessed cockpit well remains legible beneath the tinted shell.
    mesh('Cockpit opening', [(-.32, .39, -2.57), (.32, .39, -2.57),
         (.44, .39, -1.52), (.33, .39, -.36), (-.33, .39, -.36),
         (-.44, .39, -1.52)], [(0, 1, 2, 3, 4, 5)], DARK, False)
    loft('Pilot seat', [(-1.32, .17, .16, .52), (-1.05, .20, .20, .56),
         (-.74, .17, .21, .58)], DARK, radial=16)
    loft('Pilot helmet', [(-1.49, .12, .13, .71), (-1.32, .16, .17, .73),
         (-1.14, .11, .12, .71)], METAL, radial=16)
    sections = [
        (-2.78, .015, .015, .35), (-2.65, .12, .09, .36),
        (-2.48, .22, .20, .37), (-2.27, .31, .32, .38),
        (-2.04, .38, .40, .39), (-1.78, .43, .46, .40),
        (-1.48, .45, .48, .40), (-1.19, .45, .47, .40),
        (-.90, .41, .42, .40), (-.65, .34, .34, .39),
        (-.41, .24, .24, .38), (-.22, .12, .12, .36),
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
    # The inclined windscreen surround makes the forward section identifiable
    # in side and three-quarter views without a large opaque canopy stripe.
    for side in (-1, 1):
        tube_polyline('Angled windscreen frame', [
            (side * .12, .46, -2.65), (side * .25, .61, -2.43),
            (side * .42, .80, -1.78),
        ], .011, METAL, 8)


canopy_surface()


def body_width(z):
    for first, second in zip(body_sections, body_sections[1:]):
        if z <= second[0]:
            t = (z - first[0]) / (second[0] - first[0])
            return first[1] + t * (second[1] - first[1])
    return body_sections[-1][1]


for side in (-1, 1):
    path = [(-2.71, .015, .012), (-2.31, .055, -.013),
            (-1.40, .087, .013), (-.40, .094, .022),
            (.65, .080, .012), (1.75, .026, .007),
            (2.29, .008, .006)]
    vertices = []
    for z, upper, lower in path:
        for y in (upper, lower):
            width = body_width(z)
            x = side * (width * math.sqrt(max(.01, 1 - (y / .45) ** 2)) + .012)
            vertices.append((x, y, z))
    faces = []
    for i in range(len(path) - 1):
        a = i * 2
        face = (a, a + 1, a + 3, a + 2)
        faces.append(face if side > 0 else tuple(reversed(face)))
    mesh('Sweeping red fuselage ribbon', vertices, faces, RED)


def intake():
    # Rounded-square outer shell, rolled lip, a true recessed dark throat.
    rings = [(-2.10, .40, .27, -.64), (-1.92, .44, .29, -.64),
             (-1.55, .45, .29, -.60), (-1.02, .36, .23, -.51),
             (-.48, .22, .15, -.39), (-.26, .13, .09, -.36)]
    loft('Sculpted single chin intake housing', rings, SILVER, radial=24, square=.68)
    lip_outer = rings[0]
    lip_inner = (-2.105, .31, .19, -.64)
    count = 24
    vertices, faces = [], []
    for z, w, h, cy in (lip_outer, lip_inner):
        for j in range(count):
            angle = math.tau * j / count
            vertices.append((w * math.copysign(abs(math.cos(angle)) ** .68, math.cos(angle)),
                             cy + h * math.copysign(abs(math.sin(angle)) ** .68, math.sin(angle)), z))
    for j in range(count):
        n = (j + 1) % count
        faces.append((j, n, count + n, count + j))
    mesh('Formed intake lip', vertices, faces, DARK)
    mouth = [(w * math.copysign(abs(math.cos(math.tau * j / count)) ** .68,
                               math.cos(math.tau * j / count)),
              cy + h * math.copysign(abs(math.sin(math.tau * j / count)) ** .68,
                                     math.sin(math.tau * j / count)),
              -2.14) for j in range(count) for w, h, cy in [(.305, .185, -.64)]]
    mesh('Deep black chin intake opening', mouth,
         [tuple(range(count))], INLET, False)
    loft('Recessed single inlet throat', [lip_inner, (-1.94, .28, .18, -.63),
         (-1.38, .21, .14, -.55)],
         INLET, radial=count, square=.68, inward=True)
    for side in (-1, 1):
        # Side-visible recess follows the lip into the dark throat.
        ribbon('Intake side recess', [
            (side * .415, -.49, -2.08), (side * .465, -.48, -1.78),
            (side * .46, -.68, -1.51), (side * .39, -.80, -1.90),
        ], INLET)
    mesh('Dark inlet depth',
         [(0, -.55, -1.39)] + [(v[0] * .68, -.55 + (v[1] + .64) * .74, -1.39)
                               for v in vertices[count:]],
         [(0, 1 + j, 1 + (j + 1) % count) for j in range(count)], INLET, False)


intake()


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
    exit_disk = [(0, -.02, 4.155)] + [
        (.313 * math.cos(math.tau * j / 32),
         -.02 + .29 * math.sin(math.tau * j / 32), 4.155)
        for j in range(32)
    ]
    mesh('Dark recessed exhaust face', exit_disk,
         [(0, 1 + j, 1 + (j + 1) % 32) for j in range(32)] +
         [(0, 1 + (j + 1) % 32, 1 + j) for j in range(32)],
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
        mesh(name + ' wheel hub', hub, [tuple(range(radial + 1))], METAL, False)


for side in (-1, 1):
    x, z = side * .86, .81
    wheel('Main landing gear', x, -1.02, z, .23, .18)
    beam('Main oleo strut', (side * .68, -.40, z - .12), (x, -.91, z), .065, .048, METAL)
    beam('Main gear diagonal brace', (side * .52, -.45, z + .28), (x, -.80, z), .034, .028, METAL, 8)
    ribbon('Main gear white door', [
        (side * .57, -.46, z - .30), (side * .81, -.57, z - .24),
        (side * .81, -.57, z + .35), (side * .57, -.46, z + .26),
    ], BASE)
wheel('Nose landing gear', 0, -1.08, -2.68, .17, .15)
beam('Nose oleo strut', (0, -.37, -2.59), (0, -.98, -2.68), .055, .042, METAL)
beam('Nose scissor brace', (0, -.56, -2.38), (0, -.84, -2.68), .025, .023, METAL, 8)
for side in (-1, 1):
    ribbon('Nose gear door', [
        (side * .09, -.36, -2.95), (side * .18, -.40, -2.91),
        (side * .19, -.40, -2.34), (side * .10, -.36, -2.38),
    ], BASE)


# A mesh per material keeps the imported asset to six draw calls even though
# the geometry has many deliberately authored surfaces and control details.
root = bpy.data.objects.new('Redspear_Fighter', None)
bpy.context.collection.objects.link(root)
for mat in (BASE, RED, SILVER, PANEL, GLASS, DARK, METAL, TIRE, INLET):
    objects = [obj for obj in bpy.data.objects if obj.type == 'MESH' and obj.data.materials[0] == mat]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = mat.name
    joined.parent = root

socket = bpy.data.objects.new('ExhaustSocket_Main', None)
bpy.context.collection.objects.link(socket)
socket.location = game_to_blender((0, -.02, 4.18))
socket.parent = root

output = Path(__file__).resolve().parents[1] / 'public/assets/models/aircraft/fighter.glb'
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB',
                          export_cameras=False, export_lights=False)
print(f'Firehawk exported to {output}')
