import * as THREE from 'three';

// The two things every royale opens with: the drop plane and each capybara's
// parachute. Cartoon proportions, flat livery colours, readable from far away.

const paint = (color: string, roughness = .7) => new THREE.MeshStandardMaterial({ color, roughness, metalness: .05 });

// Striped canopy in the player's kit colour. Every mesh owns its geometry and
// material because avatars dispose their chute when they leave.
export function makeParachute(kit: string): THREE.Group {
  const chute = new THREE.Group();
  const canopy = new THREE.SphereGeometry(1, 32, 10, 0, Math.PI * 2, 0, 1.05).toNonIndexed();
  canopy.scale(2.1, .95, 1.45); canopy.translate(0, 3.05, 0);
  const position = canopy.getAttribute('position'), colors = new Float32Array(position.count * 3);
  const stripe = new THREE.Color(kit), cream = new THREE.Color('#fff1d0'), color = new THREE.Color();
  for (let i = 0; i < position.count; i += 3) {
    // Colour whole triangles by their centre angle so gores stay crisp.
    const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
    const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
    const gore = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * 12);
    color.copy(gore % 2 ? stripe : cream);
    for (let k = 0; k < 3; k++) colors.set([color.r, color.g, color.b], (i + k) * 3);
  }
  canopy.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  canopy.computeVertexNormals();
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, side: THREE.DoubleSide });
  const dome = new THREE.Mesh(canopy, cloth); dome.castShadow = true; chute.add(dome);
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(.34, .4, .12, 16), paint('#fff1d0'));
  vent.position.set(0, 4.02, 0); chute.add(vent);
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#f7ebcd' });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const start = new THREE.Vector3(Math.cos(a) * 2.02, 3.3, Math.sin(a) * 1.38), end = new THREE.Vector3(Math.cos(a) * .22, 1.3, Math.sin(a) * .16);
    chute.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), i ? lineMaterial.clone() : lineMaterial));
  }
  return chute;
}

// A chunky twin-prop island hopper in cream with a teal stripe and an orange tail.
// Nose points down -Z; direct children named 'propeller' spin around Z.
export function makePlane(): THREE.Group {
  const group = new THREE.Group();
  const cream = paint('#f3ead2'), teal = paint('#2f8f86'), orange = paint('#e8793f'), dark = paint('#243038', .3), grey = paint('#9aa7a8', .5);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; group.add(mesh); return mesh;
  };
  // Fuselage: a fat capsule tapering into a tail boom.
  const body = new THREE.CapsuleGeometry(1.7, 9, 8, 20); body.rotateX(Math.PI / 2); body.scale(1, 1.05, 1);
  add(body, cream, 0, 0, -.5);
  const boom = new THREE.CylinderGeometry(1.55, .55, 6, 20); boom.rotateX(-Math.PI / 2);
  add(boom, cream, 0, .35, 7.2);
  const stripe = new THREE.CylinderGeometry(1.74, 1.74, 10.5, 20, 1, true, Math.PI * .25, Math.PI * .5); stripe.rotateX(Math.PI / 2);
  add(stripe, teal, 0, 0, -.6).rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(1.74, 1.74, 10.5, 20, 1, true, Math.PI * 1.25, Math.PI * .5).rotateX(Math.PI / 2), teal, 0, 0, -.6).rotation.z = Math.PI / 2;
  // Cockpit glass band and round cabin windows.
  const glass = new THREE.SphereGeometry(1.55, 20, 10, Math.PI * .75, Math.PI * 1.5, Math.PI * .22, Math.PI * .22);
  add(glass, dark, 0, .25, -5.3).rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const window = new THREE.CylinderGeometry(.3, .3, .2, 14); window.rotateZ(Math.PI / 2);
    add(window, dark, side * 1.62, .45, -2.8 + i * 1.45);
  }
  // High wing with rounded tips, engines and three-blade props.
  const wing = new THREE.CapsuleGeometry(.28, 20, 4, 12); wing.rotateZ(Math.PI / 2); wing.scale(1, 1, 5.5);
  add(wing, cream, 0, 1.75, -1.2);
  add(new THREE.BoxGeometry(20.5, .1, .5), teal, 0, 2.02, -2.4);
  for (const x of [-5.4, 5.4]) {
    const nacelle = new THREE.CapsuleGeometry(.72, 3, 6, 16); nacelle.rotateX(Math.PI / 2);
    add(nacelle, orange, x, 1.2, -2.2);
    add(new THREE.SphereGeometry(.42, 14, 10), grey, x, 1.2, -4.25);
    const prop = new THREE.Group(); prop.name = 'propeller'; prop.position.set(x, 1.2, -4.45); group.add(prop);
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.CapsuleGeometry(.14, 1.6, 4, 8), dark);
      blade.scale.set(1, 1, .35); blade.rotation.z = b / 3 * Math.PI * 2; blade.translateY(1); prop.add(blade);
    }
  }
  // Tail: fin and stabilisers in orange, a teal tip.
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(2.6, 0); fin.quadraticCurveTo(2.2, 2.4, 1.2, 3.3); fin.lineTo(.5, 3.3); fin.quadraticCurveTo(.2, 1.4, 0, 0);
  const finGeometry = new THREE.ExtrudeGeometry(fin, { depth: .22, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 2 });
  finGeometry.translate(0, 0, -.11); finGeometry.rotateY(-Math.PI / 2);
  add(finGeometry, orange, 0, .9, 7.8);
  const stabiliser = new THREE.CapsuleGeometry(.14, 6.4, 4, 10); stabiliser.rotateZ(Math.PI / 2); stabiliser.scale(1, 1, 5);
  add(stabiliser, orange, 0, .75, 9.3);
  // Fixed landing gear keeps the silhouette toy-like.
  for (const x of [-1.4, 1.4]) add(new THREE.CylinderGeometry(.5, .5, .4, 16).rotateZ(Math.PI / 2), dark, x, -2, -.8);
  return group;
}
