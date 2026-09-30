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


# ------------------------------------------------------------------ revolver
@weapon
def revolver():
    """Trinta-e-oito: blued six-shooter with a full under-lug, vent rib and jacaranda grip."""
    parts = {'body': [], 'cylinder': [], 'hammer': [], 'trigger': [], 'mag': []}
    frame = prism('frame', [(-.036, .066), (-.03, .086, 1), (.094, .086, 1), (.097, .078), (.097, .02, 1), (.078, .01), (.02, .006),
                            (-.004, -.004), (-.03, -.008), (-.046, .01), (-.048, .045)], .027, 'blued', bevel=.002, smooth=2, raw=True)
    cut(frame, cutter_box((0, .046, .05), (.05, .05, .049)))
    cut(frame, cutter_box((0, -.022, .088), (.006, .016, .01)))
    parts['body'] += [complete(frame)]
    parts['body'] += [cyl('barrel', (0, .096, .05), (0, .205, .05), .0115, 'blued', sides=28)]
    parts['body'] += [tube('crown', (0, .199, .05), (0, .2065, .05), .0118, .0052, 'steel')]
    parts['body'] += [prism('underlug', [(.094, .04, 1), (.203, .04, 1), (.206, .033), (.202, .024), (.1, .02)], .021, 'blued', bevel=.002, smooth=2)]
    rib = prism('rib', [(.09, .06, 1), (.206, .06, 1), (.206, .068), (.09, .07)], .012, 'blued', bevel=.0015, raw=True)
    cut(rib, join([cutter_box((0, .1 + i * .013, .07), (.02, .007, .006)) for i in range(8)], 'vents'))
    parts['body'] += [complete(rib)]
    parts['body'] += [prism('front_blade', [(.186, .068), (.2, .068), (.2, .076), (.19, .082)], .004, 'dark', bevel=.001)]
    parts['body'] += [box('front_insert', (0, .1925, .078), (.0045, .004, .006), 'orange', .001)]
    grip = prism('grip', [(-.034, .012, 1), (.014, .006, 1), (.02, -.018), (.013, -.048), (.018, -.074), (.006, -.104), (-.02, -.12),
                          (-.052, -.11), (-.062, -.082), (-.054, -.042), (-.05, -.012)], .033, 'wood', bevel=.003, smooth=3)
    parts['body'] += [grip]
    for side in (-1, 1):
        parts['body'] += [cyl('medallion', (side * .0166, -.02, -.035), (side * .0178, -.02, -.035), .0075, 'brass', sides=20, bevel=.0008)]
        parts['body'] += [cyl('grip_screw', (side * .0166, -.028, -.075), (side * .0172, -.028, -.075), .0035, 'steel', sides=12, bevel=.0005)]
    guard = prism('guard', [(.006, .01, 1), (.064, .01, 1), (.066, -.01), (.056, -.03), (.036, -.036), (.016, -.03), (.006, -.014)],
                  .012, 'blued', bevel=.0015, smooth=2, raw=True)
    cut(guard, cutter_prism([(.014, .004), (.056, .004), (.055, -.012), (.046, -.025), (.03, -.028), (.018, -.022), (.013, -.01)], .03))
    parts['body'] += [complete(guard)]
    parts['body'] += [box('thumb_latch', (-.0145, .005, .058), (.004, .012, .007), 'steel', .001)]
    # Cylinder: fluted, six chambers with brass case heads at the back.
    drum = lathe('cylinder', [(0, 0), (.021, 0), (.0235, .004), (.0235, .041), (.021, .045), (0, .045)], 'blued', p0=(0, .024, .05), sides=36)
    flutes = join([cutter_cyl((math.cos(a) * .0262, .03, .05 + math.sin(a) * .0262), (math.cos(a) * .0262, .075, .05 + math.sin(a) * .0262), .0062)
                   for a in [i * math.tau / 6 + math.tau / 12 for i in range(6)]], 'flutes')
    cut(drum, flutes)
    chambers = join([cutter_cyl((math.cos(a) * .0138, .06, .05 + math.sin(a) * .0138), (math.cos(a) * .0138, .08, .05 + math.sin(a) * .0138), .0052)
                     for a in [i * math.tau / 6 for i in range(6)]], 'chambers')
    cut(drum, chambers)
    parts['cylinder'] += [drum]
    for a in [i * math.tau / 6 for i in range(6)]:
        x, z = math.cos(a) * .0138, .05 + math.sin(a) * .0138
        parts['cylinder'] += [cyl('case_head', (x, .0232, z), (x, .0262, z), .0058, 'brass', sides=16, bevel=.0005)]
        parts['cylinder'] += [cyl('bullet_nose', (x, .0655, z), (x, .0685, z), .0042, 'copper', sides=12, bevel=.0008)]
    parts['cylinder'] += [cyl('ejector_rod', (0, .069, .05), (0, .094, .05), .0035, 'steel', sides=12, bevel=.0005)]
    parts['cylinder'] += [prism('crane', [(.066, .03), (.072, .03), (.072, .02), (.066, .02)], .012, 'blued', x=-.004, bevel=.001)]
    hammer = prism('hammer', [(-.004, -.006, 1), (.005, -.006, 1), (.004, .012), (-.004, .02), (-.016, .024), (-.02, .018), (-.012, .01), (-.006, .002)],
                   .009, 'blued', bevel=.0012, smooth=2)
    move(hammer, (0, -.03, .058))
    parts['hammer'] += [hammer]
    trig = prism('trigger', [(.03, .01, 1), (.037, .01, 1), (.04, -.004), (.033, -.02), (.027, -.02), (.031, -.004)], .008, 'steel', bevel=.001, smooth=2)
    parts['trigger'] += [trig]
    # Speedloader: teal body holding six rounds; hidden until the reload.
    loader = [lathe('speedloader', [(0, 0), (.021, 0), (.023, .006), (.021, .018), (.009, .024), (.006, .036), (0, .036)], 'teal', p0=(0, 0, 0), axis=(0, -1, 0), sides=28)]
    for a in [i * math.tau / 6 for i in range(6)]:
        x, z = math.cos(a) * .0138, math.sin(a) * .0138
        loader += [cyl('round', (x, .0, z), (x, .038, z), .0052, 'brass', sides=14, bevel=.0006)]
        loader += [cyl('round_nose', (x, .038, z), (x, .046, z), .0048, 'copper', r1=.003, sides=12, bevel=.0006)]
    speed = join(loader, 'speedloader')
    move(speed, (0, .0235, .05))
    parts['mag'] += [speed]
    sockets = {'muzzle': (0, .208, .05), 'eject': (-.02, .045, .05), 'sight': (0, -.032, .0825)}
    pivots = {'cylinder': (0, .045, .05), 'hammer': (0, -.03, .058), 'mag': (0, .0235, .05)}
    return parts, sockets, pivots, {'magAxis': [0, -1, 0], 'crane': [-.013, .045, .026]}


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
    # The front lug has a palm relief on the near side and a finger seat on the far side.
    for vertex in lower.data.vertices:
        front = min(1., max(0., (vertex.co.y - .1) / .025))
        vertex.co.y += front * (.0025 + vertex.co.x * (.015 / .036))
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
    # Receiver and front rails leave a lower thumb rest at the support grip.
    rail = box('rail', (0, .15, .0985), (.023, .44, .0095), 'dark', .0014, raw=True)
    cut(rail, join([cutter_box((0, -.064 + i * .0105, .1048), (.03, .0048, .0064)) for i in range(40)], 'rail_slots'))
    cut(rail, cutter_box((0, .189, .0985), (.04, .102, .04)))
    parts['body'] += [complete(rail)]
    parts['body'] += [box('thumb_rest', (0, .187, .080), (.013, .096, .002), 'dark', .0008)]
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
    # Paw-sized grip depth: the heel can contact the backstrap while the index
    # reaches the trigger, without hiding the whole hand on the far side.
    grip.data.transform(Matrix.Diagonal((1, .45, 1, 1)))
    move(grip, (0, -.0435, 0))
    parts['body'] += [grip]
    # Enlarged trigger guard, open front for gloved (or clawed) fingers.
    # Oversized guard: a paw's trigger digit fits between trigger and guard.
    # Its rear sweeps up into the grip so the digits below it wrap the grip freely.
    guard = prism('guard', [(-.046, .006, 1), (.042, .006, 1), (.042, -.028), (.032, -.044), (.004, -.047), (-.03, -.036), (-.046, -.02)], .016, 'polymer', bevel=.0024, raw=True, smooth=1)
    cut(guard, cutter_prism([(-.034, -.001), (.035, -.001), (.031, -.033), (.006, -.038), (-.024, -.028), (-.034, -.014)], .03))
    parts['body'] += [complete(guard)]
    # The rear waist fits the short paw digits; the painted front keeps its broad octagon.
    hand = lathe('handguard', [(.016, 0), (.0165, .005), (.0165, .102), (.0288, .154), (.0288, .232), (.027, .238)], 'navy', p0=(0, .134, bore), sides=8)
    # Flats (not ridges) face the sides, top and bottom, like a real octagonal rail.
    hand.data.transform(Matrix.Translation((0, 0, bore)) @ Matrix.Rotation(math.radians(22.5), 4, 'Y') @ Matrix.Translation((0, 0, -bore)))
    slot_radii = [.0165, .0165, .021, .029]
    slots = join([cutter_box((s * r, .168 + i * .044, bore), (.012, .028, .0085)) for s in (-1, 1) for i, r in enumerate(slot_radii)] +
                 [cutter_box((0, .168 + i * .044, bore - r), (.0085, .028, .012)) for i, r in enumerate(slot_radii)], 'slots')
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
        inset.data.transform(Matrix.Diagonal((1, .45, 1, 1)))
        move(inset, (0, -.0435, 0)); parts['body'] += [inset]
        for y, z in [(-.058, .031), (.112, .026)]:
            parts['body'] += [cyl('pin', (s * .0182, y, z), (s * .0205, y, z), .0042, 'brass', sides=16, bevel=.0005)]
        parts['body'] += [prism('receiver_seam', [(-.064, .0455), (.123, .0455), (.123, .0475), (-.064, .0475)], .0008, 'steel', x=s * .0181, bevel=.0003)]
        parts['body'] += [prism('selector', [(-.034, .018), (-.036, .029), (-.024, .033), (-.01, .022), (-.015, .017)], .003, 'gunmetal', x=s * .0205, bevel=.0007)]
        parts['body'] += [prism('stock_inlay', [(-.28, .062), (-.2, .066), (-.198, .061), (-.278, .057)], .001, 'teal', x=s * .0235, bevel=.0004)]
        for y1, z1, y2, z2 in [(.15, .05, .15, .08), (.15, .061, .143, .07), (.15, .067, .158, .076)]:
            parts['body'] += [cyl('coral_mark', (s * .0148, y1, bore + (z1 - bore) * .78), (s * .0148, y2, bore + (z2 - bore) * .78), .00115, 'coral', sides=8, bevel=0)]
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
    """Compact SMG: dark receiver with teal panels, perforated shroud, angled foregrip, stick magazine."""
    parts = {'body': [], 'mag': [], 'charge': [], 'trigger': []}
    bore = .058
    rec = prism('receiver', [(-.062, .028, 1), (.172, .028, 1), (.184, .04), (.184, .082), (.172, .092, 1), (-.05, .092, 1), (-.064, .08)],
                .042, 'dark', bevel=.003, smooth=1, raw=True)
    cut(rec, cutter_box((.02, .05, .066), (.012, .045, .016)))
    parts['body'] += [complete(rec)]
    for side in (-1, 1):
        parts['body'] += [prism('panel', [(.0, .04), (.15, .04), (.15, .078), (.0, .078)], .004, 'teal', x=side * .0215, bevel=.0012, radius=.006)]
    parts['body'] += [box('top_rail', (0, .06, .097), (.022, .1, .008), 'dark', .0015)]
    shroud = tube('shroud', (0, .18, bore), (0, .262, bore), .019, .012, 'dark', sides=28)
    cut(shroud, join([cutter_cyl((0, .2 + i * .02, bore + .03), (0, .2 + i * .02, bore - .03), .0045, 12) for i in range(3)] +
                     [cutter_cyl((.03, .2 + i * .02, bore), (-.03, .2 + i * .02, bore), .0045, 12) for i in range(3)], 'holes'))
    parts['body'] += [shroud]
    parts['body'] += [cyl('barrel', (0, .19, bore), (0, .28, bore), .008, 'gunmetal', sides=16)]
    parts['body'] += [tube('muzzle', (0, .262, bore), (0, .292, bore), .0125, .006, 'gunmetal', sides=24)]
    # Rear drum sight and a hooded front post: ADS looks through both rings.
    parts['body'] += [box('rear_base', (0, -.03, .1), (.024, .02, .012), 'dark', .002)]
    parts['body'] += [tube('rear_ring', (0, -.036, .116), (0, -.022, .116), .013, .0068, 'teal', sides=28)]
    parts['body'] += [box('front_base', (0, .165, .1), (.02, .016, .012), 'dark', .002)]
    parts['body'] += [tube('front_hood', (0, .158, .116), (0, .172, .116), .012, .0095, 'dark', sides=28)]
    parts['body'] += [box('front_post', (0, .165, .11), (.0028, .004, .012), 'orange', .0008)]
    grip = prism('grip', [(-.006, .03, 1), (.032, .03, 1), (.031, .012), (.022, -.02), (.014, -.06), (.006, -.088), (-.028, -.094), (-.04, -.08),
                          (-.032, -.042), (-.024, -.008), (-.026, .014)], .032, 'polymer', bevel=.003, smooth=3)
    parts['body'] += [grip]
    guard = prism('guard', [(.02, .03, 1), (.052, .03, 1), (.052, .012), (.046, .004), (.02, .004)], .018, 'dark', bevel=.0015, raw=True)
    cut(guard, cutter_box((0, .036, .016), (.03, .024, .014)))
    parts['body'] += [complete(guard)]
    well = prism('magwell', [(.05, .03, 1), (.108, .03, 1), (.106, .006), (.054, .006)], .034, 'dark', bevel=.0025)
    parts['body'] += [well]
    parts['body'] += [prism('foregrip', [(.128, .03, 1), (.168, .03, 1), (.16, -.02), (.154, -.066), (.13, -.07), (.126, -.03)], .03, 'polymer', bevel=.003, smooth=2)]
    for side in (-1, 1):
        parts['body'] += [cyl('stock_rod', (side * .016, -.06, .06), (side * .016, -.2, .055), .0055, 'steel', sides=14)]
    parts['body'] += [prism('stock_pad', [(-.2, .085, 1), (-.216, .085, 1), (-.216, .005, 1), (-.2, .005, 1)], .046, 'teal', bevel=.004)]
    parts['charge'] += [prism('cocking_lever', [(.12, .075), (.15, .075), (.152, .084), (.12, .084)], .016, 'gunmetal', x=-.028, bevel=.0015)]
    parts['charge'] += [cyl('cocking_knob', (-.036, .15, .08), (-.046, .15, .08), .006, 'gunmetal', sides=14)]
    parts['trigger'] += [prism('trigger', [(.034, .026, 1), (.041, .026, 1), (.042, .016), (.036, .008), (.032, .01), (.036, .018)], .007, 'gunmetal', bevel=.001, smooth=1)]
    mag = prism('mag', [(.056, .02, 1), (.1, .02, 1), (.108, -.17), (.064, -.17)], .026, 'dark', bevel=.0025, radius=.004)
    plate = prism('mag_plate', [(.06, -.166, 1), (.112, -.166, 1), (.114, -.18), (.062, -.18)], .03, 'teal', bevel=.002, radius=.003)
    parts['mag'] += [join([mag, plate], 'mag')]
    sockets = {'muzzle': (0, .296, bore), 'eject': (.022, .05, .066), 'sight': (0, -.045, .116)}
    pivots = {'mag': (0, .078, .02), 'charge': (-.028, .136, .08)}
    return parts, sockets, pivots, {'magAxis': [0, .045, -1]}


