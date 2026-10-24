import '@testing-library/jest-dom';

// Polyfill ResizeObserver for Vitest / JSDOM environment (used by Recharts ResponsiveContainer)
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
