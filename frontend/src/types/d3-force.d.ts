declare module "d3-force" {
  export interface SimulationNodeDatum {
    index?: number;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
  }

  export interface SimulationLinkDatum<N extends SimulationNodeDatum> {
    source: N | string | number;
    target: N | string | number;
    // Allow extra custom fields like distance
    [key: string]: unknown;
  }

  // Minimal force shape — a function the simulation invokes each tick, with an
  // optional initialize hook. Mirrors d3-force's Force<N, L> without pulling in
  // the full generic surface this shim doesn't model.
  export interface Force<N extends SimulationNodeDatum> {
    (alpha: number): void;
    initialize?(nodes: N[]): void;
  }

  export function forceSimulation<N extends SimulationNodeDatum>(
    nodes?: N[]
  ): {
    alpha(value: number): typeof this;
    alphaMin(value: number): typeof this;
    alphaDecay(value: number): typeof this;
    force(name: string, force: Force<N>): typeof this;
    on(event: string, cb: () => void): typeof this;
    stop(): void;
  };

  export function forceLink<
    N extends SimulationNodeDatum,
    L extends SimulationLinkDatum<N>
  >(
    links?: L[]
  ): {
    id(fn: (d: N) => string | number): typeof this;
    distance(dist: ((l: L) => number) | number): typeof this;
    strength(s: number): typeof this;
  };

  export function forceManyBody(): {
    strength(s: number): typeof this;
  };

  export function forceCollide<N extends SimulationNodeDatum>(): {
    radius(fn: (d: N) => number): typeof this;
    iterations(n: number): typeof this;
  };
}

