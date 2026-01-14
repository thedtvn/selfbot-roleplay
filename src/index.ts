import Clients from './core/Client';
import { config } from 'dotenv';

if (!process.env.IS_DOCKER) { // Only load .env when not in docker
    config();
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => { 
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const client = new Clients();

client.start();
