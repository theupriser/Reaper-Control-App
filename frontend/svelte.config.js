import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // Use the static adapter for Electron
    adapter: adapter({
      // Output directory for the static build
      // This should match the directory specified in the Electron main.js file
      fallback: 'index.html',
      precompress: false,
      strict: false
    }),
    // Use relative paths for assets
    paths: {
      base: '',
      assets: ''
    }
  },
};

export default config;