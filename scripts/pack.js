import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, '414Extensions');
const distDir = path.join(rootDir, 'dist');
const stageDir = path.join(distDir, 'package_stage');
const zipOutput = path.join(rootDir, '414Extensions.zip');

console.log('--- Packaging 414 Extensions for Distribution ---');

// Excluded patterns (relative to 414Extensions)
const EXCLUDED_PATTERNS = [
  /^tests[\/\\]/,
  /^tests$/,
  /^test_e2e_demo\.html$/,
  /\.DS_Store$/i,
  /Thumbs\.db$/i,
  /\.git/i,
  /\.idea/i
];

function shouldExclude(relPath) {
  return EXCLUDED_PATTERNS.some(regex => regex.test(relPath));
}

// 1. Clean previous build artifacts
if (fs.existsSync(zipOutput)) {
  fs.unlinkSync(zipOutput);
  console.log('Removed existing 414Extensions.zip');
}
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

fs.mkdirSync(stageDir, { recursive: true });

// 2. Copy production files to stageDir
let fileCount = 0;
function copyRecursive(currentSrc, currentRel) {
  const items = fs.readdirSync(currentSrc);
  for (const item of items) {
    const itemRel = currentRel ? `${currentRel}/${item}` : item;
    if (shouldExclude(itemRel)) {
      continue;
    }
    const fullSrc = path.join(currentSrc, item);
    const fullDest = path.join(stageDir, itemRel);
    const stat = fs.statSync(fullSrc);

    if (stat.isDirectory()) {
      fs.mkdirSync(fullDest, { recursive: true });
      copyRecursive(fullSrc, itemRel);
    } else {
      fs.mkdirSync(path.dirname(fullDest), { recursive: true });
      fs.copyFileSync(fullSrc, fullDest);
      fileCount++;
    }
  }
}

copyRecursive(srcDir, '');
console.log(`Staged ${fileCount} production files in ${stageDir}`);

// 3. Verify manifest.json exists in stageDir
const stageManifest = path.join(stageDir, 'manifest.json');
if (!fs.existsSync(stageManifest)) {
  console.error('ERROR: manifest.json not found in stage directory!');
  process.exit(1);
}

// 4. Create ZIP bundle using bsdtar (built-in Windows tar) or PowerShell Compress-Archive
console.log('Creating ZIP archive...');
try {
  // Using tar -a -c -f from within stageDir ensures root of ZIP contains manifest.json directly
  execSync(`tar -a -c -f "${zipOutput}" *`, { cwd: stageDir, stdio: 'inherit' });
} catch (err) {
  console.warn('tar failed, attempting PowerShell Compress-Archive fallback...', err.message);
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipOutput}' -Force"`, { stdio: 'inherit' });
}

// 5. Verify the ZIP was generated and check its size
if (!fs.existsSync(zipOutput)) {
  console.error('ERROR: Failed to create ZIP output file!');
  process.exit(1);
}

const zipStat = fs.statSync(zipOutput);
const zipSizeKB = (zipStat.size / 1024).toFixed(2);
console.log(`\nSUCCESS: 414Extensions.zip created!`);
console.log(`Path: ${zipOutput}`);
console.log(`Size: ${zipSizeKB} KB (${zipStat.size} bytes)`);

// 6. List archive contents to confirm manifest.json is at root
console.log('\nInspecting archive structure:');
try {
  const listing = execSync(`tar -tf "${zipOutput}"`, { encoding: 'utf8' });
  const entries = listing.trim().split(/\r?\n/);
  console.log(`Archive contains ${entries.length} entries.`);
  const hasRootManifest = entries.some(e => e === 'manifest.json' || e === './manifest.json');
  console.log(`Root manifest.json verified: ${hasRootManifest ? 'YES' : 'NO'}`);
} catch (e) {
  console.log('Could not list archive entries with tar:', e.message);
}

// 7. Cleanup staging directory
try {
  fs.rmSync(distDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log('Staging directory cleaned up.\nPackaging complete!');
} catch (e) {
  console.warn('Note: Staging directory will be removed on next build:', e.message);
  console.log('\nPackaging complete!');
}
