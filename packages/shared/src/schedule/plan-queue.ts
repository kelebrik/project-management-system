/**
 * The rows ready to be scheduled, taken earliest in plan order first: what
 * sorting the waiting list before each take gives, ties in the order they
 * joined, without sorting it again each time.
 */
export class PlanQueue<T> {
  private readonly heap: Array<{ value: T; joined: number }> = [];
  private joined = 0;

  constructor(private readonly compare: (left: T, right: T) => number) {}

  get size() {
    return this.heap.length;
  }

  push(value: T) {
    const heap = this.heap;
    heap.push({ value, joined: this.joined++ });
    let at = heap.length - 1;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (this.before(heap[parent]!, heap[at]!)) break;
      [heap[parent], heap[at]] = [heap[at]!, heap[parent]!];
      at = parent;
    }
  }

  take(): T | undefined {
    const heap = this.heap;
    const first = heap[0];
    const last = heap.pop();
    if (!first || !last) return undefined;
    if (heap.length > 0) {
      heap[0] = last;
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        const right = left + 1;
        let smallest = at;
        if (left < heap.length && this.before(heap[left]!, heap[smallest]!)) smallest = left;
        if (right < heap.length && this.before(heap[right]!, heap[smallest]!)) smallest = right;
        if (smallest === at) break;
        [heap[smallest], heap[at]] = [heap[at]!, heap[smallest]!];
        at = smallest;
      }
    }
    return first.value;
  }

  private before(left: { value: T; joined: number }, right: { value: T; joined: number }) {
    return (this.compare(left.value, right.value) || left.joined - right.joined) < 0;
  }
}
