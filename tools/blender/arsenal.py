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
@weapon
def m4():
    """Island carbine: worn receivers, navy handguard, rubber furniture, open irons."""
    parts = {'body': [], 'mag': [], 'charge': [], 'trigger': [], 'bolt': [], 'release': []}
    bore = .064
    lower = prism('lower', [(-.072, .045, 1), (.128, .045, 1), (.128, .016), (.108, -.01), (.032, -.01), (.022, .004), (-.02, .006), (-.072, .018)],
                  .036, 'wornsteel', bevel=.0025, smooth=1, raw=True)
    parts['body'] += [complete(lower)]
    well = prism('magwell', [(.03, -.004, 1), (.112, -.004, 1), (.108, -.03), (.036, -.03)], .034, 'dark', bevel=.0025, raw=True)
    cut(well, cutter_box((0, .071, -.02), (.028, .066, .03)))
    parts['body'] += [complete(well)]
    upper = prism('upper', [(-.076, .045, 1), (.136, .045, 1), (.136, .086), (.13, .092), (-.07, .092), (-.076, .086)], .034, 'wornsteel', bevel=.002, smooth=1, raw=True)
    cut(upper, cutter_box((.017, .06, .062), (.012, .05, .016)))
    parts['body'] += [complete(upper)]
    rail = box('rail', (0, .03, .097), (.024, .205, .01), 'dark', .0015, raw=True)
    cut(rail, join([cutter_box((0, -.066 + i * .0105, .101), (.03, .0045, .005)) for i in range(19)], 'rail_slots'))
    parts['body'] += [complete(rail)]
    parts['body'] += [box('dust_cover', (.0172, .06, .052), (.002, .05, .012), 'gunmetal', .001)]
    parts['body'] += [cyl('forward_assist', (.02, -.02, .075), (.028, -.028, .08), .0065, 'gunmetal', sides=16)]
    parts['release'] += [prism('bolt_release', [(-.005, .025), (.025, .025), (.022, .038), (-.002, .036)], .004, 'gunmetal', x=-.019, bevel=.001)]
    parts['body'] += [cyl('mag_release', (.018, .045, .01), (.022, .045, .01), .005, 'gunmetal', sides=14)]
    parts['body'] += [cyl('buffer', (0, -.075, .066), (0, -.24, .066), .0165, 'dark', sides=24)]
    stock = prism('stock', [(-.14, .082, 1), (-.3, .074), (-.312, .066), (-.312, -.03), (-.29, -.044), (-.235, -.01), (-.17, .03), (-.14, .046)],
                  .046, 'polymer', bevel=.003, smooth=2, raw=True)
    cut(stock, cutter_prism([(-.2, .03), (-.27, .012), (-.285, -.012), (-.26, -.01), (-.21, .014)], .06))
    parts['body'] += [complete(stock)]
    parts['body'] += [prism('buttpad', [(-.31, .07), (-.322, .07), (-.322, -.034), (-.31, -.034)], .046, 'rubber', bevel=.004, smooth=0)]
    grip = prism('grip', [(-.006, .012, 1), (.03, .012, 1), (.029, -.004), (.02, -.034), (.012, -.07), (.004, -.098), (-.03, -.104), (-.042, -.09),
                          (-.034, -.052), (-.026, -.02), (-.028, .0)], .031, 'polymer', bevel=.003, smooth=3)
    parts['body'] += [grip]
    move(grip, (0, -.064, 0))
    guard = prism('guard', [(-.044, .005, 1), (.027, .005, 1), (.027, -.027), (.019, -.043), (-.040, -.043)], .020, 'wornsteel', bevel=.002, raw=True)
    cut(guard, cutter_box((0, -.008, -.018), (.04, .053, .033)))
    parts['body'] += [complete(guard)]
    # Octagonal handguard with slots, barrel, gas block and a bird-cage flash hider.
    hand = lathe('handguard', [(.029, 0), (.031, .006), (.031, .235), (.029, .24)], 'navy', p0=(0, .136, bore), sides=8)
    hand.data.transform(Matrix.Translation((0, 0, bore)) @ Matrix.Rotation(math.radians(0), 4, 'Y') @ Matrix.Translation((0, 0, -bore)))
    slots = join([cutter_box((s * .03, .17 + i * .045, bore), (.012, .026, .009)) for s in (-1, 1) for i in range(4)] +
                 [cutter_box((0, .17 + i * .045, bore - .03), (.009, .026, .012)) for i in range(4)], 'slots')
    cut(hand, slots)
    L.finish(hand, 'navy', bevel=.0012, segments=3)
    parts['body'] += [hand]
    parts['body'] += [prism('handguard_pad', [(.163, .039), (.342, .039), (.352, .033), (.34, .024), (.179, .024), (.16, .029)], .039, 'rubber', bevel=.002, radius=.004)]
    parts['body'] += [cyl('barrel', (0, .37, bore), (0, .47, bore), .0095, 'gunmetal', sides=20)]
    parts['body'] += [box('gas_block', (0, .39, bore + .003), (.024, .018, .03), 'dark', .002)]
    cage = tube('flash_hider', (0, .465, bore), (0, .522, bore), .0135, .0075, 'dark')
    cut(cage, join([cutter_box((math.cos(a) * .014, .5, bore + math.sin(a) * .014), (.008, .03, .008)) for a in [i * math.tau / 5 for i in range(5)]], 'cage'))
    parts['body'] += [cage]
    parts['body'] += [box('handguard_rail', (0, .255, .097), (.022, .21, .008), 'dark', .0015)]
    # Open rear notch: preserve peripheral vision instead of a thick optic tube.
    parts['body'] += [box('rear_base', (0, -.055, .105), (.03, .021, .010), 'dark', .0015)]
    for s in (-1, 1):
        parts['body'] += [box('rear_ear', (s * .009, -.055, .119), (.005, .009, .025), 'dark', .0012)]
        parts['body'] += [cyl('rear_pin', (s * .014, -.055, .111), (s * .017, -.055, .111), .005, 'brass', sides=16, bevel=.0006)]
    parts['body'] += [box('rear_notch_floor', (0, -.055, .114), (.018, .009, .003), 'dark', .0007)]
    parts['body'] += [box('front_base', (0, .352, .100), (.025, .018, .010), 'dark', .0015)]
    parts['body'] += [box('front_post', (0, .352, .1135), (.0024, .004, .023), 'dark', .0004)]
    parts['body'] += [sphere('front_bead', (0, .3495, .125), (.0018, .0018, .0018), 'brass', 12, 8)]
    for s in (-1, 1):
        parts['body'] += [prism('front_ear', [(.343, .101), (.360, .101), (.358, .130), (.349, .130)], .003, 'dark', x=s * .012, bevel=.001)]
    # Receiver seams, captive screws and inset grip surfaces provide readable scale.
    for s in (-1, 1):
        inset = prism('grip_inset', [(-.019, -.020), (.014, -.027), (-.001, -.086), (-.027, -.083)], .0018, 'rubber', x=s * .016, bevel=.0006, radius=.004)
        move(inset, (0, -.064, 0)); parts['body'] += [inset]
        for row in range(5):
            parts['body'] += [prism('grip_ridge', [(-.086 - row*.002, -.035 - row*.010), (-.055-row*.002, -.035-row*.010), (-.056-row*.002, -.037-row*.010), (-.087-row*.002, -.037-row*.010)], .0014, 'polymer', x=s*.017, bevel=.0004)]
        for y, z in [(-.058, .031), (.110, .024), (.143, .063), (.365, .063)]:
            parts['body'] += [cyl('pin_seat', (s * .018, y, z), (s * .020, y, z), .0053, 'dark', sides=16, bevel=.0005)]
            parts['body'] += [cyl('pin', (s * .020, y, z), (s * .021, y, z), .0035, 'brass', sides=16, bevel=.0004)]
        parts['body'] += [prism('receiver_seam', [(-.062, .046), (.121, .046), (.121, .048), (-.062, .048)], .001, 'steel', x=s * .018, bevel=.0003)]
        parts['body'] += [prism('selector', [(-.033, .018), (-.035, .029), (-.024, .032), (-.01, .022), (-.015, .017)], .003, 'gunmetal', x=s * .020, bevel=.0007)]
        # Small teal stock inlay carries the existing rarity accent, away from the sights.
        parts['body'] += [prism('stock_inlay', [(-.274, .023), (-.245, .033), (-.234, .029), (-.263, .020)], .001, 'teal', x=s * .024, bevel=.0004)]
    parts['body'] += [prism('cheek_pad', [(-.295, .073), (-.178, .080), (-.19, .090), (-.285, .090)], .048, 'rubber', bevel=.003, radius=.003)]
    # Small coral branch emblem, readable against the navy painted handguard.
    for side in (-1, 1):
        for y1, z1, y2, z2 in [(.15, .049, .15, .079), (.15, .060, .143, .069), (.15, .066, .158, .075)]:
            parts['body'] += [cyl('coral_mark', (side * .0313, y1, z1), (side * .0313, y2, z2), .00115, 'coral', sides=8, bevel=0)]
    # Charging handle (animated) and a visible bolt face in the port.
    parts['charge'] += [prism('charging_handle', [(-.082, .082), (-.066, .082), (-.066, .09), (-.082, .09)], .036, 'gunmetal', bevel=.0015)]
    parts['bolt'] += [box('bolt_carrier', (.012, .062, .062), (.008, .046, .012), 'steel', .0015)]
    trig = prism('trigger', [(-.005, .005, 1), (.003, .005, 1), (.005, -.006), (.002, -.017), (-.006, -.031), (-.012, -.032), (-.007, -.019), (-.004, -.007)], .007, 'steel', bevel=.0012, smooth=2)
    parts['trigger'] += [trig]
    mag = prism('mag', [(.034, .02, 1), (.108, .02, 1), (.111, -.05), (.119, -.11), (.132, -.17), (.136, -.182, 1), (.09, -.192, 1), (.083, -.14),
                        (.068, -.085), (.052, -.035)], .027, 'dark', bevel=.0025, smooth=2)
    plate = prism('mag_plate', [(.086, -.188), (.14, -.178), (.142, -.19), (.088, -.2)], .031, 'gunmetal', bevel=.002, smooth=0)
    ribs = [prism('mag_rib', [(.047+i*.015, -.024), (.052+i*.015, -.024), (.063+i*.015, -.091), (.106+i*.008, -.175), (.102+i*.008, -.176), (.059+i*.015, -.094)],
                  .0018, 'gunmetal', x=s*.014, bevel=.0006) for s in (-1, 1) for i in range(3)]
    parts['mag'] += [join([mag, plate] + ribs, 'mag')]
    sockets = {'muzzle': (0, .527, bore), 'eject': (.022, .062, .062), 'sight': (0, -.055, .125)}
    pivots = {'mag': (0, .071, .02), 'charge': (0, -.074, .086), 'bolt': (0, .062, .062), 'trigger': (0, -.001, .004), 'release': (-.019, .01, .026)}
    return parts, sockets, pivots, {'magAxis': [0, .12, -1]}


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


