// screen = pan + zoom * ( [tx,ty] + s * [u,v] )
// => CSS: translate( pan + zoom*[tx,ty] ) scale( zoom * s )
export function bgCssTransform({ panX, panY, zoom, tx, ty, s }) {
  const translateX = panX + zoom * tx;
  const translateY = panY + zoom * ty;
  const scale = zoom * s;
  return `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}
