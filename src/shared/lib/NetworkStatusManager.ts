/**
 * NetworkStatusManager - Centralized network status management
 *
 * Provides a single source of truth for online/offline status and connection type.
 * Integrates with ReconnectScheduler and Resurrection Polling for network-aware behavior.
 */

import { handleError } from '@/shared/lib/errorHandling/handleError';
import type { NavigatorWithDeviceInfo } from '@/types/browser-extensions';

interface NetworkStatus {
  isOnline: boolean;
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  lastTransitionAt: number;
  previousOnlineStatus: boolean;
}

type NetworkEventType = 'online' | 'offline' | 'connection-change';

interface NetworkStatusSubscriber {
  (status: NetworkStatus, eventType: NetworkEventType, event?: Event): void;
}

export class NetworkStatusManager {
  private status: NetworkStatus;
  private subscribers: Set<NetworkStatusSubscriber> = new Set();
  private initialized = false;

  constructor() {
    const nav = navigator as NavigatorWithDeviceInfo;
    this.status = {
      isOnline: navigator.onLine,
      effectiveType: nav.connection?.effectiveType,
      lastTransitionAt: Date.now(),
      previousOnlineStatus: navigator.onLine
    };
    
  }

  initialize(): void {
    if (this.initialized) return;

    const handleOnline = (event: Event) => this.handleNetworkChange('online', event);
    const handleOffline = (event: Event) => this.handleNetworkChange('offline', event);
    const handleConnectionChange = (event: Event) => this.handleNetworkChange('connection-change', event);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const nav = navigator as NavigatorWithDeviceInfo;
    if (nav.connection) {
      nav.connection.addEventListener('change', handleConnectionChange);
    }

    this.initialized = true;
  }

  getStatus(): NetworkStatus {
    return { ...this.status };
  }

  subscribe(callback: NetworkStatusSubscriber): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  isSlowConnection(): boolean {
    return this.status.effectiveType === '2g' || this.status.effectiveType === 'slow-2g';
  }

  getRecommendedIntervals(): { fast: number; normal: number; slow: number } {
    if (!this.status.isOnline) {
      return { fast: 60000, normal: 120000, slow: 300000 }; // Offline - very slow
    }
    
    if (this.isSlowConnection()) {
      return { fast: 30000, normal: 60000, slow: 180000 }; // Slow connection
    }
    
    return { fast: 10000, normal: 30000, slow: 60000 }; // Good connection
  }

  private handleNetworkChange(eventType: NetworkEventType, event?: Event): void {
    const now = Date.now();
    const newIsOnline = navigator.onLine;
    const nav = navigator as NavigatorWithDeviceInfo;
    const newEffectiveType = nav.connection?.effectiveType;

    const onlineStatusChanged = newIsOnline !== this.status.isOnline;
    const connectionChanged = newEffectiveType !== this.status.effectiveType;

    if (!onlineStatusChanged && !connectionChanged) {
      return;
    }

    const previousStatus = { ...this.status };
    this.status = {
      isOnline: newIsOnline,
      effectiveType: newEffectiveType,
      lastTransitionAt: now,
      previousOnlineStatus: previousStatus.isOnline
    };
    
    this.subscribers.forEach(callback => {
      try {
        callback(this.status, eventType, event);
      } catch (error) {
        handleError(error, { context: 'NetworkStatusManager', showToast: false });
      }
    });
  }
}

// Global instance
let networkStatusManager: NetworkStatusManager;

export function getNetworkStatusManager(): NetworkStatusManager {
  if (!networkStatusManager) {
    networkStatusManager = new NetworkStatusManager();
    networkStatusManager.initialize();
    
    // Debug helpers (dev only)
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      window.__NETWORK_STATUS_MANAGER__ = networkStatusManager;

      window.checkNetworkStatus = () => {
        networkStatusManager.getStatus();
        networkStatusManager.getRecommendedIntervals();
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
  }
  
  return networkStatusManager;
}
