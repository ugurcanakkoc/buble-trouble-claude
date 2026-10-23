// Fullscreen + landscape lock for phones, plus a ⛶ toggle button.
// Browser chrome steals height in landscape, so touch devices go fullscreen on the first tap.
// iPhone Safari has no element fullscreen: there we hint "Ana Ekrana Ekle" (manifest display: fullscreen).
import { h, load, save, toast } from './dom';

const isTouch = matchMedia('(pointer: coarse)').matches;
const supported = !!document.documentElement.requestFullscreen;
const isFull = () => !!document.fullscreenElement;
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;

async function enter(): Promise<void> {
  if (!supported || isFull()) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // lock() isn't in every TS lib version and throws on desktop/iOS; best effort only
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    /* denied or unsupported: the FIT scaler still fits the visible area */
  }
}

/** Mounts ⛶ next to ⚙/🔊 and auto-enters fullscreen on touch devices (idempotent). */
export function mountFullscreen(): void {
  if (document.querySelector('.fs')) return;

  if (supported) {
    const btn = h('button', { class: 'mute fs', title: 'Tam ekran', 'aria-label': 'Tam ekran', text: '⛶' });
    btn.addEventListener('click', () => {
      if (isFull()) void document.exitFullscreen().catch(() => {});
      else void enter();
      btn.blur();
    });
    document.body.append(btn);
  }

  if (!isTouch || standalone) return;
  if (supported) {
    // pointerup counts as a user gesture; capture so Phaser's canvas handlers can't swallow it
    window.addEventListener('pointerup', () => void enter(), { capture: true });
  } else if (load('bubble.iosHint') !== '1') {
    save('bubble.iosHint', '1');
    toast('Tam ekran için: Paylaş → Ana Ekrana Ekle');
  }
}
