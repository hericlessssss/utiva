import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'web'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
