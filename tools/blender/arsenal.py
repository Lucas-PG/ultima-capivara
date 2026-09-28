"""Última Capivara first-person arsenal (v2). Blender 5.0.1.

Usage: blender -b --python tools/blender/arsenal.py -- [weapon ids...]
Writes output/arsenal/<id>.glb plus a JSON report of sockets and sizes.

Each weapon root holds a static `<id>_body` mesh, animated parts
(`<id>_slide`, `<id>_mag`, ...) whose origins are their pivots, and empties
for sockets (`<id>_muzzle`, `<id>_eject`, `<id>_sight`). Weapon space: X right,
Y forward, Z up; the origin is where the web of the firing paw sits.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
import arsenal_lib as L
from arsenal_lib import prism, box, cyl, tube, lathe, sphere, sweep, cut, cutter_box, cutter_cyl, cutter_prism, join, empty, mirror_x, array_along, complete

WEAPONS = {}


def weapon(fn):
    WEAPONS[fn.__name__] = fn
    return fn


def rot_x(obj, degrees, pivot=(0, 0, 0)):
    p = Vector(pivot)
    obj.data.transform(Matrix.Translation(p) @ Matrix.Rotation(math.radians(degrees), 4, 'X') @ Matrix.Translation(-p))
    obj.data.update()
    return obj


def move(obj, offset):
    obj.data.transform(Matrix.Translation(Vector(offset)))
    obj.data.update()
    return obj


# ------------------------------------------------------------------ pistol
@weapon
def pistol():
    """Chunky 9 mm service pistol: gunmetal slide, tan polymer frame, external hammer."""
    parts = {'body': [], 'slide': [], 'mag': [], 'trigger': [], 'hammer': []}
    # Slide with a front chamfer, rear serrations and an ejection port.
    slide = prism('slide', [(-.038, .033), (.168, .033), (.176, .041), (.176, .052), (.165, .069), (-.028, .069), (-.038, .061)],
                  .031, 'gunmetal', bevel=.0025, radius=[.002, .002, .004, .003, .006, .006, .004], raw=True)
    grooves = join([cutter_box((s * .0165, -.022 + i * .0042, .052), (.004, .0019, .03)) for s in (-1, 1) for i in range(7)], 'grooves')
    cut(slide, grooves)
    cut(slide, cutter_box((.012, .052, .066), (.018, .042, .016)))
    front_grooves = join([cutter_box((s * .0165, .128 + i * .0042, .055), (.004, .0019, .022)) for s in (-1, 1) for i in range(4)], 'fg')
    cut(slide, front_grooves)
    cut(slide, cutter_cyl((0, .15, .049), (0, .19, .049), .0072))
    parts['slide'] += [complete(slide)]
    parts['slide'] += [box('barrel_hood', (.001, .053, .058), (.016, .036, .012), 'steel', .0015)]
    parts['slide'] += [tube('muzzle_crown', (0, .166, .049), (0, .1765, .049), .0098, .0062, 'steel')]
    # Sights: rear notch with teal dots, front post with an orange dot.
    rear = box('rear_sight', (0, -.023, .074), (.03, .013, .011), 'dark', .002, raw=True)
    cut(rear, cutter_box((0, -.023, .079), (.0075, .02, .01)))
    parts['slide'] += [complete(rear)]
    for s in (-1, 1):
        parts['slide'] += [cyl('rear_dot', (s * .0085, -.0296, .0755), (s * .0085, -.0288, .0755), .0019, 'teal', sides=12, bevel=0)]
    parts['slide'] += [box('front_sight', (0, .157, .074), (.0065, .01, .012), 'dark', .0015)]
    parts['slide'] += [cyl('front_dot', (0, .1515, .0765), (0, .1525, .0765), .0021, 'orange', sides=12, bevel=0)]
    # Frame: dust cover with a light rail, then the raked grip with a beavertail.
    frame = prism('frame', [(-.034, .034), (.162, .034), (.162, .018), (.09, .014), (.074, .011), (.02, .011), (-.034, .02)],
                  .028, 'tan', bevel=.002, radius=.003, raw=True)
    rail = join([cutter_box((0, .105 + i * .012, .0125), (.04, .005, .004)) for i in range(4)], 'rail')
    cut(frame, rail)
    parts['body'] += [complete(frame)]
    grip = prism('grip', [(-.056, .034, 1), (-.03, .031, 1), (.019, .015, 1), (.022, .001), (.015, -.026), (.021, -.05), (.013, -.074),
                          (.006, -.106), (.001, -.115), (-.064, -.116), (-.068, -.108), (-.057, -.06), (-.048, -.018), (-.047, .005), (-.062, .02)],
                 .0305, 'tan', bevel=.003, smooth=3)
    parts['body'] += [grip]
    # Stippled grip panels in dark polymer, one per side.
    for s in (-1, 1):
        panel = prism('grip_panel', [(-.052, .0), (-.002, -.006), (-.01, -.092), (-.058, -.092)], .004, 'polymer',
                      x=s * .0148, bevel=.001, radius=.006)
        parts['body'] += [panel]
        # Relief dots that catch the light.
        for row in range(6):
            for col in range(4):
                y = -.05 + col * .011 + row * -.0012 + (.0055 if row % 2 else 0)
                z = -.012 - row * .013
                parts['body'] += [sphere('stipple', (s * .0168, y, z), (.0016, .0022, .0022), 'polymer', 8, 6)]
    # Trigger guard with a squared, grooved front.
    guard = prism('guard', [(.013, .013, 1), (.07, .013, 1), (.08, .004), (.075, -.03), (.062, -.036), (.017, -.034), (.012, -.02)],
                  .019, 'tan', bevel=.002, smooth=2, raw=True)
    cut(guard, cutter_prism([(.022, .006), (.064, .006), (.067, -.02), (.059, -.026), (.022, -.026)], .03))
    parts['body'] += [complete(guard)]
    parts['body'] += [box('slide_stop', (-.0158, .03, .03), (.004, .03, .006), 'dark', .0015)]
    parts['body'] += [box('takedown', (-.0152, .085, .026), (.003, .012, .006), 'dark', .001)]
    # Trigger (animated), hammer (animated, pivot at its pin).
    trig = prism('trigger', [(.034, .012, 1), (.041, .012, 1), (.043, .0), (.037, -.017), (.032, -.019), (.034, -.004)], .0075, 'dark', bevel=.0012, smooth=2)
    parts['trigger'] += [trig]
    hammer = prism('hammer', [(-.004, -.006, 1), (.004, -.006, 1), (.003, .006), (-.004, .011), (-.011, .011), (-.012, .005), (-.006, .0)], .01, 'dark', bevel=.0015, smooth=2)
    move(hammer, (0, -.036, .058))
    parts['hammer'] += [hammer]
    # Magazine: steel body inside the well, teal base plate. Built upright, then raked.
    mag_body = prism('mag_body', [(-.02, 0), (.02, 0), (.02, -.112), (-.02, -.112)], .02, 'steel', bevel=.0015, radius=.002)
    plate = prism('mag_plate', [(-.035, -.11, 1), (.033, -.11, 1), (.036, -.12), (-.037, -.123)], .032, 'teal', bevel=.002, smooth=2)
    top_round = cyl('mag_round', (0, -.012, -.004), (0, .012, -.004), .0048, 'brass', sides=14, bevel=.0008)
    mag = join([mag_body, plate, top_round], 'mag')
    rot_x(mag, -10)
    move(mag, (0, -.012, .02))
    parts['mag'] += [mag]
    sockets = {'muzzle': (0, .178, .049), 'eject': (.016, .052, .064), 'sight': (0, -.03, .0795)}
    pivots = {'hammer': (0, -.036, .058), 'mag': (0, -.012, .02)}
    return parts, sockets, pivots, {'magAxis': [0, -math.sin(math.radians(10)), -math.cos(math.radians(10))]}


# ------------------------------------------------------------------ pipeline
def build(weapon_id):
    L.reset_scene()
    L._materials.clear()
    parts, sockets, pivots, extra = WEAPONS[weapon_id]()
    root = empty(weapon_id)
    meshes = []
    for part, objects in parts.items():
        if not objects:
            continue
        obj = join(objects, f'{weapon_id}_{part}')
        # Move the origin to the pivot so the runtime can rotate/translate the part.
        pivot = Vector(pivots.get(part, (0, 0, 0)))
        obj.data.transform(Matrix.Translation(-pivot))
        obj.location = pivot
        obj.parent = root
        meshes.append(obj)
    for name, location in sockets.items():
        empty(f'{weapon_id}_{name}', location, root)
    albedo, orm = L.bake_weapon(meshes, weapon_id)
    albedo_img = L.save_png(f'{weapon_id}_albedo', albedo)
    orm_img = L.save_png(f'{weapon_id}_orm', orm, srgb=False)
    material = L.export_material(f'{weapon_id}_mat', albedo_img, orm_img)
    triangles = 0
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(material)
        triangles += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(L.OUT / f'{weapon_id}.glb'), export_format='GLB', use_selection=True,
                              export_image_format='WEBP', export_image_quality=90, export_animations=False, export_yup=True)
    bounds_min = Vector((1e9, 1e9, 1e9))
    bounds_max = -bounds_min
    for obj in meshes:
        for v in obj.data.vertices:
            w = obj.matrix_world @ v.co
            bounds_min = Vector(map(min, bounds_min, w))
            bounds_max = Vector(map(max, bounds_max, w))
    return {'id': weapon_id, 'triangles': triangles, 'parts': [o.name for o in meshes],
            'sockets': {k: list(v) for k, v in sockets.items()}, 'pivots': {k: list(v) for k, v in pivots.items()},
            'bounds': [list(bounds_min), list(bounds_max)], **extra}


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ids = argv or list(WEAPONS)
    report = {}
    report_path = L.OUT / 'report.json'
    if report_path.exists():
        report = json.loads(report_path.read_text())
    for weapon_id in ids:
        report[weapon_id] = build(weapon_id)
        print('ARSENAL', json.dumps(report[weapon_id]))
    report_path.write_text(json.dumps(report, indent=2))