# ------------------------------------------------------------------ shotgun
@weapon
def shotgun():
    """Doze: walnut pump gun, brass fittings, teal foliage and a red recoil pad."""
    parts = {'body': [], 'pump': [], 'mag': [], 'trigger': []}
    bore = .078
    receiver = prism('receiver', [(-.065, .012, 1), (.177, .012, 1), (.181, .086), (.164, .105), (-.038, .105), (-.065, .083)],
                     .045, 'blued', bevel=.003, smooth=1, raw=True)
    cut(receiver, cutter_box((.022, .083, .077), (.019, .079, .024)))
    cut(receiver, cutter_box((0, .101, .018), (.037, .103, .06)))
    parts['body'] += [complete(receiver)]
    parts['body'] += [box('port_bolt', (.013, .083, .076), (.006, .073, .017), 'steel', .002)]
    parts['body'] += [box('loading_lifter', (0, .093, .05), (.028, .077, .003), 'steel', .001)]
    parts['body'] += [cyl('barrel', (0, .17, bore), (0, .657, bore), .0155, 'blued', sides=28)]
    parts['body'] += [tube('muzzle_crown', (0, .644, bore), (0, .667, bore), .017, .0112, 'steel', sides=28)]
    # A genuinely vented rib: individual bridges leave daylight above the barrel.
    parts['body'] += [box('rib', (0, .411, .104), (.01, .492, .004), 'blued', .0008)]
    for y in (.19, .267, .344, .421, .498, .575, .646):
        parts['body'] += [box('rib_bridge', (0, y, .098), (.009, .013, .012), 'blued', .0008)]
    parts['body'] += [sphere('bead', (0, .651, .111), (.0028, .0028, .0028), 'brass', 12, 8)]
    # Low rear ramp stays below the bead line.
    parts['body'] += [prism('rear_ramp', [(-.045, .105), (-.024, .105), (-.027, .108), (-.04, .108)], .015, 'blued', bevel=.001)]
    parts['body'] += [cyl('mag_tube', (0, .17, .031), (0, .588, .031), .0135, 'blued', sides=24)]
    parts['body'] += [cyl('mag_cap', (0, .581, .031), (0, .604, .031), .0165, 'gunmetal', sides=24)]
    for y in (.585, .59, .595, .6):
        parts['body'] += [tube('cap_knurl', (0, y, .031), (0, y + .0017, .031), .017, .014, 'dark', sides=20, bevel=.0003)]
    parts['body'] += [prism('barrel_band', [(.548, .017), (.561, .017), (.561, .089), (.548, .089)], .023, 'brass', bevel=.002)]
    stock = prism('walnut_stock', [(-.064, .079, 1), (-.11, .052), (-.174, .046), (-.212, .065), (-.364, .036),
                    (-.38, .027), (-.38, -.114), (-.365, -.124), (-.257, -.08), (-.15, -.041), (-.093, -.04),
                    (-.075, -.125), (-.036, -.12), (-.013, .0), (-.032, .026), (-.064, .037, 1)],
                  .054, 'walnut', bevel=.008, smooth=3, raw=True)
    L.cross_sections(stock, 1, [-.16, -.11, -.06, -.02, .02])
    # Oval wrist section fits the thick paw without thinning the shoulder stock.
    for vertex in stock.data.vertices:
        y, z = vertex.co.y, vertex.co.z
        neck = min(1., max(0., (y + .16) / .05), max(0., (.045 - y) / .055))
        neck *= min(1., max(0., (.06 - z) / .025))
        vertex.co.x *= 1. - .60 * neck
        vertex.co.y -= (y + .013) * .55 * neck
    parts['body'] += [complete(stock)]
    parts['body'] += [prism('butt_spacer', [(-.377, .031), (-.387, .028), (-.387, -.117), (-.377, -.12)], .048, 'dark', bevel=.002)]
    pad = prism('red_recoil_pad', [(-.385, .028), (-.403, .022), (-.403, -.11), (-.396, -.122), (-.385, -.119)], .05, 'rubber_red', bevel=.004, raw=True)
    cut(pad, join([cutter_box((0, -.395, -.096 + i * .019), (.06, .007, .009)) for i in range(6)], 'pad_vents'))
    parts['body'] += [complete(pad)]
    # Brass stock collar and receiver nose band, with recessed slotted screws.
    for y, z, h in ((-.062, .051, .067), (.174, .059, .088)):
        parts['body'] += [box('receiver_band', (0, y, z), (.047, .008, h), 'brass', .002)]
    for side in (-1, 1):
        for y, z in ((-.045, .072), (-.039, .033), (.146, .034)):
            parts['body'] += [cyl('pin', (side * .022, y, z), (side * .0242, y, z), .0043, 'brass', sides=14, bevel=.0005)]
            parts['body'] += [box('pin_slot', (side * .0243, y, z), (.0005, .005, .0008), 'dark', .0002)]
    guard = prism('guard', [(-.038, .014, 1), (.053, .014, 1), (.056, -.022), (.041, -.055), (-.017, -.055), (-.038, -.024)],
                  .018, 'blued', bevel=.002, smooth=1, raw=True)
    cut(guard, cutter_prism([(-.027, .006), (.043, .006), (.042, -.02), (.033, -.047), (-.016, -.047), (-.027, -.02)], .035))
    parts['body'] += [complete(guard)]
    parts['trigger'] += [prism('trigger', [(.001, .009), (.009, .009), (.011, -.007), (.002, -.025), (-.005, -.027), (.0, -.009)], .007, 'brass', bevel=.001, smooth=2)]
    parts['trigger'] += [box('trigger_pad', (.006, .003, -.021), (.025, .01, .014), 'brass', .002)]
    # Four visible red shells, brass case heads and a retaining strap.
    parts['body'] += [box('saddle_back', (-.025, .022, .063), (.008, .113, .05), 'dark', .002)]
    for i in range(4):
        y = -.018 + i * .026
        parts['body'] += [cyl('saddle_hull', (-.035, y, .05), (-.035, y, .094), .0105, 'red', sides=16, bevel=.001)]
        parts['body'] += [cyl('saddle_base', (-.035, y, .039), (-.035, y, .05), .0112, 'brass', sides=16, bevel=.001)]
        parts['body'] += [box('shell_clip', (-.045, y, .064), (.003, .021, .013), 'dark', .001)]
        parts['body'] += [cyl('clip_rivet', (-.047, y, .064), (-.048, y, .064), .0024, 'brass', sides=10, bevel=.0003)]
    # Continuous ribbed pump, never boolean-sliced into disconnected discs.
    profile = [(.014, 0), (.025, .004), (.029, .012)]
    for i in range(10):
        d = .019 + i * .013
        profile += [(.029, d), (.0255, d + .002), (.0255, d + .0045), (.029, d + .007)]
    profile += [(.029, .156), (.025, .164), (.014, .168)]
    parts['pump'] += [lathe('walnut_pump', profile, 'walnut', p0=(0, .277, .031), sides=24, bevel=.0007)]
    for side in (-1, 1):
        parts['pump'] += [box('action_bar', (side * .025, .22, .022), (.004, .19, .008), 'steel', .001)]
    # One shell enters the loading port; hidden outside shell choreography.
    parts['mag'] += [cyl('shell_hull', (0, .076, .012), (0, .128, .012), .0105, 'red', sides=18, bevel=.001)]
    parts['mag'] += [cyl('shell_base', (0, .067, .012), (0, .076, .012), .0112, 'brass', sides=18, bevel=.0008)]
    sockets = {'muzzle': (0, .671, bore), 'eject': (.026, .083, .077), 'sight': (0, -.03, .113)}
    pivots = {'pump': (0, .277, .031), 'mag': (0, .067, .012), 'trigger': (0, .005, .007)}
    return parts, sockets, pivots, {'magAxis': [0, 1, 0]}


