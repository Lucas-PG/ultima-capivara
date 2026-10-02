import * as THREE from 'three';

const direction = new THREE.Vector3(), centre = new THREE.Vector3(), radial = new THREE.Vector3(), tangent = new THREE.Vector3();
const candidate = new THREE.Vector3(), forearm = new THREE.Vector3(), upper = new THREE.Vector3(), medial = new THREE.Vector3();
const palmAcross = new THREE.Vector3(), thumbAcross = new THREE.Vector3(), anterior = new THREE.Vector3();
const circle = Array.from({ length: 32 }, (_, i) => ({ angle: i * Math.PI / 16, c: Math.cos(i * Math.PI / 16), s: Math.sin(i * Math.PI / 16) }));
const flexion = Math.tan(42 * Math.PI / 180), ulnar = Math.tan(22 * Math.PI / 180), radialLimit = Math.tan(17 * Math.PI / 180);
const rotation = Math.cos(77 * Math.PI / 180);

/** Pick a point on the two-bone elbow circle while keeping the wrist fixed.
 * Dot-product limits avoid angles and allocations inside the candidate loop.
 * The authored elbow remains the first choice whenever its wrist is natural. */
export function worldElbow(shoulder: THREE.Vector3, wrist: THREE.Vector3, upperLength: number, foreLength: number,
  pole: THREE.Vector3, forward: THREE.Vector3, palm: THREE.Vector3, side: 'R' | 'L', out: THREE.Vector3, previousAngle = 0): number {
  direction.subVectors(wrist, shoulder);
  const distance = direction.length();
  if (distance < 1e-6) {
    out.copy(pole);
    if (out.lengthSq() < 1e-10) out.set(side === 'R' ? 1 : -1, -1, 0);
    out.normalize().multiplyScalar(upperLength).add(shoulder);
    return 0;
  }
  const reach = THREE.MathUtils.clamp(distance, Math.abs(upperLength - foreLength) + 1e-6, (upperLength + foreLength) * .999);
  direction.divideScalar(distance);
  const along = THREE.MathUtils.clamp((upperLength * upperLength + reach * reach - foreLength * foreLength) / (2 * upperLength * reach), -1, 1);
  const radius = upperLength * Math.sqrt(1 - along * along);
  centre.copy(shoulder).addScaledVector(direction, upperLength * along);
  radial.copy(pole).addScaledVector(direction, -pole.dot(direction));
  if (radial.lengthSq() < 1e-10) {
    radial.set(Math.abs(direction.x) < .9 ? 1 : 0, Math.abs(direction.x) < .9 ? 0 : 1, 0);
    radial.addScaledVector(direction, -radial.dot(direction));
  }
  radial.normalize();
  tangent.crossVectors(direction, radial);
  const sign = side === 'R' ? 1 : -1;
  let bestScore = Infinity, bestAngle = 0;
  const score = (angle: number, c = Math.cos(angle), s = Math.sin(angle)) => {
    candidate.copy(centre).addScaledVector(radial, radius * c).addScaledVector(tangent, radius * s);
    forearm.subVectors(wrist, candidate).normalize(); upper.subVectors(candidate, shoulder).normalize();
    palmAcross.copy(palm).addScaledVector(forearm, -palm.dot(forearm)).normalize();
    thumbAcross.crossVectors(forearm, palmAcross).multiplyScalar(sign);
    anterior.copy(forearm).addScaledVector(upper, -forearm.dot(upper));
    medial.crossVectors(anterior, upper).multiplyScalar(sign).normalize();
    const straight = forward.dot(forearm), bend = forward.dot(palmAcross), deviation = forward.dot(thumbAcross);
    const f = Math.max(0, Math.abs(bend) - straight * flexion);
    const d = Math.max(0, -deviation - straight * ulnar, deviation - straight * radialLimit);
    const r = Math.max(0, rotation - medial.dot(palmAcross));
    const strain = f * f + d * d + r * r;
    const value = strain * 100 + (1 - c) * .0001;
    if (value < bestScore) { bestScore = value; bestAngle = angle; out.copy(candidate); }
    return strain;
  };
  if (score(0, 1, 0) < 1e-10) return 0;
  // Body animation changes by a small amount between frames. Reuse the last
  // natural elbow while it remains inside the stricter working limits.
  if (previousAngle && score(previousAngle) < 1e-10) { out.copy(candidate); return previousAngle; }
  for (let i = 1; i < circle.length; i++) { const a = circle[i]; score(a.angle, a.c, a.s); }
  let interval = Math.PI / 32;
  for (let i = 0; i < 5; i++, interval *= .5) {
    const at = bestAngle; score(at - interval); score(at + interval);
  }
  return bestAngle;
}
