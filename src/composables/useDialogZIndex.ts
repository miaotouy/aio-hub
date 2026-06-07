let _counter = 1800; // 避让element-ui等库的默认z-index范围（1000-2000），留出足够空间

export function acquireZIndex(): number {
  return ++_counter;
}

export function releaseZIndex(z: number): void {
  if (z === _counter) _counter--;
}
