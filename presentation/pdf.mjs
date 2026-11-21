import { chromium } from 'playwright-core';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('file:///Users/adityamiriyala/Desktop/Hacksgiving/presentation/slides/index.html?print');
await p.waitForTimeout(2500);
await p.emulateMedia({ media: 'print' });
await p.pdf({ path: '/Users/adityamiriyala/Desktop/Hacksgiving/presentation/Relay-MKE-pitch.pdf', width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
await b.close(); console.log('pdf ok');
