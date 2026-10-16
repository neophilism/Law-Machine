# Law Machine design primitives (LM-005)

A restrained civic-systems interface: paper, ink, source documents, institutions and clear routes. The UI does not turn illustrative examples into legal conclusions. This is a component preview, not a release pack, source browser or event simulator.

## Controls

- \`ActionButton\`: button semantics, visible hover/focus/disabled states, no inert decorative controls.
- \`ModelTabs\`: automatic activation, roving \`tabIndex\`, ArrowLeft/ArrowRight/Home/End, selected state and tabpanel associations. The keyboard-visible tab and panel share the same state.
- \`ExplainDialog\`: native modal dialog, focus containment, Escape dismissal, explicit close button and focus restoration to its opener. No keyboard-capturing overlay scripts.
- \`SourceInspector\`: explicit "Not verified" label until a pinned source is available.
- \`StatusLabel\`: text and border styles always accompany color. Distinguishes draft, hypothetical, partial and unverified rather than collapsing them into success.
- \`LoadingNotice\` / \`ErrorNotice\`: role=status and role=alert, separate from real application errors. Examples are marked as such.

The design route uses invented receiving/review-office roles and no authentic legal quote. Main-screen labels explain the difference between future capabilities and present working controls. The public homepage links to the preview.

## Contrast, motion and size

Target WCAG 2.2 AA: text contrast at least 4.5:1 for body type and 3:1 for large type; keyboard focus visible with 3px outline. Computed sRGB contrast ratios for the key pairs: ink/paper 11.17:1, primary deep ink/cream 11.67:1, draft 7.40:1, hypothetical 7.77:1, partial 7.73:1, unverified 7.18:1. Browser axe validation and human legibility remain different checks.

Responsive two-column preview becomes single column below 760px. Tab headers scroll internally without widening the viewport. Native dialog respects viewport bounds. The existing global \`prefers-reduced-motion: reduce\` stylesheet disables animation and animated scrolling; the only hover transform is also suppressed by that media query.

## Extensions

Future model releases will populate inspectors and scene controls from verified contract data, not by embedding rules in React. This preview intentionally has no source release, simulation results, government receipt or deadline calculator. Components avoid new dependencies and provider data.
