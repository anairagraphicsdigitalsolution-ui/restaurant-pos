export function getQRUrl({ type, id, domain }) {
  return `${domain}/order?type=${type}&id=${id}`
}