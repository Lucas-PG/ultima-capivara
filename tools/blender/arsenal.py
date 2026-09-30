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
    """Pistola: enamel slide, bronze frame and palm-inlaid jacaranda scales."""
    parts = {'body': [], 'slide': [], 'mag': [], 'trigger': [], 'hammer': [], 'release': []}
    # Slide with a front chamfer, rear serrations and an ejection port.
    slide = prism('slide', [(-.038, .033), (.168, .033), (.176, .041), (.176, .052), (.165, .069), (-.028, .069), (-.038, .061)],
                  .035, 'teal', bevel=.0025, radius=[.002, .002, .004, .003, .006, .006, .004], raw=True)
    grooves = join([cutter_box((s * .0185, -.022 + i * .0042, .052), (.004, .0019, .03)) for s in (-1, 1) for i in range(7)], 'grooves')
    cut(slide, grooves)
    cut(slide, cutter_box((.012, .052, .066), (.018, .042, .016)))
    front_grooves = join([cutter_box((s * .0185, .128 + i * .0042, .055), (.004, .0019, .022)) for s in (-1, 1) for i in range(4)], 'fg')
    cut(slide, front_grooves)
    cut(slide, cutter_cyl((0, .15, .049), (0, .19, .049), .0072))
    parts['slide'] += [complete(slide)]
    parts['body'] += [box('barrel_hood', (.001, .053, .058), (.016, .036, .012), 'brass', .0015)]
    parts['body'] += [tube('muzzle_crown', (0, .166, .049), (0, .1765, .049), .0098, .0062, 'brass')]
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
                  .030, 'case', bevel=.002, radius=.003, raw=True)
    rail = join([cutter_box((0, .105 + i * .012, .0125), (.04, .005, .004)) for i in range(4)], 'rail')
    cut(frame, rail)
    parts['body'] += [complete(frame)]
    grip = prism('grip', [(-.056, .034, 1), (-.03, .031, 1), (.019, .015, 1), (.022, .001), (.015, -.026), (.021, -.05), (.013, -.074),
                          (.006, -.106), (.001, -.115), (-.064, -.116), (-.068, -.108), (-.057, -.06), (-.048, -.018), (-.047, .005), (-.062, .02)],
                 .029, 'case', bevel=.003, smooth=3)
    parts['body'] += [grip]
    # Raised wood scales, flush brass screws and a clear inlay field.
    for side in (-1, 1):
        parts['body'] += [prism('grip_scale', [(-.048, .006), (-.005, -.005), (-.014, -.098), (-.058, -.101)],
                               .005, 'wood_red', x=side * .0148, bevel=.0018, radius=.004)]
        for y, z in [(-.029, -.013), (-.039, -.084)]:
            parts['body'] += [cyl('scale_escutcheon', (side * .017, y, z), (side * .018, y, z), .0052, 'brass', sides=20, bevel=.0006)]
            screw = cyl('scale_screw', (side * .0178, y, z), (side * .0185, y, z), .0028, 'case', sides=16, bevel=.0003)
            cut(screw, cutter_box((side * .0187, y, z), (.002, .004, .0008)))
            parts['body'] += [screw]
        parts['body'] += [cyl('frame_pin', (side * .0151, .0, .02), (side * .016, .0, .02), .0025, 'steel', sides=12, bevel=.0004)]
    # Back strap ribs stay below the beavertail and leave the inlay unobstructed.
    for i in range(9):
        z = -.02 - i * .009
        parts['body'] += [box('backstrap_rib', (0, -.049 - i * .0012, z), (.018, .0026, .003), 'polymer', .0007)]
    # Keep the lower bridge thin enough to sit between the two thick digits.
    # The deeper front bow preserves the squared silhouette and the large opening.
    guard = prism('guard', [(-.010, .014, 1), (.077, .014, 1), (.088, .002), (.082, -.034), (.067, -.0405), (-.004, -.0405), (-.010, -.027)],
                  .022, 'case', bevel=.0015, radius=.003, raw=True)
    cut(guard, cutter_prism([(.003, .006), (.072, .006), (.077, -.002), (.071, -.032), (.060, -.037), (.003, -.037)], .04))
    # Shorten only the guard's forward bow; its opening still clears a paw digit.
    for vertex in guard.data.vertices:
        if vertex.co.y > .033: vertex.co.y = .033 + (vertex.co.y - .033) * .75
    parts['body'] += [complete(guard)]
    parts['release'] += [box('slide_stop', (-.017, .029, .027), (.004, .028, .006), 'brass', .0012)]
    for i in range(4):
        parts['release'] += [box('release_rib', (-.0191, .019 + i * .005, .027), (.001, .0016, .004), 'case', .0003)]
    parts['body'] += [box('takedown', (-.0165, .085, .026), (.003, .012, .006), 'dark', .001)]
    parts['body'] += [cyl('mag_catch', (-.0158, .009, -.005), (-.019, .009, -.005), .0045, 'brass', sides=16, bevel=.0007)]
    parts['body'] += [prism('safety', [(-.052, .034), (-.028, .034), (-.028, .043), (-.048, .041)], .005, 'brass', x=-.017, bevel=.001)]
    parts['body'] += [cyl('guide_rod', (0, .16, .024), (0, .168, .024), .004, 'brass', sides=16, bevel=.0007)]
    # Trigger (animated), hammer (animated, pivot at its pin).
    trig = prism('trigger', [(.034, .012, 1), (.041, .012, 1), (.043, .0), (.037, -.017), (.032, -.019), (.034, -.004)], .0175, 'brass', bevel=.0012, smooth=2)
    move(trig, (0, -.028, 0))
    parts['trigger'] += [trig]
    hammer = prism('hammer', [(-.004, -.006, 1), (.004, -.006, 1), (.003, .006), (-.004, .011), (-.011, .011), (-.012, .005), (-.006, .0)], .01, 'brass', bevel=.0015, smooth=2)
    move(hammer, (0, -.036, .058))
    parts['hammer'] += [hammer]
    # Magazine: steel body inside the well, teal base plate. Built upright, then raked.
    mag_body = prism('mag_body', [(-.02, 0), (.02, 0), (.02, -.112), (-.02, -.112)], .02, 'steel', bevel=.0015, radius=.002)
    plate = prism('mag_plate', [(-.035, -.11, 1), (.033, -.11, 1), (.036, -.12), (-.037, -.123)], .035, 'brass', bevel=.002, smooth=2)
    top_round = cyl('mag_round', (0, -.012, -.004), (0, .012, -.004), .0048, 'brass', sides=14, bevel=.0008)
    mag = join([mag_body, plate, top_round], 'mag')
    rot_x(mag, -10)
    move(mag, (0, -.012, 0))
    parts['mag'] += [mag]
    # Short, thick paw digits need a 42 mm backstrap-to-frontstrap span.
    # Keep the slide and guard at service-pistol proportions.
    grip_parts = {'grip', 'grip_scale', 'scale_escutcheon', 'scale_screw', 'backstrap_rib'}
    for obj in parts['body'] + parts['mag']:
        if obj in parts['mag'] or obj.name.split('.')[0] in grip_parts:
            obj.data.transform(Matrix.Diagonal((1, .50, 1, 1)))
            for vertex in obj.data.vertices:
                if vertex.co.z < 0: vertex.co.z *= .88
            obj.data.update()
    sockets = {'muzzle': (0, .178, .049), 'eject': (.016, .052, .064), 'sight': (0, -.03, .0795)}
    pivots = {'hammer': (0, -.036, .058), 'mag': (0, -.006, 0), 'trigger': (0, .008, .009), 'release': (-.017, .029, .027)}
    return parts, sockets, pivots, {'magAxis': [0, -.50 * math.sin(math.radians(10)), -.88 * math.cos(math.radians(10))]}


