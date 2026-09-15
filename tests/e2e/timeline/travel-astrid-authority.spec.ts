import { expect, test } from '@playwright/test';

/**
 * The Tasks pane is mounted by the global shell, including on Travel. Keep a
 * browser-level guard here because a direct Supabase hook in that shell can
 * bypass the page's Astrid authority provider while all visible UI appears
 * healthy. This runs in the deterministic local Astrid timeline document so
 * the protected route is exercised without a real cloud account or session.
 */
test('Travel default Astrid authority has no deferred cloud shot or account traffic', async ({ page }) => {
  const forbidden: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }

    const isSupabaseAuthority =
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && parsed.port === '54321';
    const isSupabaseHosted = /(?:^|\.)supabase\.co$/i.test(parsed.hostname);
    const isDeferredRelationalRoute = /^\/rest\/v1\/(?:shots|credits|user_settings|tool_settings|api_tokens|analytics)(?:\/|$)/i.test(parsed.pathname);

    if (isSupabaseAuthority || isSupabaseHosted || isDeferredRelationalRoute) {
      forbidden.push(`${request.method()} ${url}`);
    }
  });

  await page.goto('/tools/travel-between-images?localProject=demo-project&localTimeline=demo-timeline&localTest=1', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await expect(page.getByText(/This timeline has no document shot groups yet\./i)).toBeVisible({ timeout: 20_000 });
  // Allow globally mounted providers and the Travel page to finish their
  // initial effects before taking the network snapshot.
  await page.waitForTimeout(1_000);

  expect(forbidden, 'default Astrid Travel must not use deferred cloud readers').toEqual([]);
  await expect(page.getByText(/cloud processing enabled.*credits/i)).toHaveCount(0);
});
