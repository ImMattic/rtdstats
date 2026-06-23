import "@testing-library/jest-dom";
import { server } from "./__tests__/mocks/handlers";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
