/**
 * Centralized UI selector constants for Base UI data attributes.
 * Use these instead of hardcoding data-attribute selectors in hooks/CSS.
 */
export const UI_SELECTORS = {
  // Dialog
  dialogPopup: '[data-base-ui-popup][data-type="dialog"]',
  dialogBackdrop: '[data-base-ui-popup][data-type="backdrop"]',

  // Popover
  popoverPopup: '[data-base-ui-popup][data-type="popover"]',

  // Select
  selectPopup: '[data-base-ui-popup][data-type="select"]',

  // Scroll Area
  scrollAreaViewport: '[data-scroll-area-viewport]',

  // Generic floating
  positioner: '[data-base-ui-positioner]',
} as const
