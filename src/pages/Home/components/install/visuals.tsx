import React from 'react';
import { Plus, MoreVertical } from 'lucide-react';

/*
 * Browser chrome mockups intentionally use literal colors to mirror OS/browser UI.
 * These colors are not app theme tokens and should not be converted to semantic vars.
 */

const TrafficLights = () => (
  <div className="flex gap-1">
    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
  </div>
);

const ShareIconSvg = ({ className = 'w-4 h-4 text-[#007AFF]' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M4 14v5a2 2 0 002 2h12a2 2 0 002-2v-5" />
  </svg>
);

const IPhoneNotch = ({ bg = 'bg-gray-200' }: { bg?: string }) => (
  <div className={`h-6 ${bg} flex justify-center items-end pb-1`}>
    <div className="w-16 h-1 bg-gray-400 rounded-full" />
  </div>
);

const PulseHighlight = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`flex items-center justify-center animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1 rounded ${className}`}>
    {children}
  </div>
);

const NavArrows = () => (
  <div className="flex gap-1 text-gray-400 text-sm">
    <span>{'‹'}</span>
    <span>{'›'}</span>
  </div>
);

const ChromeInstallIcon = () => (
  <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
      <TrafficLights />
      <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-300 text-xs">
        <span className="text-gray-400 truncate">reigh.art</span>
        <PulseHighlight className="ml-auto w-5 h-5 bg-gray-50 border border-gray-300">
          <svg className="w-3 h-3 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            <path d="M12 7v6M9 10l3 3 3-3" />
          </svg>
        </PulseHighlight>
      </div>
    </div>
    <div className="h-8 bg-gray-50" />
  </div>
);

const SafariShareIcon = () => (
  <div className="relative w-full max-w-[200px] bg-gray-100 rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
    <IPhoneNotch />
    <div className="h-16 bg-gray-50 flex items-center justify-center">
      <span className="text-[10px] text-gray-400">reigh.art</span>
    </div>
    <div className="flex items-center justify-around px-4 py-2 bg-gray-200 border-t border-gray-300">
      <div className="w-5 h-5 text-gray-400">{'‹'}</div>
      <div className="w-5 h-5 text-gray-400">{'›'}</div>
      <PulseHighlight className="w-7 h-7">
        <ShareIconSvg className="w-5 h-5 text-[#007AFF]" />
      </PulseHighlight>
      <div className="w-5 h-5 text-gray-400">{'☐'}</div>
      <div className="w-5 h-5 text-gray-400">{'⊡'}</div>
    </div>
  </div>
);

const ChromeIOSShareIcon = () => (
  <div className="relative w-full max-w-[200px] bg-gray-100 rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
    <IPhoneNotch bg="bg-gray-800" />
    <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
      <div className="flex-1 flex items-center px-2 py-1 bg-gray-100 rounded-full text-[10px] text-gray-500 truncate">
        reigh.art
      </div>
      <PulseHighlight className="w-6 h-6">
        <ShareIconSvg />
      </PulseHighlight>
    </div>
    <div className="h-16 bg-gray-50" />
  </div>
);

const EdgeIOSShareIcon = () => (
  <div className="relative w-full max-w-[200px] bg-gray-100 rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
    <IPhoneNotch bg="bg-gray-800" />
    <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
      <div className="flex-1 flex items-center px-2 py-1 bg-gray-100 rounded-full text-[10px] text-gray-500 truncate">
        reigh.art
      </div>
    </div>
    <div className="h-12 bg-gray-50" />
    <div className="flex items-center justify-around px-4 py-2 bg-white border-t border-gray-200">
      <div className="w-5 h-5 text-gray-400">{'‹'}</div>
      <div className="w-5 h-5 text-gray-400">{'›'}</div>
      <PulseHighlight className="w-7 h-7">
        <MoreVertical className="w-5 h-5 text-gray-600" />
      </PulseHighlight>
      <div className="w-5 h-5 text-gray-400">{'☐'}</div>
      <div className="w-5 h-5 text-gray-400">{'⊡'}</div>
    </div>
  </div>
);

const IPadSafariShareIcon = () => (
  <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
      <TrafficLights />
      <NavArrows />
      <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-300 text-xs">
        <span className="text-gray-400 truncate">reigh.art</span>
      </div>
      <PulseHighlight className="w-6 h-6">
        <ShareIconSvg />
      </PulseHighlight>
    </div>
    <div className="h-10 bg-gray-50" />
  </div>
);

const IPadChromeShareIcon = () => (
  <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
      <div className="flex items-center gap-1 px-3 py-1 bg-white rounded-t border-x border-t border-gray-300 text-xs">
        <span className="text-gray-600 truncate">reigh.art</span>
        <span className="text-gray-400 text-[10px] ml-2">{'×'}</span>
      </div>
      <div className="flex-1" />
    </div>
    <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-b border-gray-200">
      <NavArrows />
      <div className="flex-1 flex items-center px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-500">
        reigh.art
      </div>
      <PulseHighlight className="w-6 h-6">
        <ShareIconSvg />
      </PulseHighlight>
    </div>
    <div className="h-10 bg-gray-50" />
  </div>
);

