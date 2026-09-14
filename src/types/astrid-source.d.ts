declare module '@astrid/*' {
  const AstridSequenceComponent: (props: {
    clip: unknown;
    params?: Record<string, unknown>;
    theme?: unknown;
    fps: number;
  }) => import('react').ReactElement | null;

  export default AstridSequenceComponent;
}
