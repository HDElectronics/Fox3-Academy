"""Original Su-25T exterior for Fox3: a stocky straight-wing attack jet, recognition-level shape only.
blender --background --threads 2 --python create_su25t.py -- --out REVIEW --only su25t

What the silhouette has to say, read off the public drawings listed in REFERENCES:
a shoulder wing sitting on two slab-sided nacelles, tall oval cheek intakes beside the cockpit, a short
deep nose that ends in a flat raked optical window, a raised canopy running into the T variant's dorsal
hump, one tall fin over a slender tail boom, tailplanes with dihedral and blunt airbrake pods at the
wingtips. Closed canopy, gear up, empty pylons. No internals, no engineering data.

Author frame: x = right, y = metres aft of the nose probe tips, z = up (0 is about the engine axis).
Export: glTF with nose toward -Z and up +Y, bounds centred on x and y, fitted to LENGTH and SPAN.
It shares the material set and the lofted-section approach of create_fleet.py, which runs its build
loop on import and so cannot be imported here.
"""
import argparse
import json
import math
import sys
from math import cos, pi, sin
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ID = 'su25t'
NAME = 'Su-25T'
LENGTH = 15.3   # JET_DIMENSIONS.su25t in src/render/jets.ts, nose probes included
SPAN = 14.4
PAINT = (.40, .42, .31)
# prepare_models.py decimates an aircraft above about 18 900 triangles; stay under it so the
# authored sections reach the app untouched.
TRIANGLE_BUDGET = 18000

REFERENCES = [
    {'url': 'https://commons.wikimedia.org/wiki/File:Suchoi_Su-25.svg',
     'use': 'Three-view of the basic Su-25 inspected 2026-11-16 for plan, side and front proportions; '
            'family reference, the T nose and hump are artist approximations; no image included in assets'},
    {'url': 'https://commons.wikimedia.org/wiki/File:Sukhoi_Su-25_two-view_silhouette.png',
     'use': 'Plan and head-on silhouette inspected 2026-11-16 as a recognition check'},
    {'url': 'https://www.digitalcombatsimulator.com/en/products/world/',
     'use': 'DCS variant identity: the Su-25T attack jet included with DCS World'},
]
CAVEATS = [
    'Original artist approximation for a game tutorial; proportions follow a public three-view of the basic '
    'Su-25 fitted to the Fox3 envelope of 15.3 m length and 14.4 m span, not survey measurements.',
    'T variant cues are approximate: the dorsal hump behind the canopy, the deeper nose and the flat raked '
    'optical window in its tip. Exact fairing outlines and window size are not verified.',
    'Shoulder wing on the nacelles with about 20 degrees of leading-edge sweep and slight anhedral, blunt '
    'wingtip airbrake pods shown closed, five empty pylons per side, tailplanes with dihedral.',
    'Closed canopy, retracted landing gear, no stores, no gun, antennas or sensors beyond two nose probes; '
    'simplified intakes and plain exhausts.',
    'Neutral review paint, not an authentic service livery.',
]

objects = []
collection = None
mats = {}


# ------------------------------------------------------------------------------------ mesh helpers

def blender_point(v):
    """Author (x, y aft of nose, z up) to Blender, where +Y is the nose."""
    return (v[0], LENGTH / 2 - v[1], v[2])


def material(name, colour, metal=0, rough=.5):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*colour, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*colour, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    return m


def make_materials():
    """The eastern fleet's material set; names decide what the app may tint (src/render/assets.ts)."""
    tone = lambda k: tuple(min(1, c * k) for c in PAINT)
    mats.update(
        paint=material(NAME + ' satin paint', PAINT, .22, .46),
        light=material('Light control panels', tone(1.10), .18, .48),
        frame=material('Canopy structural frame', tone(.64), .4, .32),
        glass=material('Tinted canopy', (.028, .087, .106), .52, .18),
        window=material('Nose optical window glass', (.11, .21, .25), .55, .16),
        dark=material('Deep recess', (.008, .012, .014), .1, .62),
        seam=material('Restrained panel seam', (.18, .23, .24), .15, .6),
        steel=material('Heat-darkened exhaust metal', (.17, .16, .14), .78, .32),
        red=material('Port lens', (.35, .012, .012), .3, .22),
        green=material('Starboard lens', (.02, .29, .08), .3, .22),
    )
    for key in ('glass', 'window'):
        mats[key].node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = .55