# ------------------------------------------------------------------ revolver
@weapon
def revolver():
    """Trinta-e-oito: blued bull barrel, engraved case frame and a porcelain capy medallion."""
    parts = {'body': [], 'cylinder': [], 'crane': [], 'action': [], 'rounds': [], 'hammer': [], 'trigger': [], 'mag': [], 'release': []}
    centre, chamber, bore = .045, .0175, .0625
    frame = prism('frame', [(-.037, .067), (-.030, .087), (.095, .087), (.102, .076), (.100, .021), (.078, .010),
                            (.012, .004), (-.031, -.009), (-.046, .01), (-.049, .047)], .029, 'case', bevel=.0022, radius=.004, raw=True)
    cut(frame, cutter_box((0, .046, .046), (.08, .057, .063)))
    parts['body'] += [complete(frame)]
    parts['body'] += [cyl('barrel', (0, .097, bore), (0, .269, bore), .0115, 'blued', sides=32)]
    parts['body'] += [tube('crown', (0, .263, bore), (0, .271, bore), .012, .0052, 'brass', sides=28)]
    parts['body'] += [tube('barrel_band', (0, .101, bore), (0, .105, bore), .0125, .0108, 'brass', sides=28, bevel=.0006)]
    lug = prism('underlug', [(.099, .052), (.264, .052), (.270, .044), (.263, .029), (.108, .025), (.099, .032)], .023, 'blued', bevel=.002, radius=.003, raw=True)
    cut(lug, cutter_box((-.010, .107, centre), (.019, .065, .012)))
    parts['body'] += [complete(lug)]
    rib = box('vent_rib', (0, .181, .078), (.013, .178, .009), 'blued', .0013, raw=True)
    cut(rib, join([cutter_box((0, .111 + i * .025, .075), (.018, .018, .006)) for i in range(6)], 'rib_vents'))
    parts['body'] += [complete(rib)]
    parts['body'] += [prism('front_blade', [(.244, .081), (.266, .081), (.266, .089), (.251, .095)], .006, 'dark', bevel=.001)]
    parts['body'] += [box('front_insert', (0, .251, .0917), (.0045, .004, .0056), 'red', .0007)]
    rear = box('adjustable_rear', (0, -.026, .09), (.029, .023, .013), 'dark', .0016, raw=True)
    cut(rear, cutter_box((0, -.026, .096), (.007, .032, .009)))
    parts['body'] += [complete(rear)]
    for side in (-1, 1):
        screw = cyl('sight_adjuster', (side * .014, -.025, .09), (side * .0162, -.025, .09), .0038, 'brass', sides=18, bevel=.0005)
        cut(screw, cutter_box((side * .0163, -.025, .09), (.002, .005, .001)))
        parts['body'] += [screw]
    grip = prism('wood_grip', [(-.028, .012), (.010, .004), (.014, -.018), (.009, -.049), (.013, -.077), (.003, -.106), (-.017, -.119),
                               (-.043, -.111), (-.050, -.083), (-.043, -.040), (-.041, -.012)], .033, 'wood_red', bevel=.003, radius=.006)
    parts['body'] += [grip]
    for side in (-1, 1):
        parts['body'] += [cyl('medallion_rim', (side * .0164, -.014, -.031), (side * .0184, -.014, -.031), .012, 'brass', sides=32, bevel=.0007)]
        parts['body'] += [cyl('porcelain', (side * .0181, -.014, -.031), (side * .0187, -.014, -.031), .0102, 'ivory', sides=32, bevel=.0004)]
        for i in range(12):
            a = i * math.tau / 12
            y, z = -.014 + math.cos(a) * .009, -.031 + math.sin(a) * .009
            parts['body'] += [cyl('porcelain_border', (side * .0187, y, z), (side * .0189, y, z), .0006, 'navy', sides=8, bevel=0)]
        screw = cyl('grip_screw', (side * .016, -.024, -.078), (side * .0172, -.024, -.078), .0038, 'brass', sides=18, bevel=.0005)
        cut(screw, cutter_box((side * .0175, -.024, -.078), (.002, .005, .001)))
        parts['body'] += [screw]
    guard = prism('guard', [(-.010, .012), (.069, .012), (.077, -.005), (.066, -.038), (.048, -.047), (-.001, -.041), (-.010, -.023)],
                  .017, 'blued', bevel=.0018, radius=.006, raw=True)
    cut(guard, cutter_prism([(.003, .004), (.062, .004), (.065, -.007), (.056, -.033), (.003, -.032)], .04))
    parts['body'] += [complete(guard)]
    parts['body'] += [prism('sideplate', [(-.034, .012), (-.041, .036), (-.035, .064), (-.016, .078), (-.007, .075), (-.007, .017)],
                            .0015, 'case', x=.015, bevel=.0006, radius=.002)]
    for side in (-1, 1):
        for y, z in [(-.027, .061), (-.030, .020), (.088, .073), (.085, .018)]:
            screw = cyl('frame_screw', (side * .014, y, z), (side * .0167, y, z), .0034, 'steel', sides=18, bevel=.0005)
            cut(screw, cutter_box((side * .0168, y, z), (.002, .0045, .0008)))
            parts['body'] += [screw]
    parts['release'] += [box('thumb_latch', (-.016, .002, .06), (.005, .015, .008), 'brass', .001)]
    angles = [math.pi / 2 + i * math.tau / 6 for i in range(6)]
    drum = lathe('cylinder', [(0, 0), (.026, 0), (.028, .004), (.028, .042), (.026, .047), (0, .047)], 'blued', p0=(0, .022, centre), sides=42)
    cut(drum, join([cutter_cyl((math.cos(a) * .031, .031, centre + math.sin(a) * .031),
                              (math.cos(a) * .031, .064, centre + math.sin(a) * .031), .007, 20) for a in angles], 'flutes'))
    cut(drum, join([cutter_cyl((math.cos(a) * chamber, .018, centre + math.sin(a) * chamber),
                              (math.cos(a) * chamber, .073, centre + math.sin(a) * chamber), .0054, 20) for a in angles], 'chambers'))
    parts['cylinder'] += [drum]
    # Separate cartridges and extractor: the cylinder itself never translates during ejection.
    # Hollow spent cases become separate rigid parts only while they tumble out.
    for i, a in enumerate(angles):
        x, z = math.cos(a) * chamber, centre + math.sin(a) * chamber
        parts['rounds'] += [cyl('case', (x, .023, z), (x, .061, z), .005, 'brass', sides=16, bevel=.0005),
                            cyl('case_rim', (x, .021, z), (x, .024, z), .0058, 'brass', sides=18, bevel=.0005),
                            cyl('primer', (x, .0207, z), (x, .0212, z), .002, 'copper', sides=12, bevel=.0002),
                            cyl('bullet', (x, .061, z), (x, .069, z), .0048, 'copper', r1=.0028, sides=16, bevel=.0005)]
        parts[f'case{i}'] = [tube(f'spent_case_{i}', (x, .024, z), (x, .061, z), .005, .0039, 'brass', sides=12, bevel=0),
                             cyl(f'spent_rim_{i}', (x, .021, z), (x, .024, z), .0058, 'brass', sides=12, bevel=0),
                             cyl(f'spent_primer_{i}', (x, .0207, z), (x, .0212, z), .002, 'copper', sides=10, bevel=0)]
        parts['action'] += [cyl('extractor_spoke', (0, .0205, centre), (x * .8, .0205, centre + (z - centre) * .8), .002, 'steel', sides=10, bevel=.0004)]
    parts['action'] += [cyl('ejector_rod', (0, .02, centre), (0, .113, centre), .0028, 'steel', sides=16, bevel=.0004),
                        cyl('ejector_knob', (0, .107, centre), (0, .116, centre), .0044, 'brass', sides=18, bevel=.0007)]
    parts['crane'] += [cyl('crane_arm', (-.013, .072, .022), (-.013, .072, centre), .0045, 'blued', sides=16, bevel=.0008),
                       cyl('crane_axle', (-.013, .072, centre), (0, .072, centre), .004, 'steel', sides=16, bevel=.0006)]
    hammer = prism('hammer', [(-.004, -.006), (.005, -.006), (.004, .012), (-.004, .024), (-.019, .03), (-.023, .023), (-.012, .012)], .01, 'brass', bevel=.0012, radius=.002)
    move(hammer, (0, -.032, .061)); parts['hammer'] += [hammer]
    parts['trigger'] += [prism('trigger', [(.031, .011), (.038, .011), (.041, -.006), (.032, -.024), (.026, -.023), (.031, -.004)], .008, 'brass', bevel=.001, radius=.002)]
    for obj in parts['trigger']: move(obj, (0, -.017, 0))
    parts['mag'] += [lathe('speedloader', [(0, 0), (.025, 0), (.027, .006), (.025, .014), (.009, .022), (.007, .038), (0, .038)], 'dark', p0=(0, .021, centre), axis=(0, -1, 0), sides=32)]
    for a in angles:
        parts['mag'] += [cyl('loader_detent', (math.cos(a) * chamber, .020, centre + math.sin(a) * chamber),
                            (math.cos(a) * chamber, .023, centre + math.sin(a) * chamber), .0022, 'brass', sides=10, bevel=.0003)]
    for obj in parts['body']:
        if obj.name.split('.')[0] in {'wood_grip', 'medallion_rim', 'porcelain', 'porcelain_border', 'grip_screw'}:
            obj.data.transform(Matrix.Diagonal((1, .80, 1, 1))); obj.data.update()
    sockets = {'muzzle': (0, .273, bore), 'eject': (-.02, .023, centre), 'sight': (0, -.038, .0945)}
    pivots = {'cylinder': (0, .045, centre), 'crane': (0, .045, centre), 'action': (0, .045, centre), 'rounds': (0, .021, centre),
              'hammer': (0, -.032, .061), 'trigger': (0, .016, .008), 'mag': (0, .021, centre), 'release': (-.016, .002, .06)}
    pivots.update({f'case{i}': (0, .021, centre) for i in range(6)})
    return parts, sockets, pivots, {'magAxis': [0, -1, 0], 'crane': [-.013, .045, .022]}


