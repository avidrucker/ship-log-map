// src/anim/appear.js
export function animateHeightIn(ele, { duration = 1000, easing = 'ease-in-out' } = {}) {
  // Read the final computed height *before* we override it.
  const target = parseFloat(ele.style('height')); // e.g. "160px" → 160
  if (!Number.isFinite(target)) return Promise.resolve();

  // Start from zero height (bypass)
  ele.style('height', 0);

  // Animate to the target height, then remove the bypass so stylesheet rules apply again
  return ele
    .animation({ style: { height: target } }, { duration, easing })  // element animation
    .play()
    .promise('complete')
    .then(() => ele.removeStyle('height')); // drop bypass, back to stylesheet
}

export function installAppearOnAdd(cy, { skipInitial = true, onlyWhenFlag = null } = {}) {
  let skip = !!skipInitial;

  // After the first render, consider app "ready" and animate subsequent adds
  if (skip) {
    cy.one('render', () => { skip = false; });
  }

  const handler = (evt) => {
    const ele = evt.target;
    if (!ele.isNode() || !ele.hasClass('entry')) return;     // only visible child nodes
    if (skip) return;                                        // ignore initial hydration
    if (onlyWhenFlag && !ele.data(onlyWhenFlag)) return;     // optional data gate

    // Defer one frame to ensure the stylesheet is applied before we read target height
    requestAnimationFrame(() => {
      animateHeightIn(ele);
      // If you used onlyWhenFlag, clear it so repeated renders won't retrigger:
      if (onlyWhenFlag) ele.data(onlyWhenFlag, null);
    });
  };

  cy.on('add', 'node.entry', handler);
  return () => cy.off('add', 'node.entry', handler);         // cleanup on unmount
}