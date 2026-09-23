const {PrismaClient}=require('/srv/sakura/current/node_modules/@prisma/client');
const db=new PrismaClient();
db.session.deleteMany({where:{expiresAt:{lt:new Date(Date.now()-30*86400000)}}})
 .then(r=>console.log(JSON.stringify({expiredSessionsDeleted:r.count})))
 .catch(()=>{console.error('Session retention failed');process.exitCode=1})
 .finally(()=>db.$disconnect());
