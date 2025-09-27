import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useHashtagIndex } from './useHashtagIndex';
import { applySearchSelection } from './searchHighlighter';
import { useSearchUI } from './SearchUIContext';
import { tokenizeQuery } from './hashtagUtils';

/**
 * HashtagSearchBar
 * - Hidden by default; top-center fixed overlay when open
 * - Mobile-first: small screen shows only the icon (you render the icon near the top bar); tap opens
 * - Desktop: Ctrl/Cmd+F or "Search" button opens and autofocuses input
 *
 * Props:
 *  - nodes, edges: your current graph domain arrays
 *  - getNodeNotes(node?), getEdgeNotes(edge?) -> string(s)  (optional extractors)
 *  - getCy(): returns the mounted cytoscape instance (or null until ready)
 */
export default function HashtagSearchBar({ nodes, edges, getNodeNotes, getEdgeNotes, getCy }) {
  const { isOpen, close } = useSearchUI();
  const { getSuggestions, findMatchesFromTokens } = useHashtagIndex({ nodes, edges, getNodeNotes, getEdgeNotes });

  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Autofocus when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      // reset UI state
      setInput('');
      setSuggestions([]);
      setActiveIdx(0);
    }
  }, [isOpen]);

  // Tokens for running the search; suggestions now use the FULL input (mode-based)
  const tokens = useMemo(() => tokenizeQuery(input), [input]);

  const getSuggestionsRef = useRef(getSuggestions);
  getSuggestionsRef.current = getSuggestions;

  useEffect(() => {
    if (!isOpen) return;
    const q = input.trim();
    if (!q) {
      setSuggestions([]);
      setActiveIdx(0);
      return;
    }
    const suggs = getSuggestionsRef.current(input, 12);
    setSuggestions(suggs);
    setActiveIdx(0);
  }, [input, isOpen]);

  // Click off to close (on mobile overlay)
  useEffect(() => {
    function onDocClick(e) {
      if (!isOpen) return;
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close();
      }
    }
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [isOpen, close]);

  function addSuggestionToTokens(s) {
    // Insert suggestion *as shown*. No lowercasing, no quotes.
    const trimmed = input.trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const isHashtagSuggestion = s.startsWith('#');
    const startsWithHash = trimmed.startsWith('#');
    const multiWordNoHash = !startsWithHash && parts.length > 1 && !isHashtagSuggestion;

    if (multiWordNoHash) {
      // Phrase mode: replace the ENTIRE input with the chosen full place name
      setInput(s + ' ');
    } else {
      // Hashtag mode or single-word: replace the last token
      if (parts.length === 0) {
        setInput(s + ' ');
      } else {
        parts[parts.length - 1] = s;
        setInput(parts.join(' ') + ' ');
      }
    }

    setSuggestions([]);
    setActiveIdx(0);
  }

  function runSearch() {
    const toks = tokenizeQuery(input);
    const { nodeIds, edgeIds } = findMatchesFromTokens(toks);

    const cy = getCy?.();
    if (cy) {
      applySearchSelection({
        cy,
        nodeIds: Array.from(nodeIds),
        edgeIds: Array.from(edgeIds),
        alsoSelect: true
      });
    }

    // Fit camera to show all matched elements
    if (nodeIds.size > 0 || edgeIds.size > 0) {
      const nodeSelector = nodeIds.size > 0 
        ? Array.from(nodeIds).map(id => `#${CSS.escape(String(id))}`).join(', ')
        : '';
      const edgeSelector = edgeIds.size > 0 
        ? Array.from(edgeIds).map(id => `#${CSS.escape(String(id))}`).join(', ')
        : '';
      
      let combinedSelector = '';
      if (nodeSelector && edgeSelector) {
        combinedSelector = `${nodeSelector}, ${edgeSelector}`;
      } else if (nodeSelector) {
        combinedSelector = nodeSelector;
      } else if (edgeSelector) {
        combinedSelector = edgeSelector;
      }
      
      if (combinedSelector) {
        const matchedElements = cy.$(combinedSelector);
        cy.animate({ 
          fit: { 
            eles: matchedElements, 
            padding: 50 
          } 
        }, { 
          duration: 400, 
          easing: 'ease-in-out' 
        });
      }
    }

    // Clear suggestions dropdown
    setSuggestions([]);
    setActiveIdx(0);

    // Optionally close the entire search bar
    // close();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, Math.max(0, suggestions.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // If there are suggestions, commit the active one
      if (suggestions.length > 0) {
        addSuggestionToTokens(suggestions[activeIdx] || suggestions[0]);
      } 
      // If we have tokens (chips) in the input, run the search
      else if (tokens.length > 0) {
        runSearch();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  if (!isOpen) return null;

  // Minimal inline styles + tachyons utility classes
  return (
    <div
      ref={containerRef}
      style={{ pointerEvents: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        zIndex: 999,
        padding: '10px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start'
       }}
    >
      <div
        className="center mt3 br3 shadow-4 bg-black"
        style={{
          maxWidth: 720,
          pointerEvents: 'auto',
          border: '1px solid rgba(0,0,0,.1)'
        }}
      >
        <div className="pa2 flex items-center">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search hashtags & places…"
            className="input-reset pa2 w-100 bn"
            aria-label="Search hashtags and places"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <button
            className="ml2 pv2 ph3 br2 bg-black-80 white pointer"
            onClick={runSearch}
            title="Run search"
          >
            Search
          </button>
          <button
            className="ml2 pv2 ph3 br2 bg-transparent mid-gray pointer"
            onClick={close}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <ul className="list ma0 pa0" role="listbox" aria-label="Suggestions">
            {suggestions.map((s, i) => (
              <li
                key={s}
                role="option"
                aria-selected={i === activeIdx}
                className={`pa2 pointer ${i === activeIdx ? 'bg-gray' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation();
                  addSuggestionToTokens(s);
                  // Refocus input after selection
                  setTimeout(() => inputRef.current?.focus(), 0); 
                }}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
