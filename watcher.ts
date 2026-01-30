import { checkSession } from "./utils/session";

checkSession()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(`❌ Chequeo fallido: ${err.message}`);
    process.exit(1);
  });
