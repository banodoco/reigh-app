/**
 * NetworkStatusManager - Centralized network status management
 *
 * Provides a single source of truth for online/offline status and connection type.
 * Integrates with ReconnectScheduler and Resurrection Polling for network-aware behavior.
 */

import { handleError } from '@/shared/lib/errorHandler';
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
    const connection = nav.connection;
    
    const onlineStatusChanged = newIsOnline !== this.status.isOnline;
    const connectionChanged = newEffectiveType !== this.status.effectiveType;
    
    // Enhanced network transition logging - always log for debugging
    const timeSinceLastTransition = now - this.status.lastTransitionAt;
    
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
    
    // Enhanced transition logging with impact analysis
    const transitionType = onlineStatusChanged ? 
      (newIsOnline ? 'OFFLINE_TO_ONLINE' : 'ONLINE_TO_OFFLINE') : 
      'CONNECTION_TYPE_CHANGE';
    
    // Browser online/offline event logging
    
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
    
    if (typeof window !== 'undefined') {
      (window as any).__NETWORK_STATUS_MANAGER__ = networkStatusManager;
      
      // Add debug helper
      (window as any).checkNetworkStatus = () => {
        const status = networkStatusManager.getStatus();
        const intervals = networkStatusManager.getRecommendedIntervals();
      };
      
      // Add manual network change simulator for testing
      (window as any).simulateNetworkChange = (isOnline: boolean, effectiveType?: string) => {
        const originalOnLine = navigator.onLine;
        const originalEffectiveType = (navigator as any).connection?.effectiveType;
        
        // Temporarily override navigator values
        Object.defineProperty(navigator, 'onLine', { value: isOnline, configurable: true });
        if (effectiveType && (navigator as any).connection) {
          Object.defineProperty((navigator as any).connection, 'effectiveType', { value: effectiveType, configurable: true });
        }
        
        // Trigger the event
        const event = new Event(isOnline ? 'online' : 'offline');
        window.dispatchEvent(event);
        
        // Restore original values after a delay
        setTimeout(() => {
          Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
          if (effectiveType && (navigator as any).connection) {
            Object.defineProperty((navigator as any).connection, 'effectiveType', { value: originalEffectiveType, configurable: true });
          }
        }, 100);
      };
    }
  }
  
  return networkStatusManager;
}