# ------------------------------------------------------------------ coco
@weapon
def coco():
    """Lança-coco: painted bamboo, open parrot hopper and a separate walnut pump."""
    parts = {'body': [], 'pump': [], 'mag': [], 'load1': [], 'load2': [], 'trigger': []}
    bore = .112
    parts['body'] += [lathe('painted_bamboo', [(.044, 0), (.046, .01), (.045, .11), (.045, .47), (.043, .5)], 'yellow', p0=(0, -.055, bore), sides=28)]
    # A hollow wood bell with a brass lip; nothing plugs the launcher's mouth.
    parts['body'] += [lathe('wood_bell', [(.043, 0), (.054, .04), (.078, .095), (.079, .108), (.071, .113), (.066, .095), (.038, .025), (.037, 0)],
                            'wood_red', p0=(0, .436, bore), sides=32, bevel=.001)]
    parts['body'] += [tube('bell_lip', (0, .536, bore), (0, .55, bore), .08, .07, 'brass', sides=32)]
    parts['body'] += [cyl('breech', (0, -.098, bore), (0, -.045, bore), .049, 'blued', sides=28, bevel=.003)]
    # A domed service cap reads as a closed breech from the first-person eye.
    parts['body'] += [lathe('breech_cap', [(.012, 0), (.035, .001), (.043, .005), (.043, .011)],
                            'steel', p0=(0, -.114, bore), sides=24)]
    parts['body'] += [cyl('cap_lock', (0, -.118, bore), (0, -.113, bore), .009, 'brass', sides=12, bevel=.0005, segments=1)]
    parts['body'] += [box('cap_lock_slot', (0, -.1184, bore), (.012, .001, .002), 'dark', .0003)]
    for angle in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        x, z = math.cos(angle) * .034, bore + math.sin(angle) * .034
        parts['body'] += [cyl('cap_screw', (x, -.116, z), (x, -.109, z), .0035, 'brass', sides=8, bevel=.0005, segments=1)]
    for y in (-.079, .098, .286, .43):
        parts['body'] += [tube('brass_barrel_band', (0, y, bore), (0, y + .013, bore), .0485, .042, 'brass', sides=24)]
        for side in (-1, 1):
            parts['body'] += [cyl('band_rivet', (side * .048, y + .006, bore), (side * .05, y + .006, bore), .0033, 'dark', sides=12, bevel=.0005)]
    # Rope turns have real relief; their contrasting narrow lines remain legible in the hip view.
    for y in (-.106, .131, .41):
        for turn in range(3):
            pts = [(math.cos(a) * .05, y + turn * .005 + a / math.tau * .005, bore + math.sin(a) * .05) for a in [i * math.tau / 20 for i in range(21)]]
            parts['body'] += [sweep('sisal_rope', pts, [.0028] * len(pts), 'sisal', sides=5)]
    # Low brass action housing and an exposed sprung linkage on each side.
    parts['body'] += [prism('action_frame', [(-.096, .067), (.133, .067), (.14, .025), (.116, .012), (-.07, .014), (-.096, .031)], .047, 'blued', bevel=.003, smooth=1)]
    for side in (-1, 1):
        parts['body'] += [box('action_rail', (side * .049, .021, .079), (.007, .16, .017), 'brass', .0015)]
        parts['body'] += [cyl('spring_rod', (side * .054, -.045, .096), (side * .054, .09, .096), .004, 'steel', sides=12)]
        pts = [(side * .054 + math.cos(a) * .0065, -.039 + .12 * i / 72, .096 + math.sin(a) * .0065) for i, a in enumerate([j * math.tau * 8 / 72 for j in range(73)])]
        parts['body'] += [sweep('action_spring', pts, [.0015] * len(pts), 'steel', sides=4)]
        for y in (-.058, .1):
            parts['body'] += [cyl('action_wheel', (side * .045, y, .076), (side * .06, y, .076), .017, 'brass', sides=20, bevel=.0015)]
            parts['body'] += [cyl('axle_head', (side * .06, y, .076), (side * .063, y, .076), .0085, 'steel', sides=14, bevel=.001)]
    grip = prism('walnut_grip', [(-.091, .022), (-.033, .022), (-.037, -.006), (-.054, -.064), (-.045, -.097), (-.091, -.11), (-.111, -.094), (-.098, -.062), (-.099, -.021)],
                 .034, 'walnut', bevel=.004, smooth=2)
    parts['body'] += [grip]
    parts['body'] += [prism('grip_brass_cap', [(-.094, -.097), (-.045, -.091), (-.041, -.104), (-.09, -.119), (-.109, -.103)], .038, 'brass', bevel=.002, smooth=1)]
    for side in (-1, 1):
        for y, z in ((-.07, -.025), (-.073, -.076)):
            parts['body'] += [cyl('grip_screw', (side * .017, y, z), (side * .019, y, z), .004, 'brass', sides=12, bevel=.0005)]
    # Shorten the backstrap reach while retaining the front face and grip rake.
    for obj in parts['body']:
        if obj.name.split('.')[0] in ('walnut_grip', 'grip_brass_cap', 'grip_screw'):
            for vertex in obj.data.vertices:
                vertex.co.y = .45 * vertex.co.y - .01815
    guard = prism('brass_guard', [(-.031, .018), (.058, .018), (.061, -.02), (.044, -.047), (-.019, -.047), (-.039, -.025)], .019, 'brass', bevel=.0025, smooth=1, raw=True)
    cut(guard, cutter_prism([(-.025, .009), (.047, .009), (.049, -.018), (.036, -.036), (-.014, -.036), (-.029, -.023)], .034))
    parts['body'] += [complete(guard)]
    parts['trigger'] += [prism('trigger', [(-.001, .01), (.007, .01), (.009, -.008), (.001, -.028), (-.008, -.03), (-.002, -.01)], .008, 'brass', bevel=.001, smooth=2)]
    parts['body'] += [prism('walnut_stock', [(-.099, .106), (-.157, .084), (-.211, .068), (-.363, .082), (-.397, .07), (-.397, -.102), (-.374, -.116), (-.246, -.059), (-.19, -.025), (-.105, .059)],
                            .056, 'walnut', bevel=.007, smooth=3)]
    parts['body'] += [prism('stock_brass_cap', [(-.392, .077), (-.407, .07), (-.407, -.1), (-.397, -.116), (-.389, -.11)], .061, 'brass', bevel=.003, smooth=1)]
    # Hopper: four tapered walls and an open top, with wood corner battens and a rolled rim.
    hopper = prism('hopper_bin', [(-.048, .167), (.225, .167), (.253, .262), (-.071, .262)], .126, 'yellow', bevel=.003, raw=True)
    cut(hopper, cutter_prism([(-.037, .177), (.215, .177), (.242, .28), (-.059, .28)], .108))
    parts['body'] += [complete(hopper)]
    for side in (-1, 1):
        parts['body'] += [box('hopper_rim', (side * .064, .091, .261), (.008, .332, .01), 'walnut', .002)]
        for y0, y1 in ((-.047, -.07), (.224, .252)):
            parts['body'] += [sweep('corner_batten', [(side * .062, y0, .172), (side * .063, y1, .256)], [.006] * 2, 'walnut', sides=6)]
            for z, y in ((.186, y0), (.246, y1)):
                parts['body'] += [cyl('hopper_rivet', (side * .065, y, z), (side * .068, y, z), .0042, 'brass', sides=12, bevel=.0006)]
    for y in (-.07, .252):
        parts['body'] += [box('hopper_end_rim', (0, y, .261), (.133, .008, .01), 'walnut', .002)]
    for i, y in enumerate((.002, .092, .182)):
        dest = parts['mag' if i == 0 else f'load{i}']
        dest += [sphere('green_coconut', (0, y, .246), (.043, .041, .048), 'coconut_green', 16, 12)]
        dest += [cyl('coconut_stem', (0, y, .288), (0, y, .295), .009, 'coconut_fibre', r1=.004, sides=12, bevel=.0008)]
        for a in [j * math.tau / 6 for j in range(6)]:
            pts = [(math.cos(a) * .042 * math.sin(t), y + math.sin(a) * .04 * math.sin(t), .246 + .047 * math.cos(t)) for t in (.24, .6, 1, 1.5, 2.1, 2.6)]
            dest += [sweep('coconut_fibre', pts, [.001] * len(pts), 'coconut_fibre', sides=5)]
    # The pump slides on its own lower rod, clear of the large barrel and hopper.
    parts['body'] += [cyl('pump_rod', (0, .111, .012), (0, .445, .012), .009, 'brass', sides=18)]
    parts['body'] += [box('pump_rod_mount', (0, .433, .039), (.025, .025, .055), 'blued', .003)]
    profile = [(.01, 0), (.025, .008)]
    for i in range(10):
        d = .015 + i * .013
        profile += [(.027, d), (.023, d + .0025), (.023, d + .005), (.027, d + .008)]
    profile += [(.024, .153), (.01, .16)]
    parts['pump'] += [lathe('walnut_pump', profile, 'walnut', p0=(0, .226, .012), sides=18, bevel=0)]
    # A broad offset leaves an open target area beside the hopper, not just a
    # clear mathematical centre line. Matching brass outriggers carry both sights.
    sight_x = -.17
    parts['body'] += [box('rear_sight_outrigger', (-.099, -.087, .159), (.169, .016, .01), 'brass', .002)]
    rear = box('rear_notch', (sight_x, -.087, .176), (.033, .012, .029), 'blued', .002, raw=True)
    cut(rear, cutter_box((sight_x, -.087, .189), (.012, .025, .02)))
    parts['body'] += [complete(rear)]
    parts['body'] += [box('front_sight_outrigger', (-.099, .452, .158), (.176, .018, .013), 'brass', .002)]
    # The leaf faces the eye across the bore, with daylight around the gold post.
    leaf = prism('leaf_sight', [(-.016, .164), (.016, .164), (.021, .193), (0, .226), (-.021, .198)], .006, 'blued', bevel=.0015, raw=True)
    cut(leaf, cutter_prism([(-.009, .184), (.009, .184), (.011, .199), (0, .215), (-.011, .199)], .014))
    complete(leaf)
    leaf.rotation_euler.z = math.pi / 2
    leaf.location.x, leaf.location.y = sight_x, .455
    parts['body'] += [leaf]
    parts['body'] += [box('front_post', (sight_x, .455, .18), (.0028, .006, .031), 'brass', .0005)]
    sockets = {'muzzle': (0, .554, bore), 'eject': (0, .09, .254), 'sight': (sight_x, -.087, .194)}
    pivots = {'pump': (0, .226, .012), 'mag': (0, .002, .246), 'load1': (0, .092, .246), 'load2': (0, .182, .246), 'trigger': (0, .004, .009)}
    return parts, sockets, pivots, {'magAxis': [0, 0, 1]}


