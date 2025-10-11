# Background Image Features - Fix Tracking

## Issue #1: Wire up Background Settings Modal ✅ FIXED

### What was broken:
- Background settings modal existed but UI controls needed improvement
- No visibility toggle in the modal
- Number inputs only (no sliders for better UX)

### What was fixed:
1. ✅ Added visibility checkbox to show/hide background
2. ✅ Added range sliders for Scale and Opacity (with number inputs)
3. ✅ Improved label layout for better readability
4. ✅ Added visual separator between visibility toggle and position controls

### How it works:
```
User adjusts modal settings
  ↓
onChange() called → changeBgImage()
  ↓
bgImage state updated
  ↓
bgCalibration memo recalculates (from x, y, scale)
  ↓
memoBgImage memo recalculates
  ↓
CytoscapeGraph receives new bgImage prop
  ↓
useEffect triggers ensureBgNode()
  ↓
Background node updated in Cytoscape
```

### What to test:
1. ✅ Open the Background Image Settings modal (hamburger menu or controls)
2. ✅ Load a background image
3. ✅ Toggle "Show Background Image" checkbox - background should appear/disappear
4. ✅ Adjust opacity slider (0-100%) - background should fade in/out smoothly
5. ✅ Adjust scale slider (10-500%) - background should resize
6. ✅ Change X/Y offset values - background should move
7. ✅ Click "Reset BG" button - all values should reset to defaults (x:0, y:0, scale:100, opacity:100)
8. ✅ Close and reopen modal - settings should persist
9. ✅ Refresh page - background image and settings should be restored from localStorage

---

## Issue #2: Background Image Not Showing on First Load ✅ FIXED

### What was broken:
- Background image loaded from localStorage wouldn't appear on page refresh
- Toggling visibility off/on would make it appear
- **Root cause**: Race condition between component mount and Cytoscape initialization
  - bgImage useEffect ran when component mounted (cy was null)
  - Cytoscape initialized later (cy became ready)
  - But useEffect never ran again because bgImage hadn't changed!

### What was fixed:
1. ✅ Added `isCyReady` state to track when Cytoscape is initialized
2. ✅ Set `isCyReady=true` when Cytoscape mount completes
3. ✅ Added `isCyReady` to background image useEffect dependencies
4. ✅ Now effect runs when EITHER bgImage changes OR cy becomes ready
5. ✅ Added comprehensive debug logging to track the issue
6. ✅ Added `cy.forceRender()` calls for stubborn rendering issues

### How it works now:
```
Page loads
  ↓
bgImage restored from localStorage
  ↓
CytoscapeGraph mounts
  ↓
cy.ready() waits for Cytoscape initialization
  ↓
ensureBgNode() creates background node
  ↓
Multiple render passes ensure visibility:
  - Immediate: cy.style().update()
  - Frame 1: cy.resize() + cy.forceRender()
  - 100ms later: cy.resize() + cy.forceRender() (for new nodes)
  - 50ms later: cy.forceRender() (for updates)
```

### What to test:
1. ✅ Load a background image
2. ✅ Set position, scale, opacity
3. ✅ Refresh the page (F5 or Ctrl+R)
4. ✅ **Check browser console** for these debug messages in order:
   - `📦 [useBgImageState] Loading from localStorage:` - Shows what's stored
   - `📦 [useBgImageState] Parsed bg image:` - Shows parsed data
   - `📦 [useBgImageState] Returning normalized bg image:` - Shows final values
   - `🔄 [useBgImageState] Calibration recalculating:` - Shows calibration values
   - `🔄 [App] memoBgImage recalculating:` - Shows if memo is being created
   - `🎨 [CytoscapeGraph] Background image effect triggered` - Shows what CytoscapeGraph receives
   - `✅ [CytoscapeGraph] Cytoscape ready, calling ensureBgNode` - Confirms ensureBgNode is called
   - `🖼️ [bgNodeAdapter] Background geometry calculated` - Shows node creation
