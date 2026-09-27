/** Maps any slide index of a looped list (rendered `copies` times) onto the same slide of the middle copy. */
export function toMiddleCopy(index: number, count: number, middleCopy: number): number {
  if (count === 0) return 0;
  const position = ((index % count) + count) % count;
  return middleCopy * count + position;
}

/** True when a slide lies outside the `visible` slides starting at `start` (it should be inert). */
export function isOutsideWindow(slideIndex: number, start: number, visible: number): boolean {
  return slideIndex < start || slideIndex >= start + visible;
}
