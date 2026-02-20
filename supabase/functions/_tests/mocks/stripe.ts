type CreateSessionImpl = (config: unknown) => Promise<{ id: string; url: string }>;

let createSessionImpl: CreateSessionImpl = () =>
  Promise.resolve({
    id: 'sess_default',
    url: 'https://checkout.test/session',
  });

export default class Stripe {
  checkout = {
    sessions: {
      create: (config: unknown) => createSessionImpl(config),
    },
  };

  constructor(_secret: string, _config: unknown) {}
}

export function __setCreateSessionImpl(nextImpl: CreateSessionImpl): void {
  createSessionImpl = nextImpl;
}

export function __resetCreateSessionImpl(): void {
  createSessionImpl = () =>
    Promise.resolve({
      id: 'sess_default',
      url: 'https://checkout.test/session',
    });
}
