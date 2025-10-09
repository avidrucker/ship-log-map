// src/anim/appear.js

import { printDebug } from '../utils/debug.js';

export function animateHeightIn(ele, { duration = 600, easing = 'ease-out' } = {}) {
  printDebug(`🎬 [appear.js] Starting CSS animation for ${ele.id()}`);
  
  // Ensure the node has the entering class (should start at height 0)
  if (!ele.hasClass('node-entering')) {
    ele.addClass('node-entering');
    
    // Use a small delay to ensure the class is applied, then remove it to trigger transition
    setTimeout(() => {
      ele.removeClass('node-entering');
      printDebug(`✅ [appear.js] CSS animation triggered for ${ele.id()}`);
    }, 50);
  } else {
    // Already has entering class, just remove it to trigger transition
    ele.removeClass('node-entering');
    printDebug(`✅ [appear.js] CSS animation triggered for ${ele.id()}`);
  }
  
  // Return a promise that resolves when animation completes
  return new Promise(resolve => {
    setTimeout(() => {
      printDebug(`✅ [appear.js] CSS animation complete for ${ele.id()}`);
      resolve();
    }, duration);
  });
}

export function installAppearOnAdd(cy, { skipInitial = true, onlyWhenFlag = null } = {}) {
  let skip = !!skipInitial;
  printDebug(`🎬 [appear.js] Installing CSS animation handler, skipInitial: ${skip}`);

  // After the first render, consider app "ready" and animate subsequent adds
  if (skip) {
    cy.one('render', () => { 
      skip = false; 
      printDebug(`🎬 [appear.js] First render complete, CSS animations now enabled`);
    });
  }

  const handler = (evt) => {
    const ele = evt.target;
    printDebug(`🎬 [appear.js] Add event triggered for:`, ele.id(), 'classes:', ele.classes());
    
    if (!ele.isNode() || !ele.hasClass('entry')) {
      printDebug(`🎬 [appear.js] Skipping non-entry node:`, ele.id());
      return;
    }
    
    if (skip) {
      printDebug(`🎬 [appear.js] Skipping initial render for:`, ele.id());
      return;
    }
    
    if (onlyWhenFlag && !ele.data(onlyWhenFlag)) {
      printDebug(`🎬 [appear.js] Skipping node without flag '${onlyWhenFlag}':`, ele.id());
      return;
    }

    printDebug(`🎬 [appear.js] Starting CSS animation for node:`, ele.id());
    
    // Trigger CSS animation
    requestAnimationFrame(() => {
      console.log("css appear")
      animateHeightIn(ele, { duration: 600, easing: 'ease-out' });
      // Clear flag after animation
      if (onlyWhenFlag) {
        setTimeout(() => {
          ele.data(onlyWhenFlag, null);
        }, 600);
      }
    });
  };

  cy.on('add', 'node.entry', handler);
  return () => cy.off('add', 'node.entry', handler);
}