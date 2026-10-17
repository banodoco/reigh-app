import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const indexHtml = fs.readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");
const registrationScript = indexHtml.match(/<!-- Service Worker Registration for PWA -->\s*<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1];

function runRegistrationScript(dev: boolean) {
  if (!registrationScript) throw new Error("Service worker registration script not found");
  expect(registrationScript).toContain("import.meta.env.DEV");

  const dom = new JSDOM("", { url: "http://localhost/", runScripts: "outside-only" });
  const browser = dom.window as unknown as Window;
  let onLoad: (() => void) | undefined;
  const appRegistration = {
    active: { scriptURL: `${browser.location.origin}/sw.js` },
    unregister: vi.fn().mockResolvedValue(true),
  };
  const otherRegistration = {
    active: { scriptURL: `${browser.location.origin}/other-worker.js` },
    unregister: vi.fn().mockResolvedValue(true),
  };
  const registrations = [appRegistration, otherRegistration];
  const serviceWorker = {
    getRegistrations: vi.fn().mockResolvedValue(registrations),
    register: vi.fn().mockResolvedValue(undefined),
  };
  const cacheDelete = vi.fn().mockResolvedValue(true);

  Object.defineProperty(browser.navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  Object.defineProperty(browser, "caches", {
    configurable: true,
    value: { delete: cacheDelete },
  });
  browser.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === "load") onLoad = listener as () => void;
  }) as Window["addEventListener"];
  browser.eval(registrationScript.replace("import.meta.env.DEV", String(dev)));
  if (!onLoad) throw new Error("Load handler was not registered");
  onLoad();

  return { appRegistration, otherRegistration, serviceWorker, cacheDelete, dom };
}

describe("service worker registration", () => {
  it("cleans up only this app's worker and cache in Vite dev", async () => {
    const { appRegistration, otherRegistration, serviceWorker, cacheDelete, dom } = runRegistrationScript(true);

    await vi.waitFor(() => expect(appRegistration.unregister).toHaveBeenCalledOnce());
    expect(otherRegistration.unregister).not.toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledOnce();
    expect(cacheDelete).toHaveBeenCalledWith("astrid-app-v3");
    expect(serviceWorker.register).not.toHaveBeenCalled();
    dom.window.close();
  });

  it("registers the worker in production", async () => {
    const { appRegistration, otherRegistration, serviceWorker, cacheDelete, dom } = runRegistrationScript(false);

    await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js"));
    expect(serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(appRegistration.unregister).not.toHaveBeenCalled();
    expect(otherRegistration.unregister).not.toHaveBeenCalled();
    expect(cacheDelete).not.toHaveBeenCalled();
    dom.window.close();
  });
});
