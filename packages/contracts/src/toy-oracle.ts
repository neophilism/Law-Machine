/** Invented executable toy-law fixture only; not a general legal simulation engine. */
export type ToyFact = { received: boolean; destination: 'desk-b' | null };
export type ToyEvent = { tick: number; kind: 'received' | 'forwarded' | 'unresolved'; actor: 'desk-a' | 'desk-b'; source: 'toy:s1' | 'toy:s2' };
export function runFictionalToy(facts: ToyFact): readonly ToyEvent[] {
  if (typeof facts?.received !== 'boolean' || !(facts.destination === null || facts.destination === 'desk-b')) throw Error('INVALID_TOY_FACT');
  if (!facts.received) return [];
  const first: ToyEvent = { tick:0, kind:'received', actor:'desk-a', source:'toy:s1' };
  if (facts.destination === null) return [first,{ tick:1,kind:'unresolved',actor:'desk-a',source:'toy:s2' }];
  return [first,{ tick:1,kind:'forwarded',actor:'desk-a',source:'toy:s1' },{ tick:2,kind:'received',actor:'desk-b',source:'toy:s1' }];
}
