import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["test/**/*Behavior.test.{js,jsx}"],
    environment: "jsdom",
    clearMocks: true,
    restoreMocks: true,
  },
});
