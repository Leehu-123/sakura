import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { PrismaClient } from '@sakura/database';
async function main() {
  if (!process.env.REDIS_URL || !process.env.DATABASE_URL)
    throw new Error('Thiếu cấu hình kết nối.');
  const redis = new URL(process.env.REDIS_URL);
  const connection = {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: redis.username || undefined,
    password: redis.password || undefined,
    ...(redis.protocol === 'rediss:' ? { tls: {} } : {}),
  };
  const db = new PrismaClient();
  await db.$connect();
  const queue = new Queue('platform-maintenance', { connection });
  const worker = new Worker(
    'platform-maintenance',
    async (job) => {
      if (job.name !== 'expire-sessions') throw new Error('Loại công việc chưa được hỗ trợ.');
      const cutoff = new Date(Date.now() - 30 * 86400000);
      const result = await db.session.deleteMany({ where: { expiresAt: { lt: cutoff } } });
      return { deleted: result.count };
    },
    { connection, concurrency: 1 },
  );
  worker.on('failed', (job) => console.error('Công việc nền thất bại:', job?.name));
  worker.on('error', () => console.error('Worker mất kết nối. Đang chờ kết nối lại.'));
  await queue.upsertJobScheduler(
    'session-retention',
    { every: 86400000 },
    {
      name: 'expire-sessions',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    },
  );
  console.log('Worker bảo trì đã sẵn sàng. Chưa bật tích hợp Messenger/VNPost.');
  const close = async () => {
    await worker.close();
    await queue.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}
main().catch(() => {
  console.error('Không khởi động được worker.');
  process.exit(1);
});
