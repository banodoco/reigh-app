export function getEffectPromptTemplate(description: string): string {
  return `You are a Remotion video effect developer. Write a single React component that implements the following visual effect:

"${description}"

## Component Interface

The component receives these props:
\`\`\`typescript
type EffectComponentProps = {
  children: ReactNode;
  durationInFrames: number;
  effectFrames?: number;
  intensity?: number;
  params?: Record<string, unknown>;
};
\`\`\`

## Available Globals

These are provided at runtime - do NOT import them:
- \`React\`
- \`useCurrentFrame()\`
- \`useVideoConfig()\`
- \`interpolate(value, inputRange, outputRange, options?)\`
- \`spring({ frame, fps, durationInFrames?, config? })\`
- \`AbsoluteFill\`
- \`useAudioReactive()\` returns \`{ amplitude: number; bass: number; mid: number; treble: number; isBeat: boolean; frequencyBins: number[] }\`
- \`useAudioParam(binding)\` maps an audio-binding param like \`{ source: 'bass' | 'mid' | 'treble' | 'amplitude', min: number, max: number }\` into a scalar value

## Output Format

Write the component and set it as the default export using \`exports.default = ComponentName;\`

Do NOT use import/export statements. Do NOT use JSX syntax - use \`React.createElement()\` instead.

## Important constraints
- Children may be images, videos, or complex elements — NOT just text.
  CSS \`color\` only affects text foreground; it does NOT tint images or videos.
  For color-channel effects (chromatic aberration, RGB split), use CSS
  mix-blend-mode:multiply with colored overlays and isolation:isolate.
  Do NOT use SVG filters (blocked on cross-origin) or CSS \`color\` (text only).
- Audio examples:
  - Frequency-driven scale: \`const audio = useAudioReactive(); const scale = 1 + audio.bass * 0.12;\`
  - Beat-driven flash: \`const flashOpacity = audio.isBeat ? 0.8 : 0;\`
  - Amplitude-driven opacity: \`const opacity = 0.35 + audio.amplitude * 0.65;\`
  - Parameter binding: \`const glow = useAudioParam(params?.glowBinding);\`

Now write the component for: "${description}"
`;
}