# ------------------------------------------------------------------ dmr
@weapon
def dmr():
    """Carabina: olive stamped receiver, walnut furniture, compact brass-banded optic."""
    parts = {'body': [], 'mag': [], 'charge': [], 'trigger': []}
    bore, sz = .07, .158
    receiver = prism('olive_receiver', [(-.09, .011, 1), (.142, .011, 1), (.16, .031), (.16, .094), (-.077, .094), (-.09, .074)],
                     .043, 'olive', bevel=.0025, smooth=1, raw=True)
    cut(receiver, cutter_box((.021, .055, .074), (.017, .087, .022)))
    cut(receiver, cutter_box((0, .081, .009), (.031, .066, .03)))
    parts['body'] += [complete(receiver)]
    parts['body'] += [prism('receiver_cover', [(-.087, .091), (.161, .091), (.153, .109), (-.07, .109)], .033, 'olive', bevel=.0025)]
    parts['body'] += [box('port_bolt', (.013, .055, .074), (.007, .084, .016), 'steel', .0015)]
    # Receiver stampings, pins, selector and the magazine catch are readable from the eye.
    for side in (-1, 1):
        parts['body'] += [prism('receiver_reinforcement', [(-.071, .018), (.13, .018), (.131, .04), (.074, .04), (.068, .052), (-.071, .052)], .002, 'olive', x=side * .0217, bevel=.0008)]
        parts['body'] += [box('receiver_seam', (side * .022, .026, .055), (.0012, .208, .0012), 'dark', .0003)]
        for y, z in ((-.064, .073), (-.045, .03), (.125, .033), (.132, .074)):
            parts['body'] += [cyl('receiver_pin', (side * .022, y, z), (side * .024, y, z), .0038, 'steel', sides=14, bevel=.0005)]
        parts['body'] += [prism('selector', [(-.031, .02), (-.034, .028), (-.013, .037), (-.009, .032), (-.02, .018)], .003, 'brass', x=side * .024, bevel=.0008)]
    parts['body'] += [prism('mag_catch', [(.038, .0), (.05, .0), (.053, -.014), (.035, -.02), (.032, -.012)], .012, 'brass', bevel=.001)]
    # An independent pistol grip leaves a full-size trigger opening for the paw.
    grip = prism('pistol_grip', [(-.092, .014), (-.033, .012), (-.039, -.008), (-.061, -.098), (-.095, -.109), (-.118, -.096), (-.098, -.023)],
                 .033, 'polymer', bevel=.003, smooth=2)
    parts['body'] += [grip]
    for side in (-1, 1):
        parts['body'] += [prism('grip_stipple', [(-.091, -.016), (-.047, -.019), (-.065, -.087), (-.104, -.09)], .0015, 'rubber', x=side * .017, bevel=.0008, radius=.003)]
        for row in range(5):
            for col in range(3):
                parts['body'] += [sphere('stipple', (side * .018, -.096 + col * .012 + row * .002, -.027 - row * .012), (.001, .0015, .0015), 'polymer', 6, 4)]
    # Shorten the backstrap reach while retaining the front face and grip rake.
    for obj in parts['body']:
        if obj.name.split('.')[0] in ('pistol_grip', 'grip_stipple', 'stipple'):
            for vertex in obj.data.vertices:
                vertex.co.y = .45 * vertex.co.y - .01815
    guard = prism('guard', [(-.049, .012), (.047, .012), (.048, -.026), (.034, -.055), (-.036, -.054), (-.053, -.027)], .032, 'olive', bevel=.002, raw=True, smooth=1)
    cut(guard, cutter_prism([(-.041, .004), (.038, .004), (.037, -.025), (.027, -.047), (-.031, -.046), (-.043, -.02)], .048))
    parts['body'] += [complete(guard)]
    parts['trigger'] += [prism('trigger', [(-.001, .006), (.007, .006), (.01, -.007), (.002, -.026), (-.006, -.029), (-.002, -.01)], .007, 'steel', bevel=.001, smooth=2)]
    parts['trigger'] += [box('trigger_shoe', (.006, .003, -.021), (.025, .01, .014), 'steel', .002)]
    stock = prism('walnut_stock', [(-.089, .08, 1), (-.133, .068), (-.171, .045), (-.217, .055), (-.365, .039), (-.385, .026),
                   (-.385, -.114), (-.364, -.124), (-.232, -.071), (-.17, -.034), (-.114, .005), (-.089, .035, 1)], .049, 'walnut', bevel=.004, smooth=3)
    parts['body'] += [stock]
    parts['body'] += [prism('stock_collar', [(-.095, .08), (-.107, .077), (-.107, .002), (-.095, .011)], .051, 'blued', bevel=.002)]
    parts['body'] += [prism('buttpad', [(-.385, .029), (-.402, .024), (-.402, -.114), (-.385, -.122)], .052, 'rubber', bevel=.004)]
    # Thick wooden handguard with real cooling slots and thin dark end caps.
    handguard = prism('walnut_handguard', [(.154, .04), (.406, .04), (.421, .048), (.419, .095), (.402, .103), (.161, .103)],
                      .055, 'walnut', bevel=.003, smooth=1, raw=True)
    cut(handguard, cutter_cyl((0, .14, bore), (0, .44, bore), .017, sides=20))
    cut(handguard, join([cutter_box((0, .192 + i * .051, .091), (.07, .032, .008)) for i in range(4)], 'cooling_slots'))
    L.cross_sections(handguard, 1, [.18, .23, .265, .30, .34])
    # Keep the painted front broad while giving short digits a rear grip waist.
    for vertex in handguard.data.vertices:
        waist = min(1., max(0., (.34 - vertex.co.y) / .075))
        vertex.co.x *= 1. - .42 * waist
        far_side = min(1., max(0., vertex.co.x / .016))
        vertex.co.z = bore + (vertex.co.z - bore) * (1. - (.52 - .16 * far_side) * waist)
    cut(handguard, cutter_cyl((0, .14, bore), (0, .35, bore), .0135, sides=24))
    parts['body'] += [complete(handguard)]
    for y in (.156, .414):
        band = tube('handguard_band', (0, y, bore), (0, y + .009, bore), .031, .018, 'blued', sides=8)
        if y < .2:
            for vertex in band.data.vertices:
                vertex.co.x *= .58
                vertex.co.z = bore + (vertex.co.z - bore) * .48
        parts['body'] += [band]
    parts['body'] += [cyl('barrel', (0, .147, bore), (0, .635, bore), .0125, 'blued', sides=24)]
    parts['body'] += [cyl('gas_tube', (0, .408, .094), (0, .546, .094), .0065, 'blued', sides=16)]
    hider = tube('slotted_flash_hider', (0, .615, bore), (0, .675, bore), .0175, .0075, 'blued', sides=24)
    cut(hider, join([cutter_box((math.cos(a) * .017, .65, bore + math.sin(a) * .017), (.008, .028, .008)) for a in [i * math.tau / 4 for i in range(4)]], 'slots'))
    parts['body'] += [hider]
    sight = prism('front_tower', [(.523, .07), (.551, .07), (.545, .133), (.536, .139), (.527, .126)], .014, 'blued', bevel=.0016, raw=True)
    cut(sight, cutter_prism([(.529, .083), (.546, .083), (.539, .119), (.533, .116)], .022))
    parts['body'] += [complete(sight)]
    parts['body'] += [box('front_post', (0, .54, .141), (.003, .006, .012), 'brass', .0006)]
    # Compact 3x optic with a broad tan eyecup, real tube bores and brass rings.
    parts['body'] += [box('optic_rail', (0, .018, .116), (.028, .19, .009), 'blued', .0015)]
    for i in range(12):
        parts['body'] += [box('rail_tooth', (0, -.06 + i * .014, .122), (.03, .007, .004), 'blued', .0006)]
    parts['body'] += [tube('scope_tube', (0, -.059, sz), (0, .095, sz), .022, .018, 'olive', sides=28)]
    parts['body'] += [lathe('objective', [(.022, 0), (.028, .025), (.028, .056), (.025, .06), (.022, .056), (.018, .025)], 'olive', p0=(0, .095, sz), sides=28)]
    parts['body'] += [lathe('ocular', [(.021, 0), (.027, .014), (.028, .033), (.031, .044), (.025, .047), (.022, .019)], 'tan', p0=(0, -.059, sz), axis=(0, -1, 0), sides=28)]
    for y, radius in ((-.064, .0245), (.128, .029)):
        parts['body'] += [tube('optic_band', (0, y, sz), (0, y + .01, sz), radius, radius - .004, 'brass', sides=24)]
    for y in (-.029, .061):
        parts['body'] += [box('ring_foot', (0, y, .132), (.03, .02, .022), 'blued', .0015)]
        parts['body'] += [tube('scope_ring', (0, y - .008, sz), (0, y + .008, sz), .0255, .0215, 'brass', sides=24)]
        for side in (-1, 1):
            parts['body'] += [cyl('ring_screw', (side * .015, y, .131), (side * .019, y, .131), .004, 'steel', sides=12, bevel=.0005)]
    parts['body'] += [cyl('glass_front', (0, .146, sz), (0, .148, sz), .0215, 'glass', sides=28, bevel=0)]
    parts['body'] += [cyl('glass_rear', (0, -.095, sz), (0, -.093, sz), .021, 'glass', sides=28, bevel=0)]
    parts['body'] += [cyl('turret_top', (0, .016, sz + .019), (0, .016, sz + .039), .0115, 'brass', sides=20, bevel=.001)]
    parts['body'] += [cyl('turret_side', (.019, .016, sz), (.037, .016, sz), .012, 'brass', sides=20, bevel=.001)]
    for i in range(12):
        a = i * math.tau / 12
        parts['body'] += [cyl('turret_knurl', (math.cos(a) * .0115, .016 + math.sin(a) * .0115, sz + .029),
                             (math.cos(a) * .0115, .016 + math.sin(a) * .0115, sz + .039), .0009, 'dark', sides=6, bevel=0)]
    # Right-side charging handle. The firing paw works it while support stays on the forend.
    parts['charge'] += [cyl('charging_stem', (.017, .061, .074), (.045, .059, .074), .005, 'steel', sides=14)]
    parts['charge'] += [cyl('charging_knob', (.044, .053, .074), (.044, .065, .074), .009, 'blued', sides=16)]
    front, rear, axis = stanag(top=(.081, .022), length=.134, half=.031, lean=3, bend=14)
    parts['mag'] += [prism('curved_mag', rear + list(reversed(front)), .029, 'blued', bevel=.002)]
    end, a = axis[-1]
    parts['mag'] += [prism('mag_floor', [(end.x - .036, end.y - .002), (end.x + .036, end.y - .002), (end.x + .036, end.y - .013), (end.x - .036, end.y - .013)], .035, 'gunmetal', bevel=.0015)]
    for side in (-1, 1):
        for off in (-.016, .008):
            pts = [(side * .0153, q.x + math.cos(a) * off, q.y + math.sin(a) * off) for q, a in axis[3:-1]]
            parts['mag'] += [sweep('mag_rib', pts, [.0013] * len(pts), 'gunmetal', sides=6, aspect=.7, up=(1, 0, 0))]
    parts['mag'] += [cyl('top_round', (0, .052, .026), (0, .103, .026), .0048, 'brass', sides=12, bevel=.0005)]
    # Sling follows the lower silhouette and stays outside the hand and magazine travel.
    for y, z in ((-.327, -.099), (.41, .039)):
        parts['body'] += [tube('sling_loop', (-.008, y, z), (.008, y, z), .012, .008, 'brass', sides=16, bevel=.0007)]
    anchors = [Vector(p) for p in [(0, -.327, -.105), (.052, -.244, -.190), (.08, -.07, -.210), (.08, .13, -.190), (.052, .307, -.1), (0, .41, .033)]]
    strap = []
    for i in range(len(anchors) - 1):
        a, b, c, d = anchors[max(0, i - 1)], anchors[i], anchors[i + 1], anchors[min(len(anchors) - 1, i + 2)]
        for step in range(6):
            t = step / 6
            strap.append((2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t) * .5)
    strap.append(anchors[-1])
    # The broad leather face hangs vertically; its thin edge faces the ground.
    parts['body'] += [sweep('leather_sling', strap, [.012] * len(strap), 'leather', sides=8, aspect=.16, up=(1, 0, 0))]
    for edge in (-1, 1):
        seam = []
        for i, point in enumerate(strap):
            tangent = (strap[min(i + 1, len(strap) - 1)] - strap[max(0, i - 1)]).normalized()
            wide = tangent.cross(Vector((1, 0, 0))).normalized()
            seam.append(point + wide * (edge * .0095) + Vector((-.002, 0, 0)))
        parts['body'] += [sweep('sling_seam', seam, [.00065] * len(seam), 'rope', sides=4)]
    centre = anchors[-2] + Vector((-.003, 0, 0))
    tangent = (anchors[-1] - anchors[-3]).normalized()
    wide = tangent.cross(Vector((1, 0, 0))).normalized()
    corners = [centre + tangent * along + wide * across for along, across in [(-.019, -.016), (.019, -.016), (.019, .016), (-.019, .016)]]
    for i in range(4):
        parts['body'] += [cyl('sling_buckle', corners[i], corners[(i + 1) % 4], .0023, 'brass', sides=10, bevel=.0003)]
    parts['body'] += [cyl('buckle_pin', centre - wide * .016, centre + wide * .016, .0015, 'brass', sides=8, bevel=.0003)]
    sockets = {'muzzle': (0, .68, bore), 'eject': (.026, .055, .074), 'sight': (0, -.106, sz)}
    pivots = {'mag': (0, .081, .022), 'charge': (.023, .061, .074), 'trigger': (0, .004, .006)}
    # Keep the trigger within a short digit's reach from the backstrap.
    for obj in parts['trigger']:
        obj.data.transform(Matrix.Translation((0, -.022, 0)))
    pivots['trigger'] = (0, -.018, .006)
    return parts, sockets, pivots, {'magAxis': [0, .052, -.999]}


