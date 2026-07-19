/**
 * Bottom action bar: Play / Pass / Sort / Hint with snapshot-driven disabled
 * states, plus the controller's selectionError text. The error line reserves
 * its height so buttons never shift between snapshots.
 */
export interface ActionBarProps {
  canPlay: boolean;
  canPass: boolean;
  canHint: boolean;
  error: string | null;
  onPlay: () => void;
  onPass: () => void;
  onSort: () => void;
  onHint: () => void;
}

export function ActionBar({
  canPlay,
  canPass,
  canHint,
  error,
  onPlay,
  onPass,
  onSort,
  onHint,
}: ActionBarProps) {
  return (
    <div className="action-bar" data-testid="action-bar">
      <div className="action-buttons">
        <button type="button" className="btn btn-primary" disabled={!canPlay} onClick={onPlay}>
          Play
        </button>
        <button type="button" className="btn" disabled={!canPass} onClick={onPass}>
          Pass
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSort}>
          Sort
        </button>
        <button type="button" className="btn btn-ghost" disabled={!canHint} onClick={onHint}>
          Hint
        </button>
      </div>
      <div className="action-error" role="status" aria-live="polite">
        {error ?? ' '}
      </div>
    </div>
  );
}
