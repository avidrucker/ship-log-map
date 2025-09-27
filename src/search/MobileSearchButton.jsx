import React from 'react';
import { useSearchUI } from './SearchUIContext';

export default function MobileSearchButton() {
  const { open } = useSearchUI();

  return (
    <button
      className="bn pa2 f3 white bg-transparent pointer flex justify-center items-center"
      onClick={open}
      aria-label="Open search"
      title="Search"
    >
      🔎
    </button>
  );
}