# ------------------------------------------------------------------ sniper
@weapon
def sniper():
    """Precision rifle: carved thumbhole walnut, blued flutes and brass optic hardware."""
    parts = {'body': [], 'bolt': [], 'mag': [], 'trigger': []}
    bore, sz = .074, .151
    receiver = cyl('receiver', (0, -.085, bore), (0, .191, bore), .023, 'blued', sides=28)
    cut(receiver, cutter_box((.018, .037, .083), (.024, .086, .025)))
    parts['body'] += [receiver]
    stock = prism('thumbhole_walnut', [(-.082, .059, 1), (-.134, .027), (-.202, .004), (-.245, .035), (-.395, .031), (-.414, .017),
                   (-.414, -.127), (-.398, -.142), (-.27, -.092), (-.174, -.065), (-.111, -.125), (-.064, -.119),
                   (-.022, -.027), (.058, .004), (.176, .009), (.414, .027), (.437, .037), (.425, .058), (.19, .056), (.153, .06)],
                  .058, 'walnut', bevel=.007, smooth=2, raw=True)
    # The thumb window reaches the backstrap so a paw can wrap the grip.
    cut(stock, cutter_prism([(-.137 + .041 * math.cos(a), -.048 + .057 * math.sin(a)) for a in [i * math.tau / 28 for i in range(28)]], .072))
    # The short paw sits higher than a human wrist. A right-side relief keeps
    # the lower thumbhole bridge clear without losing the left stock silhouette.
    cut(stock, cutter_prism([(-.137 + .043 * math.cos(a), -.063 + .067 * math.sin(a))
                            for a in [i * math.tau / 28 for i in range(28)]], .04, x=.028))
    cut(stock, cutter_box((0, .02, .066), (.04, .23, .045)))
    cut(stock, cutter_box((0, .107, .016), (.034, .074, .049)))
    L.cross_sections(stock, 1, [-.16, -.11, -.06, -.02, .18, .23, .265, .285, .32, .35])
    # Carve the grip waist independently of the broad cheek and shoulder stock.
    for vertex in stock.data.vertices:
        y, z = vertex.co.y, vertex.co.z
        waist = min(1., max(0., (y + .16) / .05), max(0., (.045 - y) / .055))
        waist *= min(1., max(0., (.06 - z) / .025))
        grip_taper = min(1., max(0., (z + .10) / .045))
        vertex.co.x *= 1. - (.40 + .22 * grip_taper) * waist
        vertex.co.y -= (y + .022) * .52 * waist
        # A narrow rear fore-end lets the support fingers reach underneath.
        support = min(1., max(0., (y - .15) / .03), max(0., (.35 - y) / .065))
        vertex.co.x *= 1. - .40 * support
        far_side = min(1., max(0., vertex.co.x / .017))
        vertex.co.z = bore + (vertex.co.z - bore) * (1. - (.60 - .30 * far_side) * support)
    cut(stock, cutter_cyl((0, .19, bore), (0, .35, bore), .0148, sides=24))
    parts['body'] += [complete(stock)]
    parts['body'] += [prism('cheek_rest', [(-.372, .034), (-.258, .035), (-.25, .049), (-.255, .065), (-.379, .061), (-.384, .052)], .043, 'dark', bevel=.004, smooth=1)]
    parts['body'] += [prism('brass_butt_spacer', [(-.409, .022), (-.42, .018), (-.42, -.133), (-.409, -.138)], .051, 'brass', bevel=.002)]
    parts['body'] += [prism('butt_pad', [(-.42, .018), (-.438, .012), (-.438, -.126), (-.43, -.138), (-.42, -.135)], .053, 'rubber', bevel=.005)]
    for side in (-1, 1):
        panel = prism('grip_checkering', [(-.054, -.035), (-.024, -.029), (-.067, -.108), (-.1, -.112), (-.092, -.087)], .0015, 'wood_dark', x=side * .0182, bevel=.0005)
        parts['body'] += [panel]
        for y, z in ((-.365, .046), (-.268, .047), (.176, .031), (.36, .04), (-.303, -.006)):
            support = min(1., max(0., (y - .15) / .03), max(0., (.35 - y) / .065))
            width = 1. - .40 * support
            height = bore + (z - bore) * (1. - .60 * support)
            parts['body'] += [cyl('stock_screw', (side * .024 * width, y, height), (side * .026 * width, y, height), .005, 'brass', sides=16, bevel=.0006)]
            parts['body'] += [box('screw_slot', (side * .0262 * width, y, height), (.0006, .006, .0009), 'dark', .0002)]
        for i in range(6):
            parts['body'] += [sweep('checkering', [(side * .0186, -.048 - i * .006, -.045), (side * .0186, -.08 - i * .003, -.094)], [.0007] * 2, 'walnut', sides=5)]
    for obj in parts['body']:
        if obj.name.split('.')[0] in ('grip_checkering', 'checkering'):
            for vertex in obj.data.vertices:
                grip_taper = min(1., max(0., (vertex.co.z + .10) / .045))
                vertex.co.x *= (.60 - .22 * grip_taper) / .60
                vertex.co.y = .48 * vertex.co.y - .01144
    barrel = lathe('fluted_barrel', [(.019, 0), (.014, .025), (.014, .14), (.017, .2), (.016, .52), (.015, .585)], 'blued', p0=(0, .181, bore), sides=28)
    # Long rounded flutes end before the brass muzzle collar.
    for a in [i * math.tau / 6 for i in range(6)]:
        x, z = math.cos(a) * .0192, bore + math.sin(a) * .0192
        cut(barrel, cutter_cyl((x, .26, z), (x, .713, z), .0053, sides=12))
    parts['body'] += [barrel]
    parts['body'] += [tube('muzzle_collar', (0, .738, bore), (0, .755, bore), .02, .013, 'brass', sides=24)]
    brake = tube('three_port_brake', (0, .754, bore), (0, .832, bore), .023, .008, 'blued', sides=24)
    cut(brake, join([cutter_box((0, .772 + i * .022, bore), (.058, .012, .028)) for i in range(3)], 'brake_ports'))
    parts['body'] += [brake]
    parts['body'] += [box('scope_rail', (0, .031, .104), (.027, .225, .008), 'dark', .0015)]
    for i in range(15):
        parts['body'] += [box('rail_tooth', (0, -.068 + i * .014, .11), (.029, .007, .004), 'blued', .0006)]
    # Open scope bores, inset blue glass, mounting feet, brass bands and knurled turrets.
    parts['body'] += [tube('scope_tube', (0, -.056, sz), (0, .184, sz), .022, .018, 'blued', sides=28)]
    parts['body'] += [lathe('scope_objective', [(.022, 0), (.037, .055), (.037, .111), (.033, .116), (.03, .111), (.03, .058), (.018, 0)], 'blued', p0=(0, .184, sz), sides=32)]
    parts['body'] += [lathe('scope_ocular', [(.022, 0), (.03, .017), (.03, .061), (.027, .066), (.023, .061), (.023, .019), (.018, 0)], 'blued', p0=(0, -.056, sz), axis=(0, -1, 0), sides=28)]
    for y, radius in ((-.112, .031), (.286, .038)):
        parts['body'] += [tube('scope_brass_ring', (0, y, sz), (0, y + .012, sz), radius, radius - .005, 'brass', sides=28, bevel=.001)]
    for y in (-.018, .132):
        parts['body'] += [box('scope_foot', (0, y, .119), (.032, .022, .022), 'blued', .002)]
        parts['body'] += [tube('scope_mount', (0, y - .009, sz), (0, y + .009, sz), .026, .021, 'brass', sides=24)]
        for side in (-1, 1):
            parts['body'] += [cyl('mount_bolt', (side * .015, y, .119), (side * .019, y, .119), .0047, 'steel', sides=12, bevel=.0005)]
    parts['body'] += [cyl('objective_glass', (0, .286, sz), (0, .288, sz), .0298, 'glass', sides=28, bevel=0)]
    parts['body'] += [cyl('ocular_glass', (0, -.113, sz), (0, -.111, sz), .0228, 'glass', sides=28, bevel=0)]
    for start, end in [((0, .06, sz + .018), (0, .06, sz + .044)), ((.018, .06, sz), (.041, .06, sz))]:
        parts['body'] += [cyl('turret', start, end, .0145, 'brass', sides=20, bevel=.001)]
    for i in range(16):
        a = i * math.tau / 16
        parts['body'] += [cyl('turret_knurl', (math.cos(a) * .0145, .06 + math.sin(a) * .0145, sz + .032),
                             (math.cos(a) * .0145, .06 + math.sin(a) * .0145, sz + .043), .001, 'dark', sides=6, bevel=0)]
    # Raised flip caps repeat the two circles in the reference without covering the eye.
    for y, radius in ((-.118, .028), (.30, .035)):
        parts['body'] += [cyl('cap_hinge', (-.012, y, sz + radius), (.012, y, sz + radius), .004, 'brass', sides=12)]
        parts['body'] += [cyl('flip_cap', (0, y + .012, sz + radius * 1.75), (0, y + .016, sz + radius * 1.75), radius * .93, 'dark', sides=24, bevel=.001)]
    # Folded bipod with distinct hinges, telescoping legs, brass collars and feet.
    parts['body'] += [box('bipod_mount', (0, .359, .021), (.037, .036, .019), 'dark', .002)]
    for side in (-1, 1):
        parts['body'] += [cyl('bipod_hinge', (side * .012, .36, .012), (side * .029, .36, .012), .01, 'brass', sides=16)]
        parts['body'] += [cyl('folded_leg', (side * .025, .35, .005), (side * .025, .55, .012), .008, 'blued', sides=14)]
        parts['body'] += [cyl('bipod_collar', (side * .025, .496, .01), (side * .025, .51, .011), .0095, 'brass', sides=14)]
        parts['body'] += [cyl('bipod_foot', (side * .025, .542, .012), (side * .025, .558, .012), .012, 'rubber', sides=16)]
    parts['bolt'] += [cyl('bolt_body', (0, -.104, bore), (0, .071, bore), .014, 'steel', sides=24)]
    parts['bolt'] += [cyl('bolt_shroud', (0, -.108, bore), (0, -.073, bore), .019, 'blued', sides=20)]
    parts['bolt'] += [cyl('bolt_arm', (.014, -.061, bore), (.05, -.074, .047), .006, 'blued', sides=14)]
    parts['bolt'] += [sphere('bolt_knob', (.058, -.077, .042), (.014, .014, .014), 'blued', 20, 12)]
    guard = prism('guard', [(-.025, .012), (.062, .012), (.063, -.022), (.047, -.049), (-.013, -.049), (-.031, -.031)], .018, 'blued', bevel=.002, raw=True, smooth=1)
    cut(guard, cutter_prism([(-.019, .004), (.05, .004), (.049, -.021), (.038, -.038), (-.009, -.038), (-.02, -.026)], .034))
    parts['body'] += [complete(guard)]
    parts['trigger'] += [prism('trigger', [(.001, .006), (.009, .006), (.008, -.01), (-.001, -.029), (-.008, -.03), (-.002, -.01)], .007, 'steel', bevel=.001, smooth=1)]
    parts['trigger'] += [box('trigger_pad', (.006, .003, -.021), (.025, .01, .014), 'brass', .002)]
    parts['mag'] += [prism('box_magazine', [(.071, .023), (.145, .023), (.145, -.072), (.135, -.079), (.074, -.079)], .033, 'blued', bevel=.002)]
    parts['mag'] += [box('mag_floor', (0, .108, -.078), (.039, .083, .009), 'gunmetal', .0015)]
    for side in (-1, 1):
        for y in (.083, .106, .13):
            parts['mag'] += [box('mag_flute', (side * .017, y, -.035), (.0017, .004, .057), 'gunmetal', .0007)]
    parts['mag'] += [cyl('top_round', (0, .079, .025), (0, .139, .025), .005, 'brass', sides=12, bevel=.0005)]
    sockets = {'muzzle': (0, .837, bore), 'eject': (.027, .03, .085), 'sight': (0, -.122, sz)}
    pivots = {'bolt': (0, -.061, bore), 'mag': (0, .108, .023), 'trigger': (0, .005, .006)}
    return parts, sockets, pivots, {'magAxis': [0, 0, -1]}


