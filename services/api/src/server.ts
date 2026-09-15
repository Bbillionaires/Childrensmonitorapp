import { loadEnv } from "@app/config";
import { buildApp } from "./app.js";

const env = loadEnv();
const app = await buildApp();

app.listen({ port: env.API_PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
