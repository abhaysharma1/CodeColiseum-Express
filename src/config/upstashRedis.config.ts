import { Redis } from "@upstash/redis";


// redis instance for ai practice review worker


export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});