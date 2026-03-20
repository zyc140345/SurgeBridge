'use strict';

require('dotenv').config();

const gateway = require('@surgio/gateway');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

if (!Number.isInteger(PORT) || PORT <= 0) {
  throw new Error('PORT must be a positive integer.');
}

(async () => {
  const app = await gateway.bootstrapServer();

  await app.listen(PORT, HOST);
  console.log(`> Surgio gateway listening at http://${HOST}:${PORT}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