# ------------------------------------------------------------------ machete
@weapon
def machete():
    """Facão: broad Brazilian machete, dark carbon steel with a polished edge, wooden scales."""
    parts = {'body': []}
    spine = [(.055, .016, 1), (.2, .02), (.36, .026), (.46, .032), (.52, .03), (.545, .016)]
    edge = [(.54, -.004), (.51, -.03), (.44, -.042), (.3, -.036), (.12, -.026), (.055, -.018, 1)]
    blade = prism('blade_body', spine + [(.53, .0), (.44, -.016), (.3, -.014), (.12, -.01), (.055, -.006, 1)], .0055, 'gunmetal', bevel=.0012, smooth=2)
    edge_band = prism('blade_edge', [(.055, -.004, 1), (.12, -.008), (.3, -.012), (.44, -.014), (.535, .004)] + edge[1:], .0035, 'blade', bevel=.0008, smooth=2)
    parts['body'] += [blade, edge_band]
    parts['body'] += [prism('bolster', [(.04, .022, 1), (.062, .022, 1), (.062, -.026, 1), (.04, -.026, 1)], .02, 'brass', bevel=.002)]
    parts['body'] += [prism('handle', [(-.085, .014), (-.07, .02), (.04, .018, 1), (.04, -.022, 1), (-.07, -.024), (-.09, -.018), (-.098, -.004)],
                            .026, 'wood', bevel=.003, smooth=2)]
    for y in (-.06, -.015, .025):
        parts['body'] += [cyl('rivet', (-.0145, y, -.002), (.0145, y, -.002), .0045, 'brass', sides=14, bevel=.0008)]
    parts['body'] += [lathe('lanyard_ring', [(.008, 0), (.011, .002), (.011, .004), (.008, .006)], 'steel', p0=(0, -.094, -.008), axis=(1, 0, 0), sides=16)]
    parts['body'] += [sweep('lanyard', [(0, -.095, -.012), (.004, -.11, -.03), (-.004, -.118, -.05), (0, -.11, -.068)], [.0035] * 4, 'leather', sides=8)]
    sockets = {'muzzle': (0, .545, .01), 'eject': (0, 0, 0), 'sight': (0, 0, .06)}
    return parts, sockets, {}, {}


# Painted liveries (arsenal_lib.apply_livery): stencilled motifs per weapon,
# projected onto the baked albedo and chipped with the paint.
LIVERY = {
    'm4': [
        {'stencil': 'frond', 'at': (.258, .064), 'size': .115, 'rotate': -16, 'colour': 'E27A5A', 'on': ('navy',)},
        {'stencil': 'frond', 'at': (.318, .060), 'size': .085, 'rotate': 14, 'colour': 'F0A07A', 'on': ('navy',), 'opacity': .8},
    ],
    'shotgun': [
        {'stencil': 'monstera', 'at': (-.296, -.035), 'size': .153, 'rotate': -12, 'colour': '268B84', 'on': ('walnut',)},
        {'stencil': 'frond', 'at': (.335, .039), 'size': .088, 'rotate': -14, 'colour': '299A90', 'on': ('walnut',)},
        {'stencil': 'palm', 'at': (.114, .066), 'size': .063, 'colour': 'D6A348', 'on': ('blued',), 'metal': True},
    ],
    'sniper': [
        {'stencil': 'monstera', 'at': (-.327, -.05), 'size': .15, 'rotate': 10, 'colour': '278980', 'on': ('walnut',)},
        {'stencil': 'monstera', 'at': (.056, .027), 'size': .125, 'rotate': -18, 'colour': '29948A', 'on': ('walnut',)},
    ],
    'dmr': [
        {'stencil': 'frond', 'at': (-.296, -.034), 'size': .18, 'rotate': -18, 'colour': 'DF805F', 'on': ('walnut',)},
        {'stencil': 'frond', 'at': (.235, .066), 'size': .125, 'rotate': 14, 'colour': 'E58865', 'on': ('walnut',)},
        {'stencil': 'frond', 'at': (.287, .057), 'size': .10, 'rotate': -18, 'colour': '3D8374', 'on': ('walnut',)},
    ],
    'coco': [
        {'bands': (.23, .05), 'at': (.05, .112), 'size': 1, 'rotate': 28, 'colour': '367443', 'on': ('yellow',), 'wrap': True, 'depth': (-.049, .049)},
        {'stencil': 'frond', 'at': (.165, .213), 'size': .16, 'rotate': -12, 'colour': '407B3D', 'on': ('yellow',), 'depth': (-.08, -.052)},
        {'stencil': 'frond', 'at': (.165, .213), 'size': .16, 'rotate': -12, 'colour': '407B3D', 'on': ('yellow',), 'depth': (.052, .08)},
        {'stencil': 'parrot', 'at': (.08, .15), 'size': .23, 'colour': '197C9B', 'on': ('yellow',), 'depth': (-.08, -.052)},
        {'stencil': 'parrot', 'at': (.08, .15), 'size': .23, 'colour': '197C9B', 'on': ('yellow',), 'depth': (.052, .08)},
        {'bands': (.22, .052), 'at': (-.30, -.02), 'size': 1, 'rotate': 28, 'colour': '3D7040', 'on': ('walnut',)},
        {'stencil': 'frond', 'at': (-.339, -.025), 'size': .143, 'rotate': 14, 'colour': '729143', 'on': ('walnut',)},
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
    albedo, orm = L.bake_weapon(meshes, weapon_id, size=size, edge_radius=.0025 if weapon_id == 'm4' else .005,
                                livery=LIVERY.get(weapon_id, ()))
    albedo_img = L.save_png(f'{weapon_id}_albedo', albedo)
    orm_img = L.save_png(f'{weapon_id}_orm', orm, srgb=False)
    normal_img = L.bake_relief(meshes, weapon_id, 1024) if weapon_id == 'm4' else None
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