def mesh(name, verts, faces, mat='paint', smooth=True, recalc=True):
    """One object from author-frame vertices. Quads shade smooth, caps and plates stay flat."""
    data = bpy.data.meshes.new(name)
    data.from_pydata([blender_point(v) for v in verts], [], faces)
    data.update()
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(data)
        bm.free()
    ob = bpy.data.objects.new(name, data)
    collection.objects.link(ob)
    data.materials.append(mats[mat])
    for face in data.polygons:
        face.use_smooth = smooth and len(face.vertices) == 4
    objects.append(ob)
    return ob


def curve(name, points, radius=.008, mat='seam', sides=1):
    """A thin round bead through the points: frames, lips, seams, probes."""
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius
    data.bevel_resolution = sides
    spline = data.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, v in zip(spline.points, points):
        point.co = (*blender_point(v), 1)
    ob = bpy.data.objects.new(name, data)
    collection.objects.link(ob)
    data.materials.append(mats[mat])
    objects.append(ob)
    return ob


def spline(stations, steps):
    """Catmull-Rom rows through the stations. The first value (the station position) runs linearly;
    the others are clamped to their span so a steep change never overshoots into a bulge."""
    rows = []
    last = len(stations) - 1
    for i in range(last):
        a, b, c, d = stations[max(0, i - 1)], stations[i], stations[i + 1], stations[min(last, i + 2)]
        for j in range(steps):
            t = j / steps
            row = [b[0] + (c[0] - b[0]) * t]
            for k in range(1, len(b)):
                v = .5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t
                          + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t ** 3)
                row.append(min(max(v, min(b[k], c[k])), max(b[k], c[k])))
            rows.append(tuple(row))
    return rows + [tuple(stations[-1])]


def ring(y, half_width, z_bottom, z_top, x=0, rake=0, power=.72):
    """A body cross-section at y. power 1 is an ellipse, lower values square it toward a slab.
    rake leans the section: metres the top sits ahead of the centre per metre of height."""
    return (y, half_width, z_bottom, z_top, x, rake, power)


def squash(v, power):
    return math.copysign(abs(v) ** power, v)


def ring_points(row, segments, scale=1, shift=0):
    y, half_width, z_bottom, z_top, x, rake, power = row
    centre = (z_bottom + z_top) / 2
    half_height = max(.001, (z_top - z_bottom) / 2) * scale
    half_width = max(.001, half_width) * scale
    points = []
    for j in range(segments):
        a = 2 * pi * j / segments
        dz = half_height * squash(sin(a), power)
        points.append((x + half_width * squash(cos(a), power), y + shift - rake * dz, centre + dz))
    return points


def tube(name, rings, mat='paint', steps=3, segments=40, front_cap=True, back_cap=True):
    """Loft a closed skin through body sections, nose to tail."""
    rows = spline(rings, steps)
    verts = [p for row in rows for p in ring_points(row, segments)]
    faces = []
    for i in range(len(rows) - 1):
        for j in range(segments):
            q = i * segments + j
            r = i * segments + (j + 1) % segments
            faces.append((q, r, r + segments, q + segments))
    if front_cap:
        faces.append(tuple(range(segments - 1, -1, -1)))
    if back_cap:
        faces.append(tuple((len(rows) - 1) * segments + j for j in range(segments)))
    return mesh(name, verts, faces, mat)


def disc(name, points, mat, aft=False):
    """A flat face through a ring of points, facing the nose unless aft is set."""
    placed = [Vector(blender_point(p)) for p in points]
    normal = sum((placed[j].cross(placed[(j + 1) % len(placed)]) for j in range(len(placed))), Vector())
    order = range(len(points))
    if (normal.y < 0) != aft:   # Blender +Y is the nose
        order = reversed(order)
    return mesh(name, points, [tuple(order)], mat, smooth=False, recalc=False)


def band(name, front, back, mat):
    """A short wall between two rings of equal point count: intake and exhaust throats."""
    n = len(front)
    return mesh(name, front + back, [(j, (j + 1) % n, (j + 1) % n + n, j + n) for j in range(n)], mat)


def foil(name, stations, mat='paint', side=1, upright=False, steps=3, segments=32):
    """A lifting surface with a rounded leading edge and a thin trailing edge (artist section, no
    aerofoil data). Stations: (span, leading-edge y, trailing-edge y, datum z, half thickness).
    Flat surfaces spread along x at height datum; an upright one stands on datum at x = 0."""
    rows = spline(stations, steps)
    verts = []
    for span, lead, trail, datum, half_thickness in rows:
        for j in range(segments):
            a = 2 * pi * j / segments
            u = (1 - cos(a)) / 2
            y = lead + (trail - lead) * u
            h = half_thickness * sin(a) * max(.02, 1 - u) ** .38
            verts.append((h, y, datum + span) if upright else (side * span, y, datum + h))
    faces = []
    for i in range(len(rows) - 1):
        for j in range(segments):
            q = i * segments + j
            r = i * segments + (j + 1) % segments
            faces.append((q, r, r + segments, q + segments))
    faces.append(tuple(range(segments - 1, -1, -1)))
    faces.append(tuple((len(rows) - 1) * segments + j for j in range(segments)))
    return mesh(name, verts, faces, mat)


