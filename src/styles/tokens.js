// src/styles/tokens.js

export const COLORS = {
  gray:   { base: "#9E9E9E", bright: "#BDBDBD" },
  green:  { base: "#4CAF50", bright: "#81C784" },
  orange: { base: "#FF5722", bright: "#FF8A65" },
  purple: { base: "#6A0DAD", bright: "#9C27B0" },
  red:    { base: "#CD5C5C", bright: "#FF8A80" },
  blue:   { base: "#2196F3", bright: "#64B5F6" },

  white: "#FFFFFF",
  text:  "#FFFFFF",
  bg:    "#121212",
  edge:  "#ECECEC"
};

export const NODE_SIZES = {
  regular: { width: 120, height: 175, 
    "background-width": "120px",
    "background-height": "120px",
    "background-position-y": "52px",
    "text-margin-y": -61,
    "text-max-width": 115,
    "font-size": 15,
   },
  double:  { width: 240, height: 340,
    "background-width": "240px",
    "background-height": "240px",
    "background-position-y": "100px",
    "text-margin-y": -118,
    "text-max-width": 230,
    "font-size": 30,
   },
  small:   { width:  80, height: 120,
    "background-width": "75px",
    "background-height": "75px",
    "background-position-y": "42px",
    "text-margin-y": -38,
    "text-max-width": 78,
    "font-size": 12,
   }
};

export const BORDER = {
  width: 5,
  selectedWidth: 7
};
