import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const COPY_DIRS = ['icons', 'src'];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function buildTarget(targetName, transformManifest) {
  const outDir = path.join(DIST, targetName);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const dir of COPY_DIRS) {
    copyRecursive(path.join(ROOT, dir), path.join(outDir, dir));
  }

  const baseManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const targetManifest = transformManifest(structuredClone(baseManifest));
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(targetManifest, null, 2) + '\n', 'utf8');
  return outDir;
}

export function buildAllBrowsers() {
  const chromiumDir = buildTarget('chromium', (m) => {
    delete m.background.scripts;
    delete m.browser_specific_settings;
    return m;
  });

  const firefoxDir = buildTarget('firefox', (m) => {
    delete m.background.service_worker;
    return m;
  });

  const safariDir = buildTarget('safari', (m) => {
    delete m.background.scripts;
    delete m.browser_specific_settings;
    m.content_scripts = m.content_scripts
      .filter((cs) => cs.world !== 'MAIN')
      .map((cs) => {
        const clone = { ...cs };
        delete clone.world;
        return clone;
      });
    return m;
  });

  return { chromiumDir, firefoxDir, safariDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = buildAllBrowsers();
  console.log('Builds gerados com sucesso:', dirs);
}
