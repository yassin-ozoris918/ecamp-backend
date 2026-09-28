const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { AdminService } = require('./dist/admin/admin.service');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const adminService = app.get(AdminService);
  
  const users = await adminService.getUsers({ isActive: false, take: 5 });
  console.log("Keys of first pending user:");
  console.log(Object.keys(users.items[0]));
  console.log("academicUniversity:", users.items[0].academicUniversity);
  console.log("educationLevel:", users.items[0].educationLevel);
  
  await app.close();
}
bootstrap();