# ------------------------------------------------------------------ m4
def stanag(top=(.071, .021), length=.205, half=.031, lean=5, bend=22):
    """Curved STANAG outline (y, z): straight near the well, bending forward below."""
    axis, p, steps = [], Vector(top), 14
    for k in range(steps + 1):
        s = k / steps
        a = math.radians(lean + bend * s ** 1.6)
        axis.append((p.copy(), a))
        p = p + Vector((math.sin(a), -math.cos(a))) * (length / steps)
    front = [(q.x + math.cos(a) * half, q.y + math.sin(a) * half) for q, a in axis]
    rear = [(q.x - math.cos(a) * half, q.y - math.sin(a) * half) for q, a in axis]
    return front, rear, axis


@weapon
def m4():
    """Island carbine v3: forged receivers with polished edge wear, free-float navy
    M-LOK handguard sized for a paw to wrap, curved STANAG magazine with a brass
    top round, A2 bird cage, ghost-ring rear aperture over a brass-beaded post."""
    parts = {'body': [], 'mag': [], 'charge': [], 'trigger': [], 'bolt': [], 'release': []}
    bore = .064
    # Lower receiver: pivot lug forward, rounded buffer ring at the back.
    lower = prism('lower', [(-.074, .046, 1), (.126, .046, 1), (.131, .036), (.126, .018), (.112, -.006), (.032, -.008), (.024, .004),
                           (-.018, .006), (-.058, .012), (-.074, .026)], .036, 'gunmetal', bevel=.0028, smooth=1, raw=True)
    cut(lower, cutter_box((0, .071, -.004), (.029, .07, .03)))
    parts['body'] += [complete(lower)]
    # Magwell with a flared mouth; the curved magazine rides inside it.
    well = prism('magwell', [(.030, .0, 1), (.114, .0, 1), (.116, -.024), (.121, -.034), (.026, -.034), (.032, -.024)], .038, 'gunmetal', bevel=.0026, raw=True)
    cut(well, cutter_box((0, .071, -.02), (.029, .07, .06)))
    parts['body'] += [complete(well)]
    # Upper receiver with a sculpted brass deflector and forward-assist housing.
    upper = prism('upper', [(-.078, .046, 1), (.138, .046, 1), (.138, .086), (.131, .094), (-.070, .094), (-.078, .086)], .034, 'gunmetal', bevel=.0024, smooth=1, raw=True)
    cut(upper, cutter_box((.017, .062, .063), (.012, .048, .015)))
    parts['body'] += [complete(upper)]
    parts['body'] += [prism('deflector', [(-.004, .064), (.018, .064), (.012, .082), (-.002, .078)], .008, 'gunmetal', x=.019, bevel=.0015, smooth=1)]
    parts['body'] += [cyl('forward_assist', (.018, -.012, .07), (.03, -.03, .077), .0072, 'gunmetal', sides=20, bevel=.0012)]
    parts['body'] += [cyl('assist_button', (.03, -.03, .077), (.034, -.036, .079), .0068, 'gunmetal', sides=20, bevel=.001)]
    parts['body'] += [box('dust_cover', (.0178, .062, .052), (.002, .052, .013), 'gunmetal', .0008)]
    # Continuous top rail, receiver to handguard, with recoil slots.
    rail = box('rail', (0, .15, .0985), (.023, .44, .0095), 'dark', .0014, raw=True)
    cut(rail, join([cutter_box((0, -.064 + i * .0105, .1048), (.03, .0048, .0064)) for i in range(40)], 'rail_slots'))
    parts['body'] += [complete(rail)]
    parts['release'] += [prism('bolt_release', [(-.006, .022), (.026, .024), (.024, .04), (-.003, .037)], .0045, 'gunmetal', x=-.0205, bevel=.0012, smooth=1)]
    parts['body'] += [cyl('mag_release', (.018, .045, .012), (.023, .045, .012), .0055, 'gunmetal', sides=16, bevel=.001)]
    parts['body'] += [cyl('buffer', (0, -.074, .066), (0, -.24, .066), .0168, 'dark', sides=28, bevel=.0015)]
    parts['body'] += [cyl('castle_nut', (0, -.074, .066), (0, -.086, .066), .0195, 'gunmetal', sides=10, bevel=.0014)]
    # Stock: a rounded housing around the buffer tube over a slimmer toe web,
    # sling cut, cheek riser and a thick rubber pad.
    housing = prism('stock_housing', [(-.13, .09, 1), (-.302, .087), (-.31, .078), (-.31, .046), (-.13, .046, 1)], .046, 'polymer', bevel=.006, smooth=2)
    web = prism('stock_web', [(-.15, .05), (-.305, .05), (-.308, -.03), (-.292, -.045), (-.25, -.02), (-.19, .026)], .032, 'polymer', bevel=.004, smooth=2, raw=True)
    cut(web, cutter_prism([(-.206, .03), (-.266, .012), (-.281, -.01), (-.262, -.01), (-.214, .016)], .06))
    parts['body'] += [housing, complete(web)]
    parts['body'] += [prism('buttpad', [(-.306, .091), (-.325, .091), (-.327, -.041), (-.304, -.046)], .048, 'rubber', bevel=.006, smooth=1)]
    parts['body'] += [prism('cheek_riser', [(-.292, .084), (-.18, .089), (-.19, .1), (-.282, .1)], .04, 'rubber', bevel=.005, smooth=1)]
    parts['body'] += [box('stock_latch', (0, -.152, .045), (.01, .02, .008), 'dark', .0018)]
    # Pistol grip: finger swell, beavertail, textured panels.
    grip = prism('grip', [(-.006, .012, 1), (.031, .012, 1), (.03, -.003), (.022, -.028), (.017, -.04), (.02, -.05), (.012, -.072),
                          (.004, -.099), (-.031, -.105), (-.043, -.091), (-.035, -.052), (-.028, -.02), (-.036, -.004), (-.03, .004)],
                  .032, 'polymer', bevel=.0032, smooth=3)
    move(grip, (0, -.064, 0))
    parts['body'] += [grip]
    # Enlarged trigger guard, open front for gloved (or clawed) fingers.
    # Oversized guard: a paw's trigger digit fits between trigger and guard.
    # Its rear sweeps up into the grip so the digits below it wrap the grip freely.
    guard = prism('guard', [(-.046, .006, 1), (.042, .006, 1), (.042, -.028), (.032, -.044), (.004, -.047), (-.03, -.036), (-.046, -.02)], .016, 'polymer', bevel=.0024, raw=True, smooth=1)
    cut(guard, cutter_prism([(-.034, -.001), (.035, -.001), (.031, -.033), (.006, -.038), (-.024, -.028), (-.034, -.014)], .03))
    parts['body'] += [complete(guard)]
    # Free-float handguard: slimmer octagon for a wrapping grip, M-LOK slots, end cap.
    hand = lathe('handguard', [(.026, 0), (.0288, .005), (.0288, .232), (.027, .238)], 'navy', p0=(0, .134, bore), sides=8)
    # Flats (not ridges) face the sides, top and bottom, like a real octagonal rail.
    hand.data.transform(Matrix.Translation((0, 0, bore)) @ Matrix.Rotation(math.radians(22.5), 4, 'Y') @ Matrix.Translation((0, 0, -bore)))
    slots = join([cutter_box((s * .029, .168 + i * .044, bore), (.012, .028, .0085)) for s in (-1, 1) for i in range(4)] +
                 [cutter_box((0, .168 + i * .044, bore - .029), (.0085, .028, .012)) for i in range(4)], 'slots')
    cut(hand, slots)
    L.finish(hand, 'navy', bevel=.0014, segments=3)
    parts['body'] += [hand]
    parts['body'] += [tube('end_cap', (0, .368, bore), (0, .376, bore), .0262, .011, 'dark', sides=24)]
    parts['body'] += [cyl('barrel_nut', (0, .126, bore), (0, .138, bore), .0205, 'dark', sides=18)]
    parts['body'] += [cyl('barrel', (0, .37, bore), (0, .472, bore), .0096, 'gunmetal', sides=20)]
    parts['body'] += [box('gas_block', (0, .388, bore + .002), (.022, .016, .028), 'dark', .002)]
    cage = tube('flash_hider', (0, .466, bore), (0, .524, bore), .0138, .0078, 'dark', sides=24)
    cut(cage, join([cutter_box((math.cos(a) * .0142, .505, bore + math.sin(a) * .0142), (.0075, .028, .0075)) for a in [math.pi / 2 + i * math.tau / 5 for i in range(5)]], 'cage'))
    parts['body'] += [cage]
    # Open rear notch between guard ears (keeps peripheral vision wide at ADS), brass pins.
    parts['body'] += [box('rear_base', (0, -.055, .1055), (.03, .021, .0095), 'dark', .0015)]
    for s in (-1, 1):
        parts['body'] += [box('rear_ear', (s * .009, -.055, .1195), (.005, .009, .024), 'dark', .0012)]
        parts['body'] += [cyl('rear_pin', (s * .014, -.055, .111), (s * .017, -.055, .111), .005, 'brass', sides=16, bevel=.0006)]
    parts['body'] += [box('rear_notch_floor', (0, -.055, .114), (.018, .009, .003), 'dark', .0007)]
    # Front post with protective ears and a brass bead on the handguard rail.
    parts['body'] += [box('front_base', (0, .352, .1045), (.024, .018, .0075), 'dark', .0014)]
    parts['body'] += [box('front_post', (0, .352, .1155), (.0026, .0042, .0165), 'dark', .0005)]
    parts['body'] += [sphere('front_bead', (0, .3505, .1245), (.0019, .0019, .0019), 'brass', 12, 8)]
    for s in (-1, 1):
        parts['body'] += [prism('front_ear', [(.343, .104), (.361, .104), (.359, .132), (.349, .132)], .003, 'dark', x=s * .012, bevel=.001)]
    for s in (-1, 1):
        # Receiver seams, brass pin heads and a selector; they give the receiver its scale.
        inset = prism('grip_inset', [(-.019, -.020), (.014, -.027), (-.001, -.086), (-.027, -.083)], .0018, 'rubber', x=s * .0165, bevel=.0006, radius=.004)
        move(inset, (0, -.064, 0)); parts['body'] += [inset]
        for y, z in [(-.058, .031), (.112, .026)]:
            parts['body'] += [cyl('pin', (s * .0182, y, z), (s * .0205, y, z), .0042, 'brass', sides=16, bevel=.0005)]
        parts['body'] += [prism('receiver_seam', [(-.064, .0455), (.123, .0455), (.123, .0475), (-.064, .0475)], .0008, 'steel', x=s * .0181, bevel=.0003)]
        parts['body'] += [prism('selector', [(-.034, .018), (-.036, .029), (-.024, .033), (-.01, .022), (-.015, .017)], .003, 'gunmetal', x=s * .0205, bevel=.0007)]
        parts['body'] += [prism('stock_inlay', [(-.28, .062), (-.2, .066), (-.198, .061), (-.278, .057)], .001, 'teal', x=s * .0235, bevel=.0004)]
        for y1, z1, y2, z2 in [(.15, .05, .15, .08), (.15, .061, .143, .07), (.15, .067, .158, .076)]:
            parts['body'] += [cyl('coral_mark', (s * .0268, y1, z1), (s * .0268, y2, z2), .00115, 'coral', sides=8, bevel=0)]
    parts['charge'] += [prism('charging_handle', [(-.084, .083), (-.066, .083), (-.066, .091), (-.084, .091)], .034, 'gunmetal', bevel=.0015)]
    parts['charge'] += [prism('charging_latch', [(-.088, .082), (-.074, .082), (-.074, .092), (-.088, .092)], .012, 'gunmetal', x=-.021, bevel=.0012, smooth=1)]
    parts['bolt'] += [box('bolt_carrier', (.012, .062, .063), (.008, .046, .012), 'steel', .0015)]
    trig = prism('trigger', [(-.005, .005, 1), (.003, .005, 1), (.005, -.006), (.002, -.017), (-.006, -.031), (-.012, -.032), (-.007, -.019), (-.004, -.007)], .007, 'steel', bevel=.0012, smooth=2)
    parts['trigger'] += [trig]
    # Curved STANAG: ribbed body, gunmetal floor plate, brass round on the feed lips.
    front, rear, axis = stanag()
    outline = [(y, z) for y, z in rear] + [(y, z) for y, z in reversed(front)]
    body = prism('mag', outline, .027, 'dark', bevel=.0026, smooth=0)
    (end, a) = axis[-1]
    n, t = Vector((math.cos(a), math.sin(a))), Vector((math.sin(a), -math.cos(a)))
    corners = [end + n * .036 + t * .002, end + n * .036 + t * .016, end - n * .035 + t * .016, end - n * .035 + t * .002]
    plate = prism('mag_plate', [(c.x, c.y) for c in corners], .032, 'gunmetal', bevel=.0026, smooth=0)
    ribs = []
    for s in (-1, 1):
        for k, off in enumerate((-.012, .012)):
            pts = [(s * .0142, q.x + math.cos(a) * off, q.y + math.sin(a) * off) for q, a in axis[3:-1]]
            ribs.append(sweep('mag_rib', pts, [.0016] * len(pts), 'dark', sides=8, aspect=.6, up=(1, 0, 0)))
    round_ = cyl('top_round', (0, .052, .025), (0, .094, .025), .0046, 'brass', r1=.0046, sides=14, bevel=.0008)
    tip = cyl('round_tip', (0, .094, .025), (0, .106, .025), .0046, 'copper', r1=.0012, sides=14, bevel=.0005)
    parts['mag'] += [join([body, plate, round_, tip] + ribs, 'mag')]
    sockets = {'muzzle': (0, .527, bore), 'eject': (.022, .062, .062), 'sight': (0, -.055, .125)}
    pivots = {'mag': (0, .071, .021), 'charge': (0, -.075, .087), 'bolt': (0, .062, .062), 'trigger': (0, -.001, .004), 'release': (-.0205, .01, .026)}
    return parts, sockets, pivots, {'magAxis': [0, .087, -.996]}


