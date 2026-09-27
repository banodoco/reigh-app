import { PublicAstridQualificationSurface } from './PublicAstridQualificationSurface.tsx';

export function PublicAstridShell() {
  return (
    <main
      data-astrid-public-entry="astrid-public-v1"
      style={{
        minHeight: '100vh',
        colorScheme: 'light',
        background: '#f7f3ea',
        color: '#241f18',
        padding: '32px',
        boxSizing: 'border-box',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ width: 'min(1120px, 100%)', margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', marginBottom: '28px' }}>
          <div>
            <p style={{ margin: 0, color: '#a4511e', fontSize: '13px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Astrid public preview</p>
            <h1 style={{ margin: '8px 0 0', fontFamily: 'Georgia, serif', fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 400 }}>Make the work visible.</h1>
          </div>
          <a
            href="/tools/video-editor"
            style={{ color: '#241f18', border: '1px solid #241f18', borderRadius: '999px', padding: '10px 16px', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Open Astrid
          </a>
        </header>
        <PublicAstridQualificationSurface />
      </div>
    </main>
  );
}
