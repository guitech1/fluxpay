import app from "./index.js";
import { env } from "./config/env.js";

app.listen(env.PORT, () => {
  console.log(`🚀 FluxPay API running on http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
});
