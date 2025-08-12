// src/styles/tokens.js

export const COLORS = {
  gray:   { base: "#5e666a", bright: "#25271c" },
  green:  { base: "#2d6e4a", bright: "#008e53" },
  orange: { base: "#905e3b", bright: "#8e3b00" },
  purple: { base: "#3f2e71", bright: "#26008e" },
  red:    { base: "#903b3b", bright: "#8e0000" },
  blue:   { base: "#173b76", bright: "#0042ae" },

  white: "#FFFFFF",
  text:  "#FFFFFF",
  bg:    "#121212",
  edge:  "darkgray"
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
