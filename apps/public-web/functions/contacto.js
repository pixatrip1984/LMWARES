/**
 * Retired public route: redirect without inheriting tracking or diagnostic
 * query parameters into a URL that crawlers could discover.
 */
export function onRequest() {
  return Response.redirect('https://lmwares.com/', 301);
}
