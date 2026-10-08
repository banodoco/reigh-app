import { useCallback, useLayoutEffect, useRef } from 'react';

/** Start loaded sessions at the latest turn before paint. Follow subsequent
 * content/viewport growth only while the reader has stayed near the bottom. */
export function useChatScroll(sessionKey: string | null, ready: boolean, contentCount: number) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const state = useRef({ sessionKey, ready: false, following: true, hadContent: false, readOffset: 0 });

  const positionIfFollowing = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !state.current.ready || !state.current.following || container.clientHeight === 0) return;
    // No passive effect, animation frame, or smooth animation: history should
    // never paint at its beginning and then travel down the whole conversation.
    container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
  }, []);

  useLayoutEffect(() => {
    if (state.current.sessionKey !== sessionKey) {
      state.current = { sessionKey, ready: false, following: true, hadContent: false, readOffset: 0 };
    }
    // A temporary empty/loading snapshot of an existing conversation is not
    // a user scroll to the bottom. Retain the reader's offset until it returns.
    const nextReady = ready && !(state.current.hadContent && contentCount === 0);
    const resuming = !state.current.ready && nextReady;
    state.current.ready = nextReady;
    if (ready && contentCount > 0) state.current.hadContent = true;
    if (resuming && !state.current.following) {
      scrollContainerRef.current?.scrollTo({ top: state.current.readOffset, behavior: 'instant' });
    }
    positionIfFollowing();
  });

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(positionIfFollowing);
    if (scrollContainerRef.current) observer.observe(scrollContainerRef.current);
    if (scrollContentRef.current) observer.observe(scrollContentRef.current);
    return () => observer.disconnect();
  }, [positionIfFollowing]);

  const onScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !state.current.ready || container.clientHeight === 0) return;
    state.current.readOffset = container.scrollTop;
    state.current.following = container.scrollHeight - container.clientHeight - container.scrollTop <= 40;
  }, []);

  return { scrollContainerRef, scrollContentRef, onScroll };
}
