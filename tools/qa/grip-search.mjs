// Optional coupled search for QA fitting. Install inside page.evaluate or the geometry-only fixture.
// It changes no runtime rig behavior and uses the same exact-skin objective as coordinate search.
export function installGripSearch() {
  window.__qaGripSimplex = (evaluate, initial, options) => {
    const { lo, hi, steps, maxEvals = 1000, stopCost = .1 } = options;
    const locked = new Set(options.lock ?? []);
    const free = initial.map((_, i) => i).filter(i => !locked.has(i) && lo[i] < hi[i]);
    let evaluations = 0;
    const make = parameters => {
      const point = parameters.map((x, i) => Math.max(lo[i], Math.min(hi[i], x)));
      evaluations++;
      return { parameters: point, cost: evaluate(point) };
    };
    const first = make(initial);
    if (!free.length) return { ...first, evaluations };
    const simplex = [first, ...free.map(i => {
      const point = [...initial], step = steps[i];
      point[i] = Math.min(hi[i], point[i] + step);
      if (point[i] === initial[i]) point[i] = Math.max(lo[i], point[i] - step);
      return make(point);
    })];
    const along = (centre, from, factor) => {
      const point = [...initial];
      for (const i of free) point[i] = centre[i] + factor * (centre[i] - from[i]);
      return make(point);
    };
    let nextReport = 50;
    while (evaluations < maxEvals) {
      simplex.sort((a, b) => a.cost - b.cost);
      const best = simplex[0], worst = simplex[free.length];
      if (best.cost <= stopCost) break;
      const spread = Math.max(...free.map(i => Math.abs(worst.parameters[i] - best.parameters[i]) / Math.max(steps[i], 1e-9)));
      if (spread < 1e-5 && Math.abs(worst.cost - best.cost) < 1e-6) break;
      const centre = [...initial];
      for (const i of free) centre[i] = simplex.slice(0, free.length).reduce((sum, point) => sum + point.parameters[i], 0) / free.length;
      const reflected = along(centre, worst.parameters, 1);
      if (evaluations >= maxEvals) {
        if (reflected.cost < worst.cost) simplex[free.length] = reflected;
        break;
      }
      if (reflected.cost < best.cost) {
        const expanded = evaluations < maxEvals ? along(centre, worst.parameters, 2) : reflected;
        simplex[free.length] = expanded.cost < reflected.cost ? expanded : reflected;
      } else if (reflected.cost < simplex[free.length - 1].cost) simplex[free.length] = reflected;
      else {
        const outside = reflected.cost < worst.cost;
        const contracted = along(centre, outside ? reflected.parameters : worst.parameters, -.5);
        if (contracted.cost < (outside ? reflected.cost : worst.cost)) simplex[free.length] = contracted;
        else for (let n = 1; n < simplex.length && evaluations < maxEvals; n++) {
          const point = [...best.parameters];
          for (const i of free) point[i] = (point[i] + simplex[n].parameters[i]) * .5;
          simplex[n] = make(point);
        }
      }
      if (evaluations >= nextReport) {
        options.progress?.(evaluations, Math.min(...simplex.map(point => point.cost)));
        nextReport = evaluations + 50;
      }
    }
    simplex.sort((a, b) => a.cost - b.cost);
    return { ...simplex[0], evaluations };
  };
}