def slab(name, outline_yz, x, thickness, mat='paint'):
    """A flat-sided plate standing in the y-z plane: pylons."""
    n = len(outline_yz)
    verts = [(x + d, y, z) for d in (-thickness / 2, thickness / 2) for y, z in outline_yz]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    faces += [(j, (j + 1) % n, (j + 1) % n + n, j + n) for j in range(n)]
    return mesh(name, verts, faces, mat, smooth=False)


def canopy(name, stations, bows=()):
    """A closed glazed shell (upper half sections only) with sills and frame bows. Stations:
    (y, half width, height, sill z)."""
    rows = spline(stations, 5)
    n = 25
    verts = [(w * cos(pi * j / (n - 1)), y, z + h * sin(pi * j / (n - 1))) for y, w, h, z in rows for j in range(n)]
    faces = []
    for i in range(len(rows) - 1):
        for j in range(n - 1):
            q = i * n + j
            faces.append((q, q + 1, q + n + 1, q + n))
    mesh(name, verts, faces, 'glass')
    for s in (-1, 1):
        curve(name + ' sill ' + str(s), [(s * w, y, z + .008) for y, w, h, z in rows], .028, 'frame')
    for at in bows:
        y, w, h, z = min(rows, key=lambda row: abs(row[0] - at))
        curve(name + ' bow %.2f' % at, [(w * cos(pi * j / 24), y, z + h * sin(pi * j / 24) + .006) for j in range(25)], .026, 'frame')


def drape(host, name, points_xy):
    """Lay a seam on the upper surface of a host mesh along (x, y) points."""
    path = []
    for x, y in points_xy:
        hit, location, normal, face = host.ray_cast(Vector(blender_point((x, y, 8))), Vector((0, 0, -1)))
        if hit:
            path.append((location.x, LENGTH / 2 - location.y, location.z + .007))
    if len(path) > 1:
        curve(name, path, .007, 'seam', sides=0)


# ------------------------------------------------------------------------------------ the aircraft

