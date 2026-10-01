// Target composition of the first-person view per weapon class, from the research in
// docs/overhaul/viewmodel-research.md (Apex Legends, Call of Duty, Valorant, Titanfall 2 and Halo
// Infinite measured at the hip and aimed), adapted to the capybara's big paws. Screen fractions from
// the top-left corner at 16:9 (the reticle is 0.5, 0.5); angles in degrees against the view (yaw + =
// muzzle toward the left, pitch + = up, roll + = top leaning left). The framing tests and the
// evidence boards both read these numbers. Kept free of imports so tools can load it directly.

export type FrameClass = 'handgun' | 'smg' | 'rifle' | 'shotgun' | 'marksman' | 'launcher' | 'melee';
export const FRAME_CLASS = {
  pistol: 'handgun', revolver: 'handgun', smg: 'smg', m4: 'rifle', shotgun: 'shotgun',
  dmr: 'marksman', sniper: 'marksman', coco: 'launcher', machete: 'melee',
} as const satisfies Record<string, FrameClass>;

export type Range = readonly [number, number];
export interface Box { x: Range; y: Range }
export interface HipTarget {
  /** Muzzle (blade tip for the machete), sight socket, firing grip (the firing paw's web) and support wrist. */
  muzzle: Box; sight?: Box; grip: Box; support?: Box;
  /** The support forearm leaves the frame through the bottom edge inside this span. */
  supportExit?: Range;
  yaw: Range; pitch: Range; roll: Range;
  /** Share of the frame covered by the gun and both arms. */
  coverage: Range;
}
/** The central band around the reticle that hip framing keeps nearly clear (Destiny's combat corridor). */
export const CORRIDOR = { x: [.35, .65], y: [.25, .58] } as const;

const LONG_ANGLES = { yaw: [3, 10], pitch: [1, 8], roll: [3, 10] } as const;
export const HIP_TARGETS: Record<FrameClass, HipTarget & { corridorMax: number }> = {
  // Two-handed, low in the lower centre-right: the slide's top and sights just right of and below the reticle.
  handgun: { muzzle: { x: [.5, .62], y: [.5, .66] }, sight: { x: [.54, .66], y: [.48, .66] }, grip: { x: [.52, .72], y: [.72, .95] },
    supportExit: [.3, .66], yaw: [0, 6], pitch: [0, 5], roll: [0, 8], coverage: [.05, .12], corridorMax: .08 },
  smg: { muzzle: { x: [.52, .62], y: [.52, .62] }, sight: { x: [.62, .74], y: [.52, .62] }, grip: { x: [.6, .76], y: [.74, .92] },
    support: { x: [.5, .66], y: [.75, 1] }, supportExit: [.4, .7], ...LONG_ANGLES, coverage: [.09, .16], corridorMax: .08 },
  // Long guns: the support paw under the rear of the fore-end, low (its foreshortened forearm only a short
  // shape at the bottom edge), as Apex's and Call of Duty's support hands.
  rifle: { muzzle: { x: [.52, .6], y: [.5, .6] }, sight: { x: [.64, .76], y: [.52, .64] }, grip: { x: [.62, .76], y: [.74, .9] },
    support: { x: [.5, .64], y: [.72, .9] }, supportExit: [.4, .66], ...LONG_ANGLES, coverage: [.09, .18], corridorMax: .12 },
  shotgun: { muzzle: { x: [.5, .6], y: [.48, .6] }, sight: { x: [.64, .76], y: [.52, .64] }, grip: { x: [.62, .76], y: [.74, .9] },
    support: { x: [.5, .64], y: [.7, .88] }, supportExit: [.4, .66], ...LONG_ANGLES, coverage: [.09, .18], corridorMax: .12 },
  marksman: { muzzle: { x: [.5, .6], y: [.48, .6] }, sight: { x: [.64, .78], y: [.52, .66] }, grip: { x: [.62, .76], y: [.74, .9] },
    support: { x: [.5, .64], y: [.7, .9] }, supportExit: [.4, .66], ...LONG_ANGLES, coverage: [.09, .18], corridorMax: .14 },
  launcher: { muzzle: { x: [.5, .62], y: [.52, .64] }, sight: { x: [.62, .76], y: [.46, .58] }, grip: { x: [.62, .78], y: [.8, 1] },
    support: { x: [.5, .64], y: [.75, .95] }, supportExit: [.4, .66], ...LONG_ANGLES, coverage: [.09, .19], corridorMax: .12 },
  // Carried at the lower right, the blade rising diagonally up-left to just short of the reticle; the free paw relaxed, mostly out of frame.
  melee: { muzzle: { x: [.44, .62], y: [.25, .45] }, grip: { x: [.66, .82], y: [.76, .92] },
    yaw: [10, 35], pitch: [20, 45], roll: [100, 135], coverage: [.06, .14], corridorMax: .16 },
};
/** Aimed: the sight on the reticle, the support forearm small at the lower left (it was 9 to 11 percent). */
export const ADS_TARGET = { sightTolerance: .005, supportMax: .065, coverageMax: .22 } as const;
/** Every sampled pose: nothing closer to the eye than this (metres) and no surface cut open by the near plane. */
export const NEAREST_VISIBLE = .06;
/** Hidden-shoulder IK: the elbow keeps a natural bend at the hip and aimed (degrees, 180 = locked straight). */
export const ELBOW_BEND: Range = [60, 158];

/** Natural wrist (degrees), every paw in every sampled state. Normal range of motion (AAOS): flexion 80,
 * extension 70, radial deviation 20, ulnar 30, pronation and supination 80 each; the functional range of
 * daily tasks is 40 flexion to 40 extension and 10 radial to 30 ulnar (Ryu et al. 1991; Palmer et al. 1985
 * measured less). A held weapon reads natural inside the functional range: extension and flexion within 45,
 * ulnar deviation within 25 and radial within 20. Forearm rotation keeps the anatomical 80 (daily tasks use
 * about 50, Morrey et al. 1981): a fore-end held from below needs strong supination, and rotation shows only
 * as the paw's facing, never as a kink at the wrist. */
export const WRIST_LIMITS = { flexion: [-45, 45], deviation: [-25, 20], pronation: [-80, 80] } as const;
/** What the arm solver aims for: the limits less a margin, so measured poses keep clear of them. */
export const WRIST_SOLVE = { flexion: [-40, 40], deviation: [-21, 16], pronation: [-74, 74] } as const;