# ------------------------------------------------------------------ smg
@weapon
def smg():
    """Canarinho: yellow receiver, green paw grips, blue star and a folding wire stock."""
    parts = {'body': [], 'mag': [], 'charge': [], 'trigger': [], 'action': []}
    bore = .064
    rec = prism('receiver', [(-.064, .025), (.182, .025), (.198, .04), (.198, .087), (.184, .099), (-.053, .099), (-.064, .087)],
                .042, 'yellow', bevel=.0045, radius=.006, raw=True)
    cut(rec, cutter_box((.021, .06, .067), (.012, .059, .017)))
    cut(rec, cutter_box((-.021, .095, .083), (.012, .152, .010)))
    parts['body'] += [complete(rec)]
    # Stamped top cover seam and a raised rear cap catch light in the eye view.
    parts['body'] += [box('cover_seam', (0, .078, .0988), (.034, .181, .0012), 'gunmetal', .0005),
                       box('top_cover', (0, .078, .100), (.032, .179, .0028), 'yellow', .0012)]
    parts['body'] += [prism('rear_cap', [(-.066, .030), (-.056, .030), (-.056, .094), (-.066, .087)], .044, 'yellow', bevel=.002, radius=.003)]
    parts['body'] += [box('charging_track', (-.017, .095, .083), (.003, .154, .009), 'dark', .001)]
    parts['action'] += [box('bolt_face', (.0175, .059, .067), (.005, .057, .014), 'steel', .001)]
    for side in (-1, 1):
        parts['body'] += [prism('green_sash', [(-.022, .030), (.003, .030), (.043, .096), (.018, .096)],
                               .0008, 'green', x=side * .0214, bevel=.0002)]
        for y, z in [(-.047, .039), (.075, .038), (.18, .043), (-.048, .084)]:
            parts['body'] += [cyl('receiver_pin', (side * .021, y, z), (side * .0227, y, z), .0034, 'gunmetal', sides=16, bevel=.0005)]
            parts['body'] += [cyl('pin_centre', (side * .0227, y, z), (side * .023, y, z), .0014, 'dark', sides=10, bevel=.0002)]
        parts['body'] += [cyl('selector_pivot', (side * .021, -.026, .027), (side * .024, -.026, .027), .006, 'gunmetal', sides=20, bevel=.0008)]
        parts['body'] += [cyl('takedown_pivot', (side * .021, .018, .033), (side * .0245, .018, .033), .0067, 'gunmetal', sides=18, bevel=.001),
                           prism('takedown_lever', [(.012, .033), (.024, .033), (.027, .050), (.021, .054), (.014, .050)], .003, 'dark', x=side * .024, bevel=.001)]
        parts['body'] += [box('selector_lever', (side * .024, -.037, .027), (.003, .023, .005), 'dark', .001)]
    # Open, slotted steel shroud and an actual bore at the muzzle.
    shroud = tube('shroud', (0, .192, bore), (0, .271, bore), .020, .012, 'gunmetal', sides=28)
    for z in (-1, 1):
        cut(shroud, join([cutter_box((x, .233, bore + z * .018), (.006, .044, .012)) for x in (-.009, .009)], 'top_slots'))
    for side in (-1, 1):
        cut(shroud, cutter_box((side * .018, .234, bore), (.012, .045, .009)))
    parts['body'] += [shroud, cyl('barrel', (0, .198, bore), (0, .28, bore), .008, 'blued', sides=20)]
    muzzle = tube('compensator', (0, .269, bore), (0, .302, bore), .0135, .006, 'gunmetal', sides=28)
    cut(muzzle, join([cutter_box((side * .012, .285, bore), (.009, .016, .005)) for side in (-1, 1)], 'comp_ports'))
    parts['body'] += [muzzle]
    # Low ghost ring: a clear opening and a warm front post on the same sight line.
    parts['body'] += [box('rear_base', (0, -.038, .104), (.027, .022, .012), 'dark', .002)]
    parts['body'] += [tube('rear_ring', (0, -.044, .122), (0, -.031, .122), .0125, .0075, 'gunmetal', sides=32)]
    parts['body'] += [box('front_base', (0, .177, .102), (.025, .021, .012), 'dark', .002)]
    hood = tube('front_hood', (0, .169, .122), (0, .182, .122), .012, .0095, 'gunmetal', sides=28)
    cut(hood, cutter_box((0, .176, .134), (.016, .02, .011)))
    parts['body'] += [hood]
    parts['body'] += [box('front_post', (0, .176, .116), (.0032, .004, .012), 'orange', .0008)]
    for side in (-1, 1):
        parts['body'] += [cyl('sight_screw', (side * .013, -.038, .105), (side * .015, -.038, .105), .0035, 'steel', sides=16, bevel=.0005)]
    parts['body'] += [prism('grip', [(-.051, .026), (-.014, .022), (.017, .009), (.022, -.007), (.016, -.03), (.02, -.058), (.009, -.104),
                                    (-.049, -.116), (-.063, -.104), (-.050, -.027)], .031, 'green', bevel=.003, radius=.006)]
    for side in (-1, 1):
        parts['body'] += [prism('grip_insert', [(-.04, -.013), (.004, -.022), (-.005, -.092), (-.049, -.099)], .002, 'polymer', x=side * .0157, bevel=.001, radius=.004)]
    guard = prism('guard', [(-.008, .020), (.068, .020), (.075, .008), (.071, -.034), (.06, -.042), (-.003, -.039)], .019, 'dark', bevel=.002, radius=.004, raw=True)
    cut(guard, cutter_prism([(.003, .012), (.062, .012), (.065, .005), (.06, -.031), (.003, -.031)], .035))
    parts['body'] += [complete(guard)]
    parts['trigger'] += [prism('trigger', [(.035, .016), (.042, .016), (.042, .002), (.035, -.021), (.030, -.020), (.035, -.003)], .0175, 'steel', bevel=.001, radius=.002)]
    well = prism('magwell', [(.071, .026), (.123, .026), (.124, -.013), (.070, -.013)], .034, 'yellow', bevel=.002, raw=True)
    cut(well, cutter_box((0, .097, -.006), (.028, .044, .041)))
    parts['body'] += [complete(well), box('mag_release', (-.021, .08, .012), (.007, .015, .017), 'dark', .0015)]
    # Full vertical grip at the rear of the shroud; the paw stays behind the muzzle.
    fore = prism('foregrip', [(.143, .026), (.192, .026), (.19, .009), (.181, -.092), (.144, -.092), (.138, -.08)], .032, 'green', bevel=.003, radius=.005, raw=True)
    for i in range(6):
        cut(fore, cutter_box((0, .142, -.019 - i * .011), (.039, .010, .003)))
    parts['body'] += [complete(fore), box('foregrip_mount', (0, .168, .023), (.037, .06, .014), 'gunmetal', .002)]
    parts['body'] += [cyl('foregrip_bolt', (-.02, .168, .018), (.02, .168, .018), .004, 'steel', sides=16, bevel=.0006)]
    parts['body'] += [box('stock_hinge', (0, -.07, .059), (.041, .018, .063), 'gunmetal', .002)]
    for y0, z0, z1 in [(-.077, .083, .08), (-.077, .035, -.025)]:
        parts['body'] += [cyl('stock_strut', (0, y0, z0), (0, -.267, z1), .0058, 'gunmetal', sides=16, bevel=.001)]
    pad = prism('stock_pad', [(-.263, .105), (-.28, .105), (-.28, -.05), (-.263, -.05)], .04, 'rubber', bevel=.004, radius=.008)
    parts['body'] += [pad]
    for i in range(8):
        parts['body'] += [box('stock_tread', (0, -.2805, -.029 + i * .016), (.033, .002, .004), 'rubber', .0006)]
    parts['charge'] += [box('charging_arm', (-.029, .149, .083), (.022, .012, .008), 'steel', .001)]
    parts['charge'] += [box('charging_knob', (-.044, .149, .083), (.016, .019, .015), 'dark', .002)]
    for i in range(4):
        parts['charge'] += [box('charging_rib', (-.052, .143 + i * .004, .083), (.0016, .0014, .010), 'gunmetal', .0004)]
    mag = prism('mag_body', [(.075, .019), (.119, .019), (.128, -.177), (.084, -.177)], .026, 'gunmetal', bevel=.002, radius=.003, raw=True)
    for side in (-1, 1):
        cut(mag, cutter_box((side * .013, .103, -.091), (.004, .005, .128)))
    parts['mag'] += [complete(mag), box('mag_shoe', (0, .105, -.177), (.030, .051, .009), 'dark', .0015),
                     cyl('top_round', (0, .082, .018), (0, .112, .018), .005, 'brass', sides=14, bevel=.0006)]
    for obj in parts['body']:
        if obj.name.split('.')[0] in {'grip', 'grip_insert'}:
            obj.data.transform(Matrix.Diagonal((1, .67, 1, 1))); obj.data.update()
    for obj in parts['trigger']: move(obj, (0, -.020, 0))
    sockets = {'muzzle': (0, .304, bore), 'eject': (.023, .059, .067), 'sight': (0, -.045, .122)}
    pivots = {'mag': (0, .097, .019), 'charge': (-.038, .149, .083), 'trigger': (0, .017, .014), 'action': (0, .059, .067)}
    return parts, sockets, pivots, {'magAxis': [0, .045, -1]}


