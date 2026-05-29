/**
 * copyToClipboard — works on both HTTPS (native Clipboard API) and plain HTTP
 * (execCommand fallback). The Clipboard API is restricted to secure contexts;
 * the VPS may be served over plain HTTP, so the fallback is essential.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for insecure origins (plain HTTP on VPS)
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
