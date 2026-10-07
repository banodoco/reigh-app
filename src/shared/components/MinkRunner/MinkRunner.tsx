import './MinkRunner.css';

/** Astrid's loading mark: the mink running in place over a streaming ground. Decorative only. */
export function MinkRunner({ className = '' }: { className?: string }) {
  return (
    <div className={`astrid-mink-runner ${className}`} aria-hidden="true">
      <span className="astrid-mink-runner-window"><span className="astrid-mink-runner-sprite" /></span>
      <span className="astrid-mink-runner-ground"><span /></span>
    </div>
  );
}
