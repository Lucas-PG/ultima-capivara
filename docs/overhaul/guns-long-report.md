# Long-gun overhaul

Status: reopened after independent review. Models, livery, budgets and contact passed; support-paw anatomy, firing-paw visibility at hip and the Lança-coco sight picture require correction. The earlier completion claim was premature. The evidence below records that earlier pass until replaced by the corrected review.

Scope: `m4`, `shotgun`, `sniper`, `dmr`, `coco`, in the `guns-long` worktree. The sculpted arm assets and arm solver were not changed. Final gameplay captures use real Chrome with ANGLE Metal at 1280 x 720 and the medium preset. Baseline contact sheets retain the earlier 960 x 540 captures. No Playwright e2e suite was run.

## Asset budgets

| Weapon | FP triangles | Packed GLB bytes | World near triangles | World far triangles |
| --- | ---: | ---: | ---: | ---: |
| m4 | 22,130 | 726,996 | 2,400 | 418 |
| shotgun | 20,842 | 596,224 | 2,400 | 418 |
| sniper | 21,740 | 627,540 | 2,400 | 410 |
| dmr | 23,006 | 723,064 | 2,392 | 416 |
| coco | 24,466 | 821,120 | 2,374 | 406 |

All packed weapons remain below 25,000 triangles and 1.3 MB. M4 uses 2048 albedo and 1024 normal/ORM; the other weapons use 1024 maps. Third-person and ground models use near/far LODs and one 1024 atlas. The pistol, revolver, SMG and machete geometry and decoded atlas cells are unchanged from `9934dda`.

## M4

Preserved the navy, coral and brass model, livery and open rear notch. The packed asset now keeps authored, unscaled frames for its moving parts. Rebuilt the firing-paw wrap and fitted the support paw over the rear handguard. Raised the hip composition, authored a lower sprint carry and added a broadside inspect that exposes the receiver and furniture. Tactical reloads remove the curved magazine, seat the replacement with a palm push and return to support. Empty reloads add a part-driven bolt-catch slap. Magazine rotation and the carrying paw share the same frame.

Before: [M4 contact sheet](evidence/guns/m4-before.jpg). After: [gameplay views](evidence/guns/m4-after.jpg), [reload and mechanism views](evidence/guns/m4-reload.jpg).

Current review: support-grip anatomy and firing-paw visibility are not accepted yet. The prior contact results below do not establish visual acceptance. The tightest sampled contact is -0.4 mm during trigger movement, within the requested -0.5 mm tolerance.

## Doze

Rebuilt the receiver, vented rib, walnut stock and continuous ribbed pump, with brass hardware, teal foliage, red recoil pad and four-shell saddle. Slimmed the stock wrist for the paw and lengthened the action bars. The pump now stops ahead of the receiver throughout its travel. Opened the underside loading gate and moved the lifter above the shell path. Lowered the rear ramp after the gameplay view revealed that it blocked the front bead.

Reloads retain the authoritative 0.55-second shell segments, carry a visible red shell, lift it into the tube axis and push its case head with the thumb. A reload sequence that began empty adds one final pump after loading finishes; tactical loading leaves the chamber undisturbed.

Review correction in progress: replaced the flat side grip with an underhand pump wrap. The palm cups the pump, the fingers curl up its far side and the thumb points forward on the near side. Departure and return now pass below the pump. A full-vertex scan of 79 hip, ADS, sprint, inspect, firing and reload samples clears both paws by at least 0.1 mm; the pump stroke itself clears the support paw by 1.1 mm. [Measured support grip and scan summary](evidence/guns/shotgun-support-contact.json). Hip framing is still pending.

Before: [Doze contact sheet](evidence/guns/shotgun-before.jpg). After: [gameplay views](evidence/guns/shotgun-after.jpg), [reload and mechanism views](evidence/guns/shotgun-reload.jpg).

Current review: support-grip anatomy and firing-paw visibility are not accepted yet. The prior contact results below do not establish visual acceptance. The final empty pump is presentation state and remains interruptible by firing or switching weapons; authoritative shell timing is unchanged.

## Sniper

Rebuilt the carved walnut thumbhole stock, cheek rest, fluted barrel, three-port brake, folded bipod and brass-banded scope with turrets and flip caps. Shaped the grip waist and thumb window for the paw, with a right-side wrist relief that preserves the left stock silhouette. The firing paw follows the bolt knob through lift, pull, push and lock between shots. Tactical reloads replace only the magazine. Empty reloads open the bolt before the magazine work and close it after the support paw has returned. The choreography always retains one gripping paw.

Before: [Sniper contact sheet](evidence/guns/sniper-before.jpg). After: [gameplay views](evidence/guns/sniper-after.jpg), [reload and mechanism views](evidence/guns/sniper-reload.jpg).

Current review: support-grip anatomy and firing-paw visibility are not accepted yet. The prior contact results below do not establish visual acceptance. The tightest sampled contact is -0.1 mm during bolt extraction, within the requested tolerance.

## Carabina

