import { describe, expect, it } from 'vitest';
import { assertCompletionAuthContext } from './authContext.ts';

describe('assertCompletionAuthContext', () => {
  it('allows service-role contexts', () => {
    expect(() => {
      assertCompletionAuthContext(
        {
          isServiceRole: true,
          taskOwnerVerified: false,
          actorId: 'actor-1',
        },
        'service-role-case',
      );
    }).not.toThrow();
  });

  it('allows verified task owners', () => {
    expect(() => {
      assertCompletionAuthContext(
        {
          isServiceRole: false,
          taskOwnerVerified: true,
          actorId: 'actor-2',
        },
        'owner-case',
      );
    }).not.toThrow();
  });

  it('throws when neither service role nor owner verification is present', () => {
    expect(() => {
      assertCompletionAuthContext(
        {
          isServiceRole: false,
          taskOwnerVerified: false,
          actorId: 'actor-3',
        },
        'invalid-case',
      );
    }).toThrow('Missing validated completion auth context');
  });
});
