import './PageSelector.css';

interface PageSelectorProps {
  pageCount: number;
  onJump: (pageIndex: number) => void;
}

/** Jump-to-page navigation for Full-score view. "Page" here is a navigation convenience, not a
 * real page break -- the score still renders as one continuous flow of systems (see
 * ScoreViewer's SYSTEMS_PER_PAGE); this just groups every few systems together and scrolls to
 * the start of whichever group is picked, the way flipping to a page in a printed score would
 * feel, without the blank space real pagination would add. Uncontrolled (no `value`) so
 * re-picking the page you're already viewing still fires a jump -- e.g. after scrolling away
 * from it by hand and wanting to snap back. */
export function PageSelector({ pageCount, onJump }: PageSelectorProps) {
  return (
    <div className="page-selector">
      <label htmlFor="page-selector-select">Jump to page</label>
      <select id="page-selector-select" defaultValue="" onChange={(e) => onJump(Number(e.target.value))}>
        <option value="" disabled>
          —
        </option>
        {Array.from({ length: pageCount }, (_, i) => (
          <option key={i} value={i}>
            {i + 1}
          </option>
        ))}
      </select>
      <span>of {pageCount}</span>
    </div>
  );
}