def aircraft():
    # Fuselage: the nose is short and deep and starts at a flat face raked back toward the chin (the
    # optical window). The belly runs flat to the exhausts, then the body thins into a slim tail boom
    # that carries the fin and tailplanes.
    body = [
        ring(1.18, .29, -.74, -.10, rake=.55, power=.82),
        ring(1.62, .36, -.78, -.04, power=.76),
        ring(2.05, .43, -.80, .05),
        ring(2.55, .49, -.83, .16),
        ring(3.05, .52, -.85, .30),
        ring(3.70, .53, -.86, .44),
        ring(4.60, .53, -.86, .52),
        ring(6.00, .53, -.86, .56),
        ring(9.00, .52, -.85, .58),
        ring(10.40, .48, -.76, .66),
        ring(11.40, .42, -.52, .80, power=.8),
        ring(12.40, .34, -.14, .88, power=.86),
        ring(13.40, .28, .16, .90, power=.9),
        ring(14.30, .23, .38, .93, power=.9),
        ring(15.00, .19, .52, .97, power=.9),
        ring(15.30, .14, .62, .95, power=.9),
    ]
    tube('01 Fuselage with deep nose and tail boom', body, front_cap=False)
    # The window: the raked face closes the nose, with a framed glass panel just proud of it.
    disc('Nose face', ring_points(body[0], 40), 'paint')
    pane = ring_points(body[0], 40, scale=.8, shift=-.012)
    disc('Nose optical window', pane, 'window')
    curve('Nose window frame', pane + [pane[0]], .016, 'frame')
    # Two nose probes, the starboard one a little shorter.
    curve('Port nose probe', [(-.27, 0, -.23), (-.27, 1.8, -.23)], .022, 'frame')
    curve('Starboard nose probe', [(.27, .16, -.23), (.27, 1.8, -.23)], .022, 'frame')

    # Raised single-seat canopy, then the T variant's dorsal hump from the canopy back to the fin.
    canopy('Raised single-seat canopy', [
        (3.02, .04, .02, .30), (3.30, .31, .30, .29), (3.75, .40, .62, .30), (4.20, .42, .72, .31),
        (4.70, .42, .70, .34), (5.10, .41, .69, .35), (5.45, .39, .69, .36),
    ], bows=(3.80, 4.75))
    tube('02 Dorsal hump', [
        ring(4.90, .30, -.3, .66, power=1), ring(5.40, .44, -.3, 1.04, power=1), ring(6.30, .47, -.3, 1.12, power=1),
        ring(7.60, .47, -.3, 1.10, power=1), ring(9.40, .43, -.2, 1.03, power=1), ring(10.80, .34, 0, .96, power=1),
        ring(12.00, .22, .3, .92, power=1), ring(12.70, .12, .5, .90, power=1),
    ], segments=28)

    # One tall fin with a dorsal fillet, standing on the boom.
    foil('Single tall fin', [
        (0, 10.75, 14.08, .80, .11), (.45, 11.42, 14.02, .80, .10), (1.00, 11.86, 13.95, .80, .085),
        (2.00, 12.60, 13.82, .80, .065), (2.75, 13.14, 13.72, .80, .045), (2.82, 13.22, 13.70, .80, .035),
    ], upright=True, segments=28)

    for s in (-1, 1):
        tag = 'Port' if s < 0 else 'Starboard'
        # Slab-sided nacelle along the fuselage side under the wing root. The raked oval intake stands
        # just clear of the fuselage beside the cockpit; the exhaust ends well ahead of the tail.
        nacelle = [
            ring(5.62, .32, -.72, .22, x=s * .93, rake=.12, power=.8),
            ring(6.15, .39, -.84, .34, x=s * .93, power=.68),
            ring(7.20, .40, -.86, .36, x=s * .93, power=.68),
            ring(9.60, .40, -.86, .36, x=s * .93, power=.68),
            ring(10.50, .39, -.80, .34, x=s * .90, power=.72),
            ring(11.00, .36, -.62, .24, x=s * .85, power=.9),
            ring(11.25, .33, -.50, .16, x=s * .82, power=1),
        ]
        tube(tag + ' engine nacelle', nacelle, segments=36, front_cap=False)
        throat = ring_points(nacelle[0], 36, scale=.9, shift=.22)
        band(tag + ' intake throat', ring_points(nacelle[0], 36), throat, 'dark')
        disc(tag + ' intake shadow', throat, 'dark')
        lip = ring_points(nacelle[0], 48)
        curve(tag + ' intake lip', lip + [lip[0]], .034, 'light')
        # Plain round exhaust pipe.
        pipe = [ring(11.15, .335, -.505, .165, x=s * .82, power=1), ring(11.60, .30, -.47, .13, x=s * .82, power=1)]
        tube(tag + ' exhaust pipe', pipe, 'steel', steps=1, segments=28, front_cap=False, back_cap=False)
        disc(tag + ' exhaust cavity', ring_points(ring(11.52, .29, -.46, .12, x=s * .82, power=1), 28), 'dark', aft=True)

        # Shoulder wing on top of the nacelle: about 20 degrees of leading-edge sweep, straight trailing
        # edge, strong taper and slight anhedral.
        wing = foil(tag + ' straight shoulder wing', [
            (.45, 6.77, 10.10, .46, .165), (1.32, 7.08, 10.08, .425, .155), (3.20, 7.75, 10.07, .345, .12),
            (5.10, 8.43, 10.07, .265, .085), (6.86, 9.05, 10.07, .19, .055),
        ], side=s)
        leading = lambda x: 6.61 + .356 * x
        drape(wing, tag + ' flap and aileron line', [(s * x, 10.07 - .27 * (10.07 - leading(x))) for x in (1.4, 2.6, 3.8, 5.0, 6.2, 6.8)])
        drape(wing, tag + ' flap break', [(s * 4.6, y) for y in (9.38, 9.6, 9.85, 10.05)])

        # Wingtip airbrake pod: blunt, clearly thicker than the wing, closed, with the split line
        # of the two petals around its back half.
        px, pz = s * 6.97, .185
        tube(tag + ' wingtip airbrake pod', [
            ring(8.45, .03, pz - .025, pz + .025, x=px, power=.85), ring(8.62, .16, pz - .11, pz + .11, x=px, power=.85),
            ring(8.95, .225, pz - .155, pz + .155, x=px, power=.85), ring(10.20, .23, pz - .16, pz + .16, x=px, power=.85),
            ring(10.56, .20, pz - .14, pz + .14, x=px, power=.85),
        ], steps=2, segments=20)
        curve(tag + ' airbrake split line', [(px + d, y, pz) for d, y in ((.236, 9.65), (.236, 10.2), (.208, 10.57), (-.208, 10.57), (-.236, 10.2), (-.236, 9.65))], .008, 'seam', sides=0)
        curve(tag + ' navigation light', [(s * 7.185, 8.98, pz), (s * 7.185, 9.16, pz)], .024, 'red' if s < 0 else 'green')

        # Five empty pylons under the wing: four large, one small outboard.
        for j, x in enumerate((2.08, 2.87, 3.66, 4.43, 5.16)):
            top = .46 - .042 * (x - .45)
            depth, reach = (.40, 1.30) if j < 4 else (.26, .85)
            front = leading(x)
            slab('%s pylon %d' % (tag, j + 1), [
                (front - .30, top - depth + .13), (front - .16, top - depth), (front + reach - .15, top - depth),
                (front + reach, top), (front + .05, top),
            ], s * x, .09)

        # Tailplane with visible dihedral.
        foil(tag + ' tailplane', [
            (.15, 12.34, 14.22, .80, .075), (1.00, 12.72, 14.18, .89, .06), (2.00, 13.17, 14.10, .995, .04),
            (2.34, 13.36, 13.98, 1.03, .028),
        ], 'light', side=s, segments=24)


