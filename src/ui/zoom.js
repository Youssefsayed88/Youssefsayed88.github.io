// Pinch and double-tap zoom, refused — on the showroom route only.
//
// Three pieces, because no single one of them works everywhere:
//
//  - `user-scalable=no, maximum-scale=1` in index.html's viewport tag. Chrome
//    on Android honours it.
//  - `touch-action: manipulation` in the stylesheet. That is what stops a
//    double tap zooming; the canvas is already `touch-action: none`, which
//    stops it there and keeps a drag from turning into a page scroll.
//  - The `gesture*` listeners below. Safari on iOS has ignored `user-scalable`
//    since iOS 10 — deliberately, as an accessibility decision — and instead
//    delivers the pinch to the page as these events. Refusing them is the only
//    way to hold a fixed scale there.
//
// Deliberately NOT applied to classic.html. That page is a document someone
// reads, and a recruiter who needs to magnify it must be able to. The showroom
// is a game: the canvas already reads every drag as a look, and a zoomed-in
// viewport pushes the joystick and the Open button off the edge of the screen
// with no way to scroll them back.

const GESTURES = ['gesturestart', 'gesturechange', 'gestureend']

export function preventPinchZoom() {
  // `passive: false` is required — a passive listener cannot preventDefault,
  // and Safari treats touch-ish listeners as passive by default.
  const refuse = (event) => event.preventDefault()
  for (const type of GESTURES) {
    document.addEventListener(type, refuse, { passive: false })
  }
}
