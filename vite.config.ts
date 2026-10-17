import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';

/** Identifies this build so the app can tell when a newer one has been deployed. */
interface BuildInfo {
  id: string;
  sha: string;
  time: string;
}

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

const time = new Date().toISOString();
const sha = gitSha();
const build: BuildInfo = { id: `${sha}-${Date.parse(time).toString(36)}`, sha, time };

/** Writes version.json next to index.html; the "Get latest version" button compares against it. */
function versionFile(): Plugin {
  return {
    name: 'drift-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build) });
    },
  };
}

export default defineConfig({
  // Relative asset paths: works on GitHub Pages (served from /<repo>/) and inside a Capacitor app.
  base: './',
  define: {
    __BUILD__: JSON.stringify(build),
  },
  plugins: [versionFile()],
  build: {
    target: 'es2020',
  },
});
