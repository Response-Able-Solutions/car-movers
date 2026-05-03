import { build } from 'esbuild';

await build({
  entryPoints: [
    'src/trustid.ts',
    'src/verification.ts',
    'src/idenfy.ts',
    'src/monday.ts',
    'src/applicant-interview-sheet.ts',

  ],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['pdf-lib'],
});
