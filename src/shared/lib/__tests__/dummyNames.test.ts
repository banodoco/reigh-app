import { describe, it, expect } from 'vitest';
import { getRandomDummyName } from '../dummyNames';

describe('getRandomDummyName', () => {
  it('returns a string', () => {
    const name = getRandomDummyName();
    expect(typeof name).toBe('string');
  });

  it('returns a non-empty string', () => {
    const name = getRandomDummyName();
    expect(name.length).toBeGreaterThan(0);
  });

  it('returns a value from the known list', () => {
    const knownNames = [
      "Lord of the Onion Rings",
      "Gone with the Wind Turbine",
      "Pulp Friction",
      "Schindler's Shopping List",
      "12 Angry Penguins",
      "The Wizard of Ozempic",
      "Jurassic Parking Ticket",
      "Okayfellas",
      "Apocalypse Nowish",
      "The Lion Kink",
      "The Princess Diarrhea",
      "Braveheart Burn",
    ];

    // Call multiple times to increase confidence
    for (let i = 0; i < 50; i++) {
      const name = getRandomDummyName();
      expect(knownNames).toContain(name);
    }
  });
});
