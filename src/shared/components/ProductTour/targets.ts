export const TOUR_TARGETS = {
  GENERATIONS_PANE_TAB: 'generations-pane-tab',
  GENERATIONS_LOCK: 'generations-lock',
  GALLERY_SECTION: 'gallery-section',
  GENERATIONS_SPARKLES: 'generations-sparkles',
  FIRST_SHOT: 'first-shot',
  FIRST_VIDEO_OUTPUT: 'first-video-output',
  TIMELINE: 'timeline',
  STRUCTURE_VIDEO: 'structure-video',
  TASKS_PANE_TAB: 'tasks-pane-tab',
  TOOLS_PANE_TAB: 'tools-pane-tab',
  MEDIA_GALLERY_ITEM: 'media-gallery-item',
} as const;

export type TourTargetId = typeof TOUR_TARGETS[keyof typeof TOUR_TARGETS];

function tourTargetSelector(targetId: TourTargetId): string {
  return `[data-tour="${targetId}"]`;
}

export const TOUR_SELECTORS = {
  body: 'body',
  generationsPaneTab: tourTargetSelector(TOUR_TARGETS.GENERATIONS_PANE_TAB),
  generationsLock: tourTargetSelector(TOUR_TARGETS.GENERATIONS_LOCK),
  gallerySection: tourTargetSelector(TOUR_TARGETS.GALLERY_SECTION),
  generationsSparkles: tourTargetSelector(TOUR_TARGETS.GENERATIONS_SPARKLES),
  firstShot: tourTargetSelector(TOUR_TARGETS.FIRST_SHOT),
  firstVideoOutput: tourTargetSelector(TOUR_TARGETS.FIRST_VIDEO_OUTPUT),
  timeline: tourTargetSelector(TOUR_TARGETS.TIMELINE),
  structureVideo: tourTargetSelector(TOUR_TARGETS.STRUCTURE_VIDEO),
  tasksPaneTab: tourTargetSelector(TOUR_TARGETS.TASKS_PANE_TAB),
  toolsPaneTab: tourTargetSelector(TOUR_TARGETS.TOOLS_PANE_TAB),
  mediaGalleryItem: tourTargetSelector(TOUR_TARGETS.MEDIA_GALLERY_ITEM),
} as const;
