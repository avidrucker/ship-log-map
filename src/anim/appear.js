// src/anim/appear.js

export function animateHeightIn(ele, { duration = 1000, easing = 'ease-in-out' } = {}) {
  // Get the target height based on node size data
  const nodeSize = ele.data('size') || 'regular';
  const NODE_SIZE_MAP = {
    'regular': 175,
    'double': 350,
    'half': 87.5
  };
  
  let target = NODE_SIZE_MAP[nodeSize] || 175;
  
  console.log(`🎬 [appear.js] Starting animation for ${ele.id()}, size: ${nodeSize}, target height: ${target}`);
  
  // Ensure we start from zero height
  ele.style('height', 0);

  // Animate to the target height, then remove the bypass so stylesheet rules apply again
  return ele
    .animation({ style: { height: target } }, { duration, easing })
    .play()
    .promise('complete')
    .then(() => {
      ele.removeStyle('height'); // drop bypass, back to stylesheet
      console.log(`✅ [appear.js] Animation complete for ${ele.id()}`);
    });
}

export function installAppearOnAdd(cy, { skipInitial = true, onlyWhenFlag = null } = {}) {
  let skip = !!skipInitial;
  console.log(`🎬 [appear.js] Installing animation handler, skipInitial: ${skip}`);

  // After the first render, consider app "ready" and animate subsequent adds
  if (skip) {
    cy.one('render', () => { 
      skip = false; 
      console.log(`🎬 [appear.js] First render complete, animations now enabled`);
    });
  }

  const handler = (evt) => {
    const ele = evt.target;
    console.log(`🎬 [appear.js] Add event triggered for:`, ele.id(), 'classes:', ele.classes());
    
    if (!ele.isNode() || !ele.hasClass('entry')) {
      console.log(`🎬 [appear.js] Skipping non-entry node:`, ele.id());
      return;
    }
    
    if (skip) {
      console.log(`🎬 [appear.js] Skipping initial render for:`, ele.id());
      return;
    }
    
    if (onlyWhenFlag && !ele.data(onlyWhenFlag)) {
      console.log(`🎬 [appear.js] Skipping node without flag '${onlyWhenFlag}':`, ele.id());
      return;
    }

    console.log(`🎬 [appear.js] Animating node:`, ele.id());
    
    // Set initial height to 0 immediately to prevent blip
    ele.style('height', 0);
    
    // Defer animation to next frame to ensure initial state is rendered
    requestAnimationFrame(() => {
      animateHeightIn(ele, { duration: 600, easing: 'ease-out' });
      // If you used onlyWhenFlag, clear it so repeated renders won't retrigger:
      if (onlyWhenFlag) ele.data(onlyWhenFlag, null);
    });
  };

  cy.on('add', 'node.entry', handler);
  return () => cy.off('add', 'node.entry', handler);
}