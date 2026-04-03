import serverless from 'serverless-http';
import app, { connectToDatabase } from '../server.js';

const serverlessHandler = serverless(app);

export const handler: serverless.Handler = async (event, context) => {
  // Ensure the database is connected before handling the request
  await connectToDatabase();
  return await serverlessHandler(event, context);
};