# ------------------------------------------------------------------ shotgun
@weapon
def shotgun():
    """Doze: pump twelve-gauge, wooden stock and forend, side saddle of red shells."""
    parts = {'body': [], 'pump': [], 'mag': [], 'trigger': []}
    bore = .056
    rec = prism('receiver', [(.0, .014, 1), (.19, .014, 1), (.19, .084), (.17, .094), (.02, .094), (.0, .076)], .038, 'gunmetal', bevel=.003, smooth=1, raw=True)
    cut(rec, cutter_box((.018, .09, .064), (.014, .06, .02)))
    cut(rec, cutter_box((0, .11, .012), (.022, .07, .014)))
    parts['body'] += [complete(rec)]
    parts['body'] += [cyl('shell_in_port_hull', (.008, .07, .064), (.008, .115, .064), .0095, 'red', sides=18)]
    parts['body'] += [cyl('shell_in_port_base', (.008, .062, .064), (.008, .07, .064), .0098, 'brass', sides=18)]
    parts['body'] += [cyl('barrel', (0, .19, bore), (0, .7, bore), .0132, 'blued', sides=28)]
    parts['body'] += [tube('muzzle', (0, .69, bore), (0, .702, bore), .0138, .0098, 'steel', sides=28)]
    parts['body'] += [box('vent_rib', (0, .445, bore + .016), (.01, .5, .005), 'blued', .0015)]
    parts['body'] += [sphere('bead', (0, .69, bore + .023), (.0032, .0032, .0032), 'brass', 12, 8)]
    parts['body'] += [cyl('mag_tube', (0, .19, .022), (0, .62, .022), .0118, 'blued', sides=24)]
    parts['body'] += [cyl('mag_cap', (0, .62, .022), (0, .645, .022), .0125, 'gunmetal', sides=24)]
    parts['body'] += [box('barrel_clamp', (0, .6, .04), (.02, .014, .044), 'gunmetal', .002)]
    stock = prism('stock', [(.004, .07, 1), (-.06, .05), (-.3, .036), (-.318, .032), (-.318, -.1), (-.3, -.11), (-.19, -.07), (-.07, -.036),
                            (-.024, -.036), (.004, .012, 1)], .042, 'wood', bevel=.003, smooth=3)
    parts['body'] += [stock]
    parts['body'] += [prism('buttpad', [(-.318, .036), (-.332, .036), (-.332, -.108), (-.318, -.108)], .044, 'rubber', bevel=.004)]
    guard = prism('guard', [(.03, .016, 1), (.11, .016, 1), (.11, .004), (.1, -.012), (.03, -.012)], .018, 'gunmetal', bevel=.0015, raw=True)
    cut(guard, cutter_box((0, .07, .0), (.03, .064, .012)))
    parts['body'] += [complete(guard)]
    # Side saddle: four shells on the left of the receiver.
    parts['body'] += [box('saddle', (-.023, .1, .052), (.008, .09, .036), 'dark', .002)]
    for i in range(4):
        y = .066 + i * .022
        parts['body'] += [cyl('saddle_hull', (-.03, y, .05), (-.03, y, .085), .0092, 'red', sides=16)]
        parts['body'] += [cyl('saddle_base', (-.03, y, .042), (-.03, y, .05), .0096, 'brass', sides=16)]
    pump = lathe('pump', [(.0125, 0), (.027, .004), (.029, .02), (.029, .16), (.027, .176), (.0125, .18)], 'wood', p0=(0, .29, .026), sides=28)
    cut(pump, join([cutter_cyl((0, .31 + i * .018, .026), (0, .315 + i * .018, .026), .04, 24) for i in range(8)], 'grooves'))
    parts['pump'] += [pump]
    parts['trigger'] += [prism('trigger', [(.052, .012, 1), (.06, .012, 1), (.061, .0), (.055, -.012), (.05, -.011), (.054, .0)], .007, 'gunmetal', bevel=.001, smooth=1)]
    shell = [cyl('shell_hull', (0, .0, 0), (0, .052, 0), .0095, 'red', sides=18), cyl('shell_base', (0, -.008, 0), (0, .0, 0), .0098, 'brass', sides=18)]
    parts['mag'] += [join(shell, 'shell')]
    for obj in parts['mag']:
        move(obj, (0, .11, .012))
    sockets = {'muzzle': (0, .706, bore), 'eject': (.022, .09, .066), 'sight': (0, -.02, bore + .026)}
    pivots = {'pump': (0, .29, .026), 'mag': (0, .11, .012)}
    return parts, sockets, pivots, {'magAxis': [0, 1, 0]}


