import fetch from 'node-fetch';
import { netlify } from './netlify';
import { HttpError } from './http';

const SECRET = process.env.LOOPS_SO_SECRET;