5. ✅ Background should appear immediately on page load
6. ✅ No need to toggle visibility to make it appear

### Debug Information:
If background doesn't show, check console for:
- If `memoBgImage` is `null` → imageUrl not being loaded from localStorage
- If `ensureBgNode` isn't called → bgImage prop not reaching CytoscapeGraph
- If geometry is wrong → calibration values incorrect

---

## Issue #3: Background Image "Include in Export" Toggle ✅ FIXED

### What was broken:
- Background image had an `included` property but no UI to toggle it
- Export functionality saved background metadata even when `included: false`
- Users couldn't control whether background appears in exported JSON

### What was fixed:
1. ✅ Added "Include in Export" checkbox to background settings modal
2. ✅ Positioned below "Show Background Image" toggle
3. ✅ Updated export logic to only include `bgImage` when `included: true`
4. ✅ Export now respects user preference for background inclusion

### How it works:
```
User toggles "Include in Export" checkbox
  ↓
onChange() updates bgImage.included
  ↓
When exporting (serializeGraph):
  - If included: true → bgImage exported with position/scale/opacity
  - If included: false → bgImage completely omitted from export
  ↓
Exported JSON is cleaner and respects user choice
```

### What to test:
1. ✅ Open Background Image Settings modal
2. ✅ Check "Include in Export" checkbox
3. ✅ Export the map (download JSON)
4. ✅ Verify `bgImage` object appears in exported JSON
5. ✅ Uncheck "Include in Export" checkbox  
6. ✅ Export again
7. ✅ Verify `bgImage` is NOT in the exported JSON
8. ✅ Note: Data URLs are never exported (only CDN URLs) to keep file size small

---

## Summary: All Critical Background Features Restored! ✅

All the background image features that regressed during the CSS-to-Node conversion have been successfully restored:

### ✅ Completed Fixes:

1. **Background Settings Modal UI** - Added sliders, visibility toggle, and better layout
2. **Background Loads on Page Refresh** - Fixed race condition with `isCyReady` state
3. **Include in Export Toggle** - Background can now be excluded from exported JSON
4. **Debug Logging Cleaned Up** - Removed verbose console logs, kept essential debug messages

### 🎯 What Works Now:

- ✅ Background image loads from localStorage on refresh
- ✅ Background moves perfectly in sync with canvas (no lag!)
- ✅ All settings (position, scale, opacity, visibility) work live
- ✅ Settings persist across page reloads
- ✅ Export respects "Include in Export" checkbox
- ✅ Data URLs not exported (keeps files small)
- ✅ Modal has intuitive sliders and controls

### 🔧 Technical Improvements Made:

1. **Fixed timing issues** - Added `isCyReady` state to ensure Cytoscape initialization
2. **Improved rendering** - Multiple render passes with `cy.forceRender()` for reliability
3. **Better memoization** - Proper dependency tracking prevents infinite loops
4. **Cleaner export logic** - Only exports background when `included: true`
5. **Enhanced UI** - Range sliders with number inputs for better UX

---

## Future Enhancements (Optional):

### Issue: Interactive Background Repositioning
**Status**: Future enhancement
- Allow dragging background node to reposition
- Would need to unlock node and capture position changes
- Could add resize handles for scale adjustment

### Issue: Background Image from CDN URL
**Status**: Enhancement
- Currently only supports file upload (data URLs)
- Could add text input for CDN image URLs
- Would persist CDN URLs in exports (unlike data URLs)

---

## Performance Notes:

The node-based approach (current) vs CSS-based approach (old):
- ✅ **Better**: Zero lag between canvas and background
- ✅ **Better**: Single rendering pipeline (Cytoscape handles everything)
- ✅ **Better**: Native pan/zoom transforms
- ⚠️ **Trade-off**: Slightly more complex state management
- ⚠️ **Trade-off**: Background is locked (can't drag to reposition visually)

The performance improvements far outweigh the trade-offs!