# ------------------------------------------------------------------ coco
@weapon
def coco():
    """Lança-coco: bamboo tube launcher with a copper bell, rope wraps and a hopper of coconuts."""
    parts = {'body': [], 'pump': [], 'mag': [], 'trigger': []}
    bore = .085
    profile = [(.0, .0)]
    for seg in range(4):
        y0 = seg * .13
        profile += [(.044, y0 + .002), (.048, y0 + .01), (.045, y0 + .03), (.043, y0 + .1), (.047, y0 + .122)]
    profile += [(.046, .52), (0, .52)]
    parts['body'] += [lathe('bamboo', [(r, d) for r, d in profile], 'bamboo', p0=(0, -.02, bore), sides=32)]
    parts['body'] += [lathe('bell', [(.044, 0), (.05, .02), (.062, .07), (.076, .1), (.078, .108), (.07, .11), (.06, .085), (.048, .03), (.04, 0)],
                            'copper', p0=(0, .49, bore), sides=40)]
    # The loaded coconut sits in the bell mouth.
    parts['body'] += [sphere('coconut_loaded', (0, .57, bore), (.043, .046, .043), 'coconut', 28, 18)]
    parts['body'] += [sphere('coconut_eyes', (0, .614, bore + .008), (.012, .004, .012), 'wood_dark', 12, 8)]
    for y, mat in [(.1, 'rope'), (.23, 'teal'), (.36, 'rope'), (.46, 'orange')]:
        parts['body'] += [lathe(f'band_{y}', [(.05, 0), (.052, .004), (.052, .024), (.05, .028)], mat, p0=(0, y, bore), sides=32)]
    parts['body'] += [cyl('breech_cap', (0, -.045, bore), (0, -.018, bore), .05, 'gunmetal', sides=32, bevel=.003)]
    grip = prism('grip', [(-.006, .04, 1), (.032, .04, 1), (.03, .02), (.02, -.02), (.012, -.06), (.004, -.09), (-.03, -.096), (-.042, -.08),
                          (-.032, -.04), (-.024, -.004), (-.028, .02)], .033, 'wood_dark', bevel=.003, smooth=3)
    parts['body'] += [grip]
    parts['body'] += [prism('grip_mount', [(-.03, .045), (.05, .045), (.05, .04), (-.03, .04)], .03, 'gunmetal', bevel=.002)]
    guard = prism('guard', [(.02, .04, 1), (.07, .04, 1), (.07, .025), (.062, .012), (.02, .012)], .018, 'gunmetal', bevel=.0015, raw=True)
    cut(guard, cutter_box((0, .045, .025), (.03, .04, .014)))
    parts['body'] += [complete(guard)]
    stock = prism('stock', [(-.045, .06, 1), (-.24, .03), (-.255, .022), (-.255, -.07), (-.235, -.08), (-.12, -.02), (-.045, .03, 1)], .04, 'wood', bevel=.003, smooth=3)
    parts['body'] += [stock]
    # Leaf sight with an orange post and a rear notch.
    parts['body'] += [prism('front_leaf', [(.42, bore + .044), (.44, bore + .044), (.436, bore + .072), (.426, bore + .072)], .006, 'gunmetal', bevel=.001)]
    parts['body'] += [box('front_dot', (0, .431, bore + .07), (.007, .006, .007), 'orange', .001)]
    rear = box('rear_leaf', (0, .0, bore + .064), (.036, .01, .03), 'gunmetal', .002, raw=True)
    cut(rear, cutter_box((0, .0, bore + .078), (.009, .02, .012)))
    parts['body'] += [complete(rear)]
    # Hopper on top: a woven basket holding the reserve coconuts.
    parts['body'] += [box('hopper', (0, .19, bore + .075), (.07, .12, .05), 'rope', .006)]
    parts['body'] += [box('hopper_rim', (0, .19, bore + .1), (.076, .126, .008), 'teal', .003)]
    for i in range(2):
        parts['mag'] += [sphere('coconut', (0, .16 + i * .06, bore + .1), (.03, .032, .03), 'coconut', 20, 14)]
    pump = lathe('pump', [(.047, 0), (.055, .006), (.056, .07), (.047, .076)], 'wood', p0=(0, .26, bore), sides=32)
    parts['pump'] += [pump]
    parts['pump'] += [box('pump_handle', (0, .295, bore - .07), (.03, .05, .04), 'wood', .006)]
    parts['trigger'] += [prism('trigger', [(.03, .038, 1), (.038, .038, 1), (.039, .028), (.033, .018), (.028, .02), (.032, .03)], .008, 'gunmetal', bevel=.001, smooth=1)]
    sockets = {'muzzle': (0, .62, bore), 'eject': (0, .19, bore + .1), 'sight': (0, -.03, bore + .078)}
    pivots = {'pump': (0, .26, bore), 'mag': (0, .19, bore + .1)}
    return parts, sockets, pivots, {'magAxis': [0, 0, 1]}


