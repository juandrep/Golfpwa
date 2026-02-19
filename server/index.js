import 'dotenv/config';
import { getApp } from './app.js';

const { PORT = 3001 } = process.env;

const app = await getApp();

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