# ------------------------------------------------------------------ slingshot
@weapon
def slingshot():
    """Estilingão: guava-branch fork, inner-tube wrap, orange tubing, leather pouch and a pebble."""
    parts = {'body': [], 'pouch': []}
    parts['body'] += [sweep('handle', [(0, 0, -.1), (0, .002, -.05), (0, .004, .0), (0, .004, .03)], [.017, .018, .018, .02], 'wood', sides=16)]
    for side in (-1, 1):
        parts['body'] += [sweep('arm', [(0, .004, .028), (side * .022, .004, .06), (side * .042, .0, .1), (side * .048, -.004, .13)],
                                [.017, .014, .012, .011], 'wood', sides=14)]
        parts['body'] += [lathe('tip_wrap', [(.0125, 0), (.0135, .002), (.0135, .012), (.0125, .014)], 'rubber', p0=(side * .046, -.003, .112), axis=(0, 0, 1), sides=16)]
    for i in range(5):
        parts['body'] += [lathe('wrap', [(.0185, 0), (.0195, .002), (.0195, .01), (.0185, .012)], 'rubber', p0=(0, .002, -.085 + i * .016), axis=(0, 0, 1), sides=18)]
    parts['body'] += [sphere('knot', (0, .002, -.106), (.014, .014, .012), 'wood_dark', 14, 10)]
    parts['pouch'] += [sweep('pouch', [(-.022, 0, 0), (-.01, -.006, 0), (.01, -.006, 0), (.022, 0, 0)], [.006, .01, .01, .006], 'leather', sides=10, aspect=.45, up=(0, 1, 0))]
    parts['pouch'] += [sphere('pebble', (0, .004, 0), (.013, .012, .012), 'stone', 16, 12)]
    sockets = {'muzzle': (0, .02, .13), 'eject': (0, 0, 0), 'sight': (0, -.02, .135), 'tip_l': (-.048, -.004, .128), 'tip_r': (.048, -.004, .128)}
    pivots = {'pouch': (0, 0, 0)}
    return parts, sockets, pivots, {}


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
    size = 2048 if weapon_id == 'm4' else 1024
    albedo, orm = L.bake_weapon(meshes, weapon_id, size=size, edge_radius=.0025 if weapon_id == 'm4' else .005)
    albedo_img = L.save_png(f'{weapon_id}_albedo', albedo)
    orm_img = L.save_png(f'{weapon_id}_orm', orm, srgb=False)
    normal_img = L.bake_relief(meshes, weapon_id, size) if weapon_id == 'm4' else None
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
