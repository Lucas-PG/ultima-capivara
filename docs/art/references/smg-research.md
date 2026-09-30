# Canarinho SMG first-person research
Updated 29 September 2026. [Shared sources](animation-research.md). [Image QA](README.md).

## Design and source decision
Yellow receiver, green diagonal stripe, blue star, green vertical foregrip and pistol grip, straight magazine, triangle wire stock. Keep the left-accessible linear charging handle shown in dominant source view. The front sight differs slightly between source views; use the rear-three-quarter front post/protective ears for eye-level clarity and flag the orthographic hood discrepancy for modelling. Rear aperture remains an aperture, not the M4 notch.

Class candidates: MW2019 MP7, MWII VEL 46, MWIII Striker, BF2042 MP9, Valorant Spectre/Stinger, Apex R-99, Overwatch Sombra's machine pistol, Fortnite Ballistic SMGs. The small receiver and fast support-hand travel are useful comparisons. Sombra's one-hand fantasy does not override this two-grip design. [Riot animation principles](https://playvalorant.com/en-gb/news/dev/how-the-valorant-arsenal-was-built/), [official weapon families](https://playvalorant.com/en-us/arsenal/), [Ballistic](https://www.fortnite.com/news/fortnite-goes-first-person-with-ballistic-a-tactical-5v5-shooter-launching-in-early-access-dec-11). No per-game timings are inferred from these pages.

## Hip, ADS, sprint, inspect
Hip low-right and small; wire stock may crop, gripping paws should not. Left paw wraps supplied vertical grip with three fingers around its front, thumb forward at top shoulder, palm against grip and back toward eye. Do not grasp narrow magazine as the permanent support point. Right index in guard, two fingers below and thumb left.

ADS centers rear aperture and front post; both hands low. Sprint .15 s compact dip, .20 s recover, two contacts retained. Inspect 0-.25 lift, .25-.80 show star, .80-1.30 opposite face, 1.30-1.65 settle. No live charging during inspect.

## Proposed reload keys
Assume a closed-bolt empty state requiring manual charging, since the design does not establish a bolt-hold-open control. This is art direction, not a runtime claim.

| Key | Tactical, 1.80 s | Empty, 2.30 s |
| --- | --- | --- |
| .20 | Present well, support leaves foregrip | Same |
| .55 | Partial magazine clear, retained | Empty magazine clear |
| 1.05 | Fresh mag aligned below empty well | Same |
| 1.45 | Full seating with heel at base | Same |
| 1.85 empty / 1.60 tactical | Regrip foregrip; no action cycle | Pull charging handle to REAR end of slot |
| 2.30 empty / 1.80 tactical | Settle ready | Release handle forward, restore foregrip, settle |

Right index straight outside guard during manipulation. Exactly three fingers total, so extending index leaves only two curled fingers. Do not add an extra digit. Use the right wrist as mass anchor; a short downward sag when support departs, small upward seating impact, backward handle resistance and sharp return. Last pose returns to the original hip silhouette.

The generated correction resolves the handle position but not the exact seating hand or all index contacts. Written mechanism takes precedence. Full animation and attachment validation remain for the modeller/animator.
