let _counter = 2100;

export function acquireZIndex(): number {
  return ++_counter;
}

export function releaseZIndex(z: number): void {
  if (z === _counter) _counter--;
}