# ------------------------------------------------------------------------------------ export

def fit_and_export(path):
    """Convert beads to meshes, centre the bounds on x and y, fit them to SPAN and LENGTH, export."""
    global objects
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target='MESH')
    objects = list(bpy.context.selected_objects)
    bpy.context.view_layer.update()
    points = [ob.matrix_world @ v.co for ob in objects for v in ob.data.vertices]
    low = [min(p[k] for p in points) for k in range(3)]
    high = [max(p[k] for p in points) for k in range(3)]
    scale_x, scale_y = SPAN / (high[0] - low[0]), LENGTH / (high[1] - low[1])
    centre_x, centre_y = (high[0] + low[0]) / 2, (high[1] + low[1]) / 2
    for ob in objects:
        world = ob.matrix_world.copy()
        for v in ob.data.vertices:
            p = world @ v.co
            v.co = ((p.x - centre_x) * scale_x, (p.y - centre_y) * scale_y, p.z)
        ob.matrix_world.identity()
    root = bpy.data.objects.new(NAME + ' | Visual review prototype', None)
    collection.objects.link(root)
    for ob in objects:
        ob.parent = root
    root['scope'] = 'Original approximate exterior visual study only; no engineering or performance model.'
    root['configuration'] = 'Clean airframe, gear retracted, empty pylons, neutral review paint.'
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False)
    points = [v.co for ob in objects for v in ob.data.vertices]
    size = [max(p[k] for p in points) - min(p[k] for p in points) for k in range(3)]
    triangles = 0
    for ob in objects:
        ob.data.calc_loop_triangles()
        triangles += len(ob.data.loop_triangles)
    return {'span_x': size[0], 'length_z': size[1], 'height_y': size[2]}, {
        'objects': len(objects), 'triangles': triangles,
        'vertices': sum(len(ob.data.vertices) for ob in objects), 'glb_bytes': path.stat().st_size}


def build(out):
    global collection
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objects.clear()
    mats.clear()
    collection = bpy.data.collections.new(NAME + ' | Original visual exterior')
    bpy.context.scene.collection.children.link(collection)
    make_materials()
    aircraft()
    measured, stats = fit_and_export(out / 'model.glb')
    assert stats['triangles'] <= TRIANGLE_BUDGET, 'Over the triangle budget: prepare_models.py would decimate it'
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'model.blend'))
    manifest = {
        'id': ID, 'name': NAME, 'status': 'review', 'length_m': LENGTH, 'span_m': SPAN,
        'dimensions_measured_m': measured,
        'axis': {'gltf': 'nose -Z, up +Y, right +X', 'blender': 'nose +Y, up +Z, right +X', 'units': 'metres',
                 'origin': 'centered lateral and longitudinal bounds'},
        'references': REFERENCES, 'caveats': CAVEATS,
        'geometry_provenance': 'Original scripted meshes; no downloaded meshes or external textures.',
        'generator': '../create_su25t.py',
        'rebuild_command': 'Blender --background --python create_su25t.py -- --out OUTPUT --only ' + ID,
        'blender_version': bpy.app.version_string, 'stats': stats,
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('SU25T_MODEL_COMPLETE', measured, stats, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--only', nargs='*')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if args.only and set(args.only) != {ID}:
        parser.error('This builder makes ' + ID + ' only')
    build(args.out.resolve() / ID)


if __name__ == '__main__':
    main()
