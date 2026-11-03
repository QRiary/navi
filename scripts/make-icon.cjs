/**
 * ICON: build/icon.svg → build/icon.png (512×512, window and installer), public/icon.png (page icon)
 * and build/icon.ico (16–256, Windows shortcut).
 *
 * Run: npm run icon  (Electron draws in an invisible window — nothing appears on screen).
 * To change the icon: edit build/icon.svg and run the command again.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'build', 'icon.svg');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
/** Up to and including this size — the simplified variant (class small in icon.svg). */
const SMALL_MAX = 32;
const CANVAS = 512;

app.disableHardwareAcceleration();

/** ICO from several PNGs (the PNG-inside format — Windows Vista and newer). */
function makeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: CANVAS,
    height: CANVAS,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  try {
    let latest = null;
    win.webContents.on('paint', (_event, _dirty, image) => {
      if (!image.isEmpty()) latest = image;
    });
    win.webContents.setFrameRate(30);
    await win.loadURL('data:text/html,<body style="margin:0;background:transparent;overflow:hidden"><img id="i" style="display:block"></body>');

    const svgText = fs.readFileSync(SVG, 'utf8');
    /** Draws the SVG in the top-left corner at size×size and cuts it out of the frame. */
    async function render(size) {
      const svg = size <= SMALL_MAX ? svgText.replace('<svg ', '<svg class="small" ') : svgText;
      const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      await win.webContents.executeJavaScript(`new Promise((resolve) => {
        const img = document.getElementById('i');
        img.onload = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
        img.width = ${size}; img.height = ${size}; img.src = ${JSON.stringify(src)};
      })`);
      latest = null;
      win.webContents.invalidate();
      for (let i = 0; i < 50 && !latest; i++) await new Promise((r) => setTimeout(r, 40));
      if (!latest) throw new Error(`no frame for ${size}px`);
      const scale = latest.getSize().width / CANVAS; // screen scale, if it is not 100 %
      const crop = latest.crop({ x: 0, y: 0, width: Math.round(size * scale), height: Math.round(size * scale) });
      return (scale === 1 ? crop : crop.resize({ width: size, height: size, quality: 'best' })).toPNG();
    }

    const big = await render(512);
    fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), big);
    fs.writeFileSync(path.join(ROOT, 'public', 'icon.png'), big);
    const images = [];
    for (const size of ICO_SIZES) images.push({ size, png: await render(size) });
    fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), makeIco(images));
    console.log(`icon: build/icon.png, public/icon.png, build/icon.ico (${ICO_SIZES.join(', ')})`);
    app.exit(0);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
