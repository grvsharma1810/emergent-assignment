#!/usr/bin/env node

/**
 * Build script for Pulse CLI
 *
 * This script uses esbuild to bundle the CLI into a single file,
 * then uses pkg to create standalone executables.
 */

const { build } = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Building Pulse CLI...\n');

// Step 1: Bundle with esbuild
console.log('Step 1: Bundling with esbuild...');

const bundleDir = path.join(__dirname, 'bundle');
if (!fs.existsSync(bundleDir)) {
  fs.mkdirSync(bundleDir, { recursive: true });
}

build({
  entryPoints: ['src/index.js'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'bundle/index.js',
  external: [
    // These packages need to be external because they have native dependencies
    // or special behaviors that don't work when bundled
  ],
}).then(() => {
  console.log('✅ Bundle created\n');

  // Make bundle executable
  fs.chmodSync('bundle/index.js', '755');

  // Step 2: Create package.json for bundle
  console.log('Step 2: Creating bundle package.json...');

  const bundlePackageJson = {
    name: "@grvsharma1810/pulse-cli",
    version: "1.0.0",
    bin: {
      pulse: "index.js"
    },
    pkg: {
      targets: ["node18-linux-x64", "node18-macos-x64", "node18-win-x64"],
      outputPath: "../dist"
    }
  };

  fs.writeFileSync(
    path.join(bundleDir, 'package.json'),
    JSON.stringify(bundlePackageJson, null, 2)
  );
  console.log('✅ Bundle package.json created\n');

  // Step 3: Build executables with pkg
  console.log('Step 3: Building executables with pkg...');

  // Create dist directory
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  try {
    // Build each target separately with correct output name
    console.log('  Building Linux binary...');
    execSync('npx pkg bundle/index.js --targets node18-linux-x64 --output dist/pulse-cli-linux', {
      stdio: 'inherit',
      cwd: __dirname
    });

    console.log('  Building macOS binary...');
    execSync('npx pkg bundle/index.js --targets node18-macos-x64 --output dist/pulse-cli-macos', {
      stdio: 'inherit',
      cwd: __dirname
    });

    console.log('  Building Windows binary...');
    execSync('npx pkg bundle/index.js --targets node18-win-x64 --output dist/pulse-cli-win.exe', {
      stdio: 'inherit',
      cwd: __dirname
    });

    console.log('\n✅ Executables created in dist/\n');

    // List created files
    const distDir = path.join(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      console.log('📦 Built binaries:');
      fs.readdirSync(distDir).forEach(file => {
        const stats = fs.statSync(path.join(distDir, file));
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`   - ${file} (${sizeMB} MB)`);
      });
    }

    console.log('\n✅ Build complete! Test with:');
    console.log('   ./dist/pulse-cli-macos --help');
    console.log('   ./dist/pulse-cli-linux --help');
    console.log('   .\\dist\\pulse-cli-win.exe --help');

  } catch (error) {
    console.error('❌ Failed to build executables:', error.message);
    process.exit(1);
  }
}).catch(error => {
  console.error('❌ Failed to bundle:', error);
  process.exit(1);
});
