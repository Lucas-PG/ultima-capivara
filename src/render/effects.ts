import * as THREE from 'three';
import type { GameEvent, Vec3 } from '../shared/types';
import type { AvatarView } from './avatars';
import type { WeaponView } from './weapons';

const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
interface Tracer { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; life: number; maxLife: number }
interface Particle { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }

export class EffectsView {
  private readonly tracers: Tracer[] = [];
  private readonly particles: Particle[] = [];
  constructor(private readonly scene: THREE.Scene) {
    const tracerMaterial = new THREE.MeshBasicMaterial({ color: '#ffe3a1', transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 32; i++) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, 1, 4), tracerMaterial); mesh.visible = false; this.scene.add(mesh);
      this.tracers.push({ mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), life: 0, maxLife: .11 });
    }
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#ffce7c', transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 65; i++) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.045, 0), sparkMaterial); mesh.visible = false; this.scene.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
    }
  }

  update(dt: number) {
    for (const tracer of this.tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt; tracer.mesh.visible = tracer.life > 0;
      if (!tracer.mesh.visible) continue;
      const t = 1 - tracer.life / tracer.maxLife;
      const start = tracer.from.clone().lerp(tracer.to, Math.min(1, t * 2));
      const end = tracer.from.clone().lerp(tracer.to, Math.min(1, t * 2 + .13));
      const diff = end.clone().sub(start), length = diff.length();
      tracer.mesh.position.copy(start).addScaledVector(diff, .5); tracer.mesh.scale.set(1, length, 1);
      tracer.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
    }
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life -= dt; particle.mesh.visible = particle.life > 0;
      particle.velocity.y -= dt * 7.5; particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.scale.setScalar(Math.max(.05, particle.life / .45));
    }
  }

  event(event: GameEvent, avatars: AvatarView, weaponView: WeaponView, playerId: string | undefined): void {
    if (event.type === 'shot') {
      const tracer = this.tracers.find(item => item.life <= 0) || this.tracers[0];
      tracer.from.copy(v(event.origin)); tracer.to.copy(v(event.end)); tracer.life = tracer.maxLife; tracer.mesh.visible = true;
      if (event.actor === playerId) weaponView.shot(event.weapon);
      const end = v(event.end);
      for (let i = 0; i < (event.hit ? 7 : 3); i++) {
        const particle = this.particles.find(item => item.life <= 0);
        if (!particle) break;
        particle.life = .25 + Math.random() * .22; particle.mesh.position.copy(end); particle.mesh.visible = true;
        particle.velocity.set((Math.random() - .5) * 4, Math.random() * 3.8, (Math.random() - .5) * 4);
      }
    } else if (event.type === 'damage') {
      const visual = avatars.get(event.target);
      if (visual) {
        visual.group.scale.multiplyScalar(1.04);
        const spark = this.particles.find(item => item.life <= 0);
        if (spark) { spark.life = .3; spark.mesh.position.copy(v(event.pos)); spark.mesh.visible = true; spark.velocity.set(0, 2, 0); }
      }
    }
  }

}
