export function escapePrintHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/**
 * Print without opening a second browser tab/window. This is important on
 * mobile: external print tabs/viewers often hide navigation/back controls.
 * The app page remains the active document after the print dialog closes.
 */
export function printHtmlInFrame(html, { title = "Print", width = "80mm", height = "auto" } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") return reject(new Error("Printing is only available in the browser"))
    const iframe = document.createElement("iframe")
    iframe.setAttribute("aria-hidden", "true")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "1px"
    iframe.style.height = "1px"
    iframe.style.border = "0"
    iframe.style.opacity = "0"
    iframe.style.pointerEvents = "none"
    document.body.appendChild(iframe)
    const frameWindow = iframe.contentWindow
    const cleanup = () => setTimeout(() => iframe.remove(), 500)
    try {
      frameWindow.document.open()
      const pageSize = height === "auto" ? width : `${width} ${height}`
      frameWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapePrintHtml(title)}</title><style>@page{size:${pageSize};margin:0}html,body{margin:0;padding:0;background:#fff;color:#111}*{box-sizing:border-box}@media print{html,body{width:${width};max-width:${width};overflow:visible}}</style></head><body>${html}</body></html>`)
      frameWindow.document.close()
      const doPrint = async () => {
        try {
          if (frameWindow.document.fonts?.ready) await frameWindow.document.fonts.ready
          const images = Array.from(frameWindow.document.images || [])
          await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.addEventListener("load", resolve, { once:true }); img.addEventListener("error", resolve, { once:true }) })))
          frameWindow.focus()
          frameWindow.print()
          cleanup()
          resolve()
        } catch (e) {
          cleanup()
          reject(e)
        }
      }
      frameWindow.addEventListener("afterprint", cleanup, { once: true })
      setTimeout(() => { doPrint() }, 250)
    } catch (e) {
      cleanup()
      reject(e)
    }
  })
}