const IPadEdgeShareIcon = () => (
  <div className="relative w-full max-w-[280px]">
    <div className="bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
        <div className="flex items-center gap-1 px-3 py-1 bg-white rounded-t border-x border-t border-gray-300 text-xs">
          <span className="text-gray-600 truncate">reigh.art</span>
          <span className="text-gray-400 text-[10px] ml-2">{'×'}</span>
        </div>
        <div className="flex-1" />
        <PulseHighlight className="w-6 h-6">
          <MoreVertical className="w-4 h-4 text-gray-600" />
        </PulseHighlight>
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-b border-gray-200">
        <NavArrows />
        <div className="flex-1 flex items-center px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-500">
          reigh.art
        </div>
      </div>
      <div className="h-8 bg-gray-50" />
    </div>
    <div className="absolute top-8 right-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-[10px] w-36 z-10">
      <div className="px-3 py-1.5 text-gray-600">New Tab</div>
      <div className="px-3 py-1.5 text-gray-600">Share...</div>
      <div className="border-t border-gray-100 my-0.5" />
      <div className="px-3 py-1.5 bg-blue-500 text-white rounded mx-1 font-medium">
        Add to Home Screen
      </div>
    </div>
  </div>
);

const SafariFileMenu = () => (
  <div className="relative w-full max-w-[280px]">
    <div className="flex items-center gap-4 px-3 py-1 bg-gray-200/80 backdrop-blur border border-gray-300 rounded-t-lg text-xs">
      <span className="font-bold">{'&#63743;'}</span>
      <PulseHighlight className="px-2 py-0.5 bg-gray-300/50 font-medium">File</PulseHighlight>
      <span className="text-gray-600">Edit</span>
      <span className="text-gray-600">View</span>
      <span className="text-gray-600">History</span>
    </div>
    <div className="absolute top-full left-8 mt-0.5 bg-white border border-gray-300 rounded-lg shadow-lg py-1 text-xs w-40 z-10">
      <div className="px-3 py-1 text-gray-600">New Window</div>
      <div className="px-3 py-1 text-gray-600">New Tab</div>
      <div className="border-t border-gray-200 my-1" />
      <div className="px-3 py-1 bg-blue-500 text-white rounded mx-1 font-medium">Add to Dock</div>
    </div>
    <div className="h-12 bg-gray-100 border-x border-b border-gray-300 rounded-b-lg" />
  </div>
);

const DesktopBrowserWithBadge = ({ badgeIcon, badgeText }: { badgeIcon: React.ReactNode; badgeText: string }) => (
  <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
      <TrafficLights />
      <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-300 text-xs">
        <span className="text-gray-400 truncate">reigh.art</span>
        <div className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-300 rounded-full text-[10px] font-medium text-gray-700 animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1">
          {badgeIcon}
          <span>{badgeText}</span>
        </div>
      </div>
    </div>
    <div className="h-8 bg-gray-50" />
  </div>
);

const EdgeAppAvailable = () => (
  <DesktopBrowserWithBadge
    badgeIcon={<Plus className="w-2.5 h-2.5" />}
    badgeText="App available"
  />
);

const AndroidInstallPrompt = () => (
  <div className="relative w-full max-w-[200px] bg-gray-100 rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
    <div className="h-5 bg-gray-800 flex justify-between items-center px-3">
      <span className="text-[8px] text-gray-400">9:41</span>
      <div className="flex gap-1">
        <div className="w-3 h-2 border border-gray-400 rounded-sm" />
      </div>
    </div>
    <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-b border-gray-200">
      <div className="flex-1 flex items-center px-2 py-1 bg-gray-100 rounded-full text-[10px] text-gray-500">
        reigh.art
      </div>
      <MoreVertical className="w-4 h-4 text-gray-400" />
    </div>
    <div className="h-20 bg-gray-50" />
    <div className="flex items-center gap-2 px-3 py-2 bg-white border-t border-gray-200 animate-pulse ring-2 ring-wes-vintage-gold ring-inset">
      <img src="/favicon-32x32.png" alt="" className="w-8 h-8 rounded-lg" />
      <div className="flex-1">
        <div className="text-xs font-medium">Reigh</div>
        <div className="text-[10px] text-gray-500">reigh.art</div>
      </div>
      <div className="px-3 py-1 bg-blue-500 text-white text-xs font-medium rounded">
        Install
      </div>
    </div>
  </div>
);

const OpenInAppBadge = () => (
  <DesktopBrowserWithBadge
    badgeIcon={<img src="/favicon-32x32.png" alt="" className="w-3 h-3 rounded-sm" />}
    badgeText="Open in app"
  />
);

const MobileHomeScreenIcon = () => (
  <div className="relative w-full max-w-[140px] flex flex-col items-center gap-2">
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 shadow-lg flex items-center justify-center animate-pulse ring-2 ring-wes-vintage-gold ring-offset-2">
      <img src="/favicon-192x192.png" alt="Reigh" className="w-12 h-12 rounded-xl" />
    </div>
    <span className="text-xs text-gray-600 font-medium">Reigh</span>
  </div>
);

export const installVisuals = {
  chromeInstall: ChromeInstallIcon,
  safariShare: SafariShareIcon,
  chromeIosShare: ChromeIOSShareIcon,
  edgeIosShare: EdgeIOSShareIcon,
  ipadSafariShare: IPadSafariShareIcon,
  ipadChromeShare: IPadChromeShareIcon,
  ipadEdgeShare: IPadEdgeShareIcon,
  safariFileMenu: SafariFileMenu,
  edgeAppAvailable: EdgeAppAvailable,
  androidInstallPrompt: AndroidInstallPrompt,
  openInApp: OpenInAppBadge,
  mobileHomeIcon: MobileHomeScreenIcon,
};
