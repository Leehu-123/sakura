export async function printSlip(element: HTMLElement) {
  const frame = document.createElement('iframe');
  frame.title = 'In phiếu giao hàng Sakura';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    throw new Error('Trình duyệt không mở được bản in.');
  }
  const title = doc.createElement('title');
  title.textContent = 'Phiếu giao hàng Sakura';
  doc.head.appendChild(title);
  const style = doc.createElement('style');
  style.textContent =
    'body{font:14px Arial,sans-serif;color:#111;margin:24px}img{width:64px;height:64px;object-fit:contain}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}tr{break-inside:avoid}small{overflow-wrap:anywhere}@page{margin:15mm}';
  doc.head.appendChild(style);
  // Clone rendered, escaped React content into an isolated document so other app panels do not print.
  doc.body.appendChild(element.cloneNode(true));
  await Promise.all(Array.from(doc.images).map((img) => img.decode().catch(() => undefined)));
  frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 120000);
}
