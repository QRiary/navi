/**
 * Visual effects layer over the whole interface: scan lines
 * and noise, like an old monitor. It does not catch clicks.
 * The intensity is set in the settings (--scanline-opacity, --noise-opacity).
 */
export function EffectsOverlay() {
  return (
    <div className="fx-overlay" aria-hidden="true">
      <div className="fx-scanlines" />
      <div className="fx-noise" />
      <div className="fx-vignette" />
    </div>
  );
}
