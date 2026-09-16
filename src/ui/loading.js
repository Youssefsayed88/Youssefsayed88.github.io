// Thumbnails fade in once decoded, over a shimmer, instead of popping in.
//
// Images the browser already has are marked before the class that hides the
// rest goes on, in the same task, so nothing already on screen blinks out. And
// only this script adds that class, so with JavaScript off every image shows
// the moment it arrives, as before.

export function fadeInThumbnails(root) {
  for (const img of root.querySelectorAll('.lv-thumb img')) {
    const done = () => img.classList.add('is-loaded')
    // `complete` is also true for an image that failed, which should stop
    // shimmering too.
    if (img.complete) done()
    else {
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    }
  }
  root.classList.add('fades-images')
}
