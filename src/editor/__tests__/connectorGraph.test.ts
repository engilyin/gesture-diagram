import { describe, expect, it } from 'vitest';
import {
  attachConnectorEndpoints,
  enforceConnectorInvariants,
} from '../connectorGraph';
import { groupElements, moveGroupedElements } from '../grouping';
import type { DiagramElement } from '../types';

function rect(id: string, x: number): DiagramElement {
  return {
    id,
    kind: 'rect',
    x,
    y: 20,
    width: 60,
    height: 40,
  };
}

function line(id: string): DiagramElement {
  return {
    id,
    kind: 'line',
    x: 30,
    y: 40,
    width: 120,
    height: 0,
  };
}

describe('connector graph invariants', () => {
  it('attaches connector endpoints when a line spans two shapes', () => {
    const left = rect('left', 20);
    const right = rect('right', 120);
    const connected = attachConnectorEndpoints([left, right], line('c1'));

    expect(connected.connector).toEqual({ fromId: 'left', toId: 'right' });
  });

  it('removes dangling connector elements after structural edits', () => {
    const repaired = enforceConnectorInvariants([
      rect('left', 20),
      {
        ...line('c1'),
        connector: { fromId: 'left', toId: 'missing' },
      },
    ]);

    expect(repaired.valid).toBe(false);
    expect(repaired.repairedElements.some((element) => element.id === 'c1')).toBe(false);
  });

  it('moves all members in a group together preserving relative positions', () => {
    const grouped = groupElements([rect('a', 10), rect('b', 90)], ['a', 'b'], 'g1');
    const moved = moveGroupedElements(grouped, ['a'], 15, 25);

    const first = moved.find((element) => element.id === 'a');
    const second = moved.find((element) => element.id === 'b');

    expect(first?.x).toBe(25);
    expect(second?.x).toBe(105);
    expect((second?.x ?? 0) - (first?.x ?? 0)).toBe(80);
  });
});
