// Only static formatting is accepted from generated reports. Attributes, links,
// media, SVG and executable content never reach the live DOM.
export function safeReportHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const output = document.createElement('div');
  const allowed = new Set(['P', 'STRONG', 'UL', 'OL', 'LI', 'BR', 'EM']);
  function copy(node: Node, target: Node) {
    if (node.nodeType === Node.TEXT_NODE) { target.appendChild(document.createTextNode(node.textContent || '')); return; }
    if (!(node instanceof Element)) return;
    // SVG/MathML elements keep lowercase tagName in HTML documents; normalize first.
    const tag = node.tagName.toUpperCase();
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH', 'TEMPLATE'].includes(tag)) return;
    const parent = allowed.has(tag) ? document.createElement(tag.toLowerCase()) : target;
    if (parent !== target) target.appendChild(parent);
    node.childNodes.forEach(child => copy(child, parent));
  }
  parsed.body.childNodes.forEach(node => copy(node, output));
  return output.innerHTML;
}