# ------------------------------------------------------------------ dmr
@weapon
def dmr():
    """Carabina: semi-auto marksman rifle, walnut stock and forend, 3x scope."""
    parts = {'body': [], 'mag': [], 'charge': [], 'trigger': []}
    bore = .06
    parts['body'] += [prism('receiver', [(-.04, .04, 1), (.15, .04, 1), (.15, .08), (.14, .086), (-.03, .086), (-.04, .075)], .034, 'gunmetal', bevel=.003, smooth=1)]
    stock = prism('stock', [(-.04, .07, 1), (-.09, .05), (-.33, .036), (-.345, .03), (-.345, -.1), (-.33, -.11), (-.2, -.06), (-.07, -.034),
                            (-.03, -.036), (.0, .01), (.03, .04, 1)], .044, 'wood_dark', bevel=.003, smooth=3)
    parts['body'] += [stock]
    parts['body'] += [prism('buttpad', [(-.345, .032), (-.358, .032), (-.358, -.108), (-.345, -.108)], .046, 'rubber', bevel=.004)]
    parts['body'] += [prism('forend', [(.12, .045, 1), (.4, .048, 1), (.41, .038), (.4, .022), (.2, .016), (.12, .02)], .046, 'wood_dark', bevel=.003, smooth=2)]
    parts['body'] += [box('forend_cap', (0, .41, .04), (.03, .02, .03), 'gunmetal', .002)]
    parts['body'] += [cyl('barrel', (0, .15, bore), (0, .64, bore), .0115, 'gunmetal', sides=22)]
    hider = tube('flash_hider', (0, .63, bore), (0, .685, bore), .014, .007, 'dark', sides=24)
    cut(hider, join([cutter_box((math.cos(a) * .014, .665, bore + math.sin(a) * .014), (.007, .03, .007)) for a in [i * math.tau / 4 + .4 for i in range(4)]], 'slots'))
    parts['body'] += [hider]
    parts['body'] += [box('front_sight', (0, .6, bore + .024), (.018, .016, .024), 'gunmetal', .002)]
    guard = prism('guard', [(.02, .04, 1), (.1, .04, 1), (.1, .026), (.09, .01), (.02, .01)], .018, 'gunmetal', bevel=.0015, raw=True)
    cut(guard, cutter_box((0, .06, .026), (.03, .064, .014)))
    parts['body'] += [complete(guard)]
    # 3x scope on rings.
    sz = .128
    for y in (.0, .1):
        parts['body'] += [box('ring_base', (0, y, .097), (.024, .018, .02), 'dark', .002)]
        parts['body'] += [tube('ring', (0, y - .008, sz), (0, y + .008, sz), .022, .0175, 'dark', sides=28)]
    parts['body'] += [cyl('scope_tube', (0, -.05, sz), (0, .15, sz), .018, 'olive', sides=32)]
    parts['body'] += [lathe('objective', [(.018, 0), (.028, .03), (.028, .06), (.024, .062)], 'olive', p0=(0, .15, sz), sides=32)]
    parts['body'] += [lathe('ocular', [(.018, 0), (.024, .015), (.024, .045), (.021, .048)], 'olive', p0=(0, -.05, sz), axis=(0, -1, 0), sides=32)]
    parts['body'] += [cyl('lens_front', (0, .208, sz), (0, .21, sz), .023, 'glass', sides=32, bevel=0)]
    parts['body'] += [cyl('lens_rear', (0, -.096, sz), (0, -.094, sz), .02, 'glass', sides=32, bevel=0)]
    parts['body'] += [cyl('turret_top', (0, .05, sz + .018), (0, .05, sz + .034), .01, 'teal', sides=20)]
    parts['body'] += [cyl('turret_side', (.018, .05, sz), (.034, .05, sz), .01, 'dark', sides=20)]
    parts['charge'] += [prism('charging_handle', [(.06, .058), (.1, .058), (.1, .068), (.06, .068)], .014, 'steel', x=.024, bevel=.0015)]
    parts['charge'] += [cyl('charge_knob', (.03, .09, .063), (.042, .09, .063), .006, 'steel', sides=14)]
    parts['trigger'] += [prism('trigger', [(.05, .038, 1), (.058, .038, 1), (.059, .026), (.053, .014), (.048, .015), (.052, .026)], .007, 'gunmetal', bevel=.001, smooth=1)]
    mag = prism('mag', [(.105, .04, 1), (.16, .04, 1), (.162, -.05), (.158, -.056), (.108, -.056), (.104, -.05)], .032, 'gunmetal', bevel=.0025, radius=.003)
    parts['mag'] += [mag]
    sockets = {'muzzle': (0, .69, bore), 'eject': (.02, .06, .075), 'sight': (0, -.1, sz)}
    pivots = {'mag': (0, .132, .04), 'charge': (.024, .08, .063)}
    return parts, sockets, pivots, {'magAxis': [0, 0, -1]}


# ------------------------------------------------------------------ sniper
@weapon
def sniper():
    """Bolt-action .308: olive stock, fluted heavy barrel, brake, big scope with teal turret."""
    parts = {'body': [], 'bolt': [], 'mag': [], 'trigger': []}
    bore = .058
    parts['body'] += [cyl('receiver', (0, -.03, bore), (0, .17, bore), .019, 'blued', sides=28)]
    stock = prism('stock', [(-.03, .06, 1), (-.08, .06), (-.33, .05), (-.35, .044), (-.35, -.1), (-.33, -.11), (-.2, -.06), (-.07, -.034),
                            (-.026, -.04), (.004, .006), (.03, .036), (.5, .04), (.52, .032), (.5, .018), (.16, .012), (.04, .02, 1)],
                   .048, 'olive', bevel=.003, smooth=3, raw=True)
    cut(stock, cutter_box((0, .08, .058), (.03, .2, .04)))
    parts['body'] += [complete(stock)]
    parts['body'] += [prism('cheek', [(-.09, .058), (-.24, .052), (-.24, .07), (-.11, .074)], .036, 'tan', bevel=.004, smooth=2)]
    parts['body'] += [prism('buttpad', [(-.35, .046), (-.364, .046), (-.364, -.108), (-.35, -.108)], .05, 'rubber', bevel=.004)]
    barrel = lathe('barrel', [(.0155, 0), (.0152, .3), (.0128, .62), (.0128, .64)], 'blued', p0=(0, .17, bore), sides=24)
    cut(barrel, join([cutter_box((math.cos(a) * .0165, .4, bore + math.sin(a) * .0165), (.006, .28, .006)) for a in [i * math.tau / 6 for i in range(6)]], 'flutes'))
    parts['body'] += [barrel]
    brake = box('brake', (0, .835, bore), (.034, .06, .03), 'dark', .004, raw=True)
    cut(brake, join([cutter_box((0, .82 + i * .016, bore), (.05, .008, .018)) for i in range(3)], 'ports'))
    parts['body'] += [complete(brake)]
    sz = .135
    for y in (.02, .13):
        parts['body'] += [box('ring_base', (0, y, .09), (.026, .02, .03), 'dark', .002)]
        parts['body'] += [tube('ring', (0, y - .009, sz), (0, y + .009, sz), .025, .0195, 'dark', sides=28)]
    parts['body'] += [cyl('scope_tube', (0, -.05, sz), (0, .2, sz), .0195, 'dark', sides=32)]
    parts['body'] += [lathe('objective', [(.0195, 0), (.036, .05), (.036, .1), (.033, .105)], 'dark', p0=(0, .2, sz), sides=36)]
    parts['body'] += [lathe('ocular', [(.0195, 0), (.026, .02), (.026, .06), (.023, .064)], 'dark', p0=(0, -.05, sz), axis=(0, -1, 0), sides=32)]
    parts['body'] += [cyl('lens_front', (0, .302, sz), (0, .304, sz), .031, 'glass', sides=36, bevel=0)]
    parts['body'] += [cyl('lens_rear', (0, -.112, sz), (0, -.11, sz), .021, 'glass', sides=32, bevel=0)]
    parts['body'] += [cyl('turret_top', (0, .075, sz + .02), (0, .075, sz + .042), .0125, 'teal', sides=24)]
    parts['body'] += [cyl('turret_side', (.02, .075, sz), (.04, .075, sz), .0115, 'dark', sides=24)]
    for side in (-1, 1):
        parts['body'] += [cyl('bipod_leg', (side * .012, .44, .005), (side * .014, .3, -.01), .0055, 'dark', sides=12)]
    parts['body'] += [box('bipod_mount', (0, .45, .01), (.03, .02, .016), 'dark', .002)]
    parts['bolt'] += [cyl('bolt_body', (0, -.045, bore), (0, .02, bore), .0105, 'steel', sides=20)]
    parts['bolt'] += [cyl('bolt_arm', (0, .0, bore), (.045, -.005, bore - .02), .005, 'steel', sides=14)]
    parts['bolt'] += [sphere('bolt_knob', (.05, -.006, bore - .024), (.011, .011, .011), 'dark', 18, 12)]
    parts['trigger'] += [prism('trigger', [(.04, .006, 1), (.047, .006, 1), (.048, -.006), (.043, -.018), (.038, -.017), (.042, -.006)], .007, 'steel', bevel=.001, smooth=1)]
    guard = prism('guard', [(.014, .01, 1), (.09, .01, 1), (.09, -.004), (.08, -.02), (.014, -.02)], .018, 'dark', bevel=.0015, raw=True)
    cut(guard, cutter_box((0, .052, -.006), (.03, .064, .014)))
    parts['body'] += [complete(guard)]
    parts['mag'] += [prism('mag', [(.1, .02, 1), (.15, .02, 1), (.152, -.03), (.102, -.03)], .03, 'dark', bevel=.0025, radius=.003)]
    sockets = {'muzzle': (0, .87, bore), 'eject': (.022, .0, bore + .005), 'sight': (0, -.12, sz)}
    pivots = {'bolt': (0, -.01, bore), 'mag': (0, .125, .02)}
    return parts, sockets, pivots, {'magAxis': [0, 0, -1]}


