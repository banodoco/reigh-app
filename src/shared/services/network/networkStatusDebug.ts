import type { NavigatorWithDeviceInfo } from '@/types/browser-extensions';
import type { NetworkStatusManager } from '@/shared/services/network/networkStatusManager';

export function installNetworkStatusDebugHelpers(manager: NetworkStatusManager): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return;
  }

  window.checkNetworkStatus = () => {
    manager.getStatus();
    manager.getRecommendedIntervals();
  };

  window.simulateNetworkChange = (isOnline: boolean, effectiveType?: string) => {
    const nav = navigator as NavigatorWithDeviceInfo;
    const originalOnLine = navigator.onLine;
    const originalEffectiveType = nav.connection?.effectiveType;

    Object.defineProperty(navigator, 'onLine', { value: isOnline, configurable: true });
    if (effectiveType && nav.connection) {
      Object.defineProperty(nav.connection, 'effectiveType', { value: effectiveType, configurable: true });
    }

    const event = new Event(isOnline ? 'online' : 'offline');
    window.dispatchEvent(event);

    setTimeout(() => {
      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
      if (effectiveType && nav.connection) {
        Object.defineProperty(nav.connection, 'effectiveType', { value: originalEffectiveType, configurable: true });
      }
    }, 100);
  };
}
