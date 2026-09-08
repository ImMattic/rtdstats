import "@testing-library/jest-dom";
import { server } from "./__tests__/mocks/handlers";

// jsdom doesn't implement matchMedia. lib/useTheme.ts calls it directly (not
// optionally) to track the OS "system" theme preference, which every
// component using useTheme/useChartTheme hits on mount — polyfill it here
// once instead of mocking it per test file.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated, kept for old addListener/removeListener API
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
}

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
