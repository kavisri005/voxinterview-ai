import express from 'express';
import { apiRouter } from '../server/apiRouter.ts';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/api', apiRouter);

export default app;
