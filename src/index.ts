import Clients from './core/Client';
import { config } from 'dotenv';

if (!process.env.IS_DOCKER) { // Only load .env when not in docker
    config();
}

const client = new Clients();

client.start();