# ------------------------------------------------------------------ machete
@weapon
def machete():
    """Facao: swept carbon-steel belly, polished edge and palm-painted jacaranda."""
    parts = {'body': [], 'ribbons': []}
    # The broad belly and upswept nose remain readable edge-on in the raised idle.
    spine = [(.050, .018), (.16, .018), (.30, .017), (.41, .021), (.49, .035), (.548, .060)]
    bevel_line = [(.523, .020), (.484, -.012), (.410, -.027), (.29, -.029), (.15, -.021), (.05, -.012)]
    edge_line = [(.510, -.005), (.470, -.033), (.400, -.046), (.28, -.045), (.14, -.035), (.05, -.026)]
    parts['body'] += [prism('blade_body', spine + bevel_line, .0056, 'wornsteel', bevel=.0008, smooth=3)]
    parts['body'] += [prism('honed_edge', [spine[-1]] + edge_line + list(reversed(bevel_line)), .0028, 'blade', bevel=.0006, smooth=3)]
    # Full tang visible between the rounded scales, with a brass throat and pommel.
    handle = [(-.108, .022), (-.086, .023), (-.047, .016), (.042, .018), (.045, -.026),
              (-.021, -.019), (-.070, -.025), (-.100, -.034), (-.113, -.018)]
    parts['body'] += [prism('tang', handle, .007, 'steel', bevel=.001, smooth=2)]
    for side in (-1, 1):
        parts['body'] += [prism('wood_scale', handle, .013, 'wood_red', x=side * .009, bevel=.0024, smooth=3)]
    parts['body'] += [prism('bolster', [(.037, .023), (.060, .023), (.060, -.030), (.037, -.030)], .027, 'brass', bevel=.0025, radius=.003)]
    pommel = prism('pommel', [(-.094, .023), (-.108, .027), (-.121, .016), (-.120, -.017), (-.104, -.037), (-.095, -.032)], .032, 'brass', bevel=.002, radius=.005, raw=True)
    cut(pommel, cutter_cyl((-.025, -.110, -.007), (.025, -.110, -.007), .0062, 24))
    parts['body'] += [complete(pommel)]
    for y, z in [(-.077, -.005), (-.026, -.002), (.021, -.003)]:
        for side in (-1, 1):
            parts['body'] += [cyl('rivet_bezel', (side * .015, y, z), (side * .0165, y, z), .0052, 'brass', sides=20, bevel=.0007)]
            rivet = cyl('rivet', (side * .0161, y, z), (side * .017, y, z), .0038, 'brass', sides=20, bevel=.0005)
            cut(rivet, cutter_box((side * .0171, y, z), (.002, .0048, .0008)))
            parts['body'] += [rivet]
    parts['body'] += [sweep('lanyard_loop', [(-.016, -.108, -.007), (-.020, -.120, -.015), (0, -.126, -.025), (.020, -.120, -.015), (.016, -.108, -.007)], [.0026] * 5, 'teal', sides=10)]
    # Three broad cloth strips with different folds and forked, frayed ends.
    for i, (mat, x, length) in enumerate([('teal', -.007, .10), ('yellow', 0, .112), ('red', .007, .094)]):
        points = [(-.122, -.022), (-.135, -.035), (-.137 + i * .004, -.065), (-.150 + i * .006, -.022 - length),
                  (-.144 + i * .006, -.015 - length), (-.141 + i * .006, -.024 - length),
                  (-.135 + i * .006, -.018 - length), (-.124 + i * .004, -.066), (-.122, -.038)]
        parts['ribbons'] += [prism('ribbon_' + mat, points, .0014, mat, x=x, bevel=.00025, radius=.001)]
    parts['body'] += [sphere('lanyard_knot', (0, -.127, -.027), (.009, .007, .006), 'leather', 16, 10)]
    sockets = {'muzzle': (0, .548, .055), 'eject': (0, 0, 0), 'sight': (0, 0, .06)}
    return parts, sockets, {'ribbons': (0, -.127, -.027)}, {}


# Painted liveries (arsenal_lib.apply_livery): stencilled motifs per weapon,
# projected onto the baked albedo and chipped with the paint.
LIVERY = {
    'pistol': [
        {'stencil': 'palm', 'at': (-.0165, -.046), 'size': .034, 'rotate': -8, 'colour': 'D9B86C', 'on': ('wood_red',), 'metal': True},
    ],
    'revolver': [
        {'stencil': 'vine', 'at': (-.013, .040), 'size': .064, 'colour': 'D5AF62', 'on': ('case',), 'metal': True},
        {'stencil': 'vine', 'at': (.088, .045), 'size': .051, 'rotate': 180, 'colour': 'D5AF62', 'on': ('case',), 'metal': True},
        {'stencil': 'capybara', 'at': (-.014, -.031), 'size': .017, 'colour': '274C83', 'on': ('ivory',)},
    ],
    'smg': [
        {'stencil': 'star', 'at': (-.035, .064), 'size': .038, 'colour': '245EB1', 'on': ('yellow',)},
    ],
    'machete': [
        {'stencil': 'frond', 'at': (.006, -.003), 'size': .061, 'rotate': -24, 'colour': '258D82', 'on': ('wood_red',)},
        {'stencil': 'frond', 'at': (-.079, -.002), 'size': .053, 'rotate': 151, 'colour': '258D82', 'on': ('wood_red',)},
        {'stencil': 'capybara', 'at': (.085, .002), 'size': .024, 'rotate': -5, 'colour': '252A2A', 'on': ('wornsteel',), 'metal': True},
    ],
    'm4': [
        {'stencil': 'frond', 'at': (.258, .064), 'size': .115, 'rotate': -16, 'colour': 'E27A5A', 'on': ('navy',)},
        {'stencil': 'frond', 'at': (.318, .060), 'size': .085, 'rotate': 14, 'colour': 'F0A07A', 'on': ('navy',), 'opacity': .8},
    ],
}


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
    size = 2048 if weapon_id == 'm4' else 1024
    albedo, orm = L.bake_weapon(meshes, weapon_id, size=size, edge_radius=.0025 if weapon_id in ('m4', 'pistol', 'smg', 'revolver', 'machete') else .005,
                                livery=LIVERY.get(weapon_id, ()))
    albedo_img = L.save_png(f'{weapon_id}_albedo', albedo)
    orm_img = L.save_png(f'{weapon_id}_orm', orm, srgb=False)
    normal_img = L.bake_relief(meshes, weapon_id, size) if weapon_id in ('m4', 'pistol', 'smg', 'revolver', 'machete') else None
    material = L.export_material(f'{weapon_id}_mat', albedo_img, orm_img, normal_img)
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