Rebuilt the olive receiver, walnut furniture, cooling slots, curved magazine, side charging handle, brass/tan optic and hanging sling. Painted coral fronds and teal accents into the wood. The sling has a smooth leather curve, edge seams and a brass buckle. Its distant LOD preserves the lower outline while retaining the barrel and stock. Magazine swaps keep the support paw attached to the magazine. Empty reloads restore support before the firing paw operates the right-side charging handle.

Before: [Carabina contact sheet](evidence/guns/dmr-before.jpg). After: [gameplay views](evidence/guns/dmr-after.jpg), [reload and mechanism views](evidence/guns/dmr-reload.jpg).

Current review: support-grip anatomy and firing-paw visibility are not accepted yet. The prior contact results below do not establish visual acceptance. The sling is rigid authored geometry; its shape stays clear of the firing forearm throughout the reviewed motions.

## Lança-coco

Rebuilt the bamboo-yellow tube, flared wood/brass bell, sprung action, separate wooden pump and open painted hopper. A domed service cap closes the breech, and a larger parrot portrait reads on the hopper. Three independent fruits fill its visible pockets. The offset sight lane avoids the hopper; the front leaf now faces the eye. Reloads add exactly the missing fruits. An empty refill fills the hopper, racks one fruit into the chamber and tops up the freed pocket. Partial reloads preserve the chamber and skip the rack. The refill stays lower and farther from the eye so the complete carrying path stays in frame. This respects the game's four-round capacity; the generated three-fruit reference does not account for the chambered round.

Review correction: moved both sights and the aim point to a matching 170 mm left offset. The target now has open space beside the hopper, with no box or coconut over the aiming point. Rebuilt the first-person and world assets. [New ADS eye view](evidence/guns/coco-sight-review.jpg), 1280 x 720 medium, 174,260 bytes. Support grip, hip framing and motion review remain in progress.

Before: [Lança-coco contact sheet](evidence/guns/coco-before.jpg). After: [gameplay views](evidence/guns/coco-after.jpg), [reload and mechanism views](evidence/guns/coco-reload.jpg).

Current review: support-grip anatomy and firing-paw visibility are not accepted yet. The prior contact results below do not establish visual acceptance. The hopper holds three visible fruits plus one chambered round, so an empty refill deliberately includes a fourth insertion after the pump.

## Previous verification, before grip corrections

- `npx tsc --noEmit`: passed.
- `npx vitest run --maxWorkers=1`, using Node 24.20.0: all 736 tests passed in 96 files. This includes 40 viewmodel tests, the ADS alignment checks, packed moving-part pivots and world-LOD bounds.
- Reload tests cover chamber preservation on tactical reloads, magazine anchoring, continuous rifle support, the sniper's complete bolt stroke and foley, six sequential shotgun shells with a single final empty pump, and all four coconut refill counts.
- Reviewed hip, ADS, sprint, inspect, empty/tactical reloads and shot mechanisms from the eye and additional side/underside angles in real Chrome. The previous capture set contains 267 images; the report retains 15 comparison and mechanism sheets, each below 300,000 bytes.
- Rebuilt and reviewed third-person and ground versions for all five weapons. Measured packed byte counts match the actual GLBs.
- No sculpted paw asset or arm solver changes. No defect in those assets was established.

The contact probe measures the full-resolution skinned paw and wrist against the actual posed weapon triangles, including visible moving parts. Dense reload scans, key poses, transition samples and follow-up scans of corrected paths all clear the requested worst-contact threshold of greater than -0.5 mm. These are sampled measurements, supported by multi-angle visual review, rather than a mathematical guarantee over every possible input combination.

| Weapon | Previous sampled contact | Mechanical coverage |
| --- | ---: | --- |
| M4 | -0.4 mm | Curved-magazine carry, palm seat, empty catch slap, tactical return |
| Doze | 0.4 mm | Shell approach, loading-gate lift, thumb push, complete six-shell chain and final pump |
| Sniper | -0.1 mm | Both complete reloads, open-bolt return, lift/pull/push/lock after firing |
| Carabina | 0.2 mm | Both magazine reloads, support restored before side charging, sling/forearm clearance |
| Lança-coco | 0.4 mm | All starting ammunition counts 0 through 3, hopper release paths, pump and top-up |

The previous review corrected the Doze loading thumb/guard crossing, sniper forearm/stock and magazine-digit contact, the open-bolt approach, and Lança-coco sprint and refill framing. Carabina's sparse sling anchors preserve its far-LOD silhouette without consuming the barrel's triangle budget. The full suite passed after those corrections. All changed grips and their animation transitions require a new review.

To reproduce standard contact and image reviews with the QA dev server running on port 5177:

```sh
BASE=http://127.0.0.1:5177 node tools/qa/weapon-review.mjs output/review m4,shotgun,sniper,dmr,coco hip,ads,sprint,inspect,reload,reload-partial,fire eye,left,right,below
BASE=http://127.0.0.1:5177 CAPTURE=0 node tools/qa/weapon-review.mjs output/review-aim m4,shotgun,sniper,dmr,coco aim,land eye .02,.06,.1,.14,.2,.3,.45,.65,.9
```
