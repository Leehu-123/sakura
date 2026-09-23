import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json } from 'express';
import { ApiErrors } from './errors';
import { configuration } from './config';
export function configureApp(app: INestApplication, docs = true) {
  const config = configuration();
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: config.origin, credentials: true });
  app.use(helmet());
  app.use(
    json({
      limit: '1mb',
      verify: (req, _res, buffer) => {
        if (req.url?.split('?')[0] === '/api/v1/messenger/webhook')
          (req as typeof req & { rawBody: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(cookieParser());
  app.use(
    (
      _req: unknown,
      res: { setHeader: (name: string, value: string) => void },
      next: () => void,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
  const labels: Record<string, string> = {
    content: 'Nội dung CSV',
    kind: 'Loại dữ liệu nhập',
    fileName: 'Tên file',
    mapping: 'Ánh xạ cột',
    digest: 'Bản xác nhận',
    phone: 'Số điện thoại',
    address: 'Địa chỉ',
    version: 'Phiên bản dữ liệu',
    userId: 'Người nhận',
    reason: 'Lý do',
    note: 'Ghi chú',
    variants: 'Biến thể',
    items: 'Sản phẩm trong đơn',
    price: 'Đơn giá',
    discount: 'Giảm giá',
    shippingFee: 'Phí giao hàng',
    paidAmount: 'Tiền đã thu',
    customerId: 'Khách hàng',
    customerVersion: 'Thông tin khách',
    email: 'Email',
    displayName: 'Họ tên',
    password: 'Mật khẩu',
    currentPassword: 'Mật khẩu hiện tại',
    roleIds: 'Vai trò',
    page: 'Số trang',
    pageSize: 'Số dòng',
    search: 'Từ khóa',
    status: 'Trạng thái',
    code: 'Mã',
    name: 'Tên',
    description: 'Mô tả',
    grants: 'Quyền và phạm vi',
    fullName: 'Họ tên',

    regionId: 'Khu vực',
    branchId: 'Chi nhánh',
    departmentId: 'Phòng ban',
  };
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new BadRequestException(
          errors.map((error) => {
            if (error.constraints?.whitelistValidation)
              return 'Yêu cầu có thông tin không được phép.';
            if (error.constraints?.minLength && error.property === 'password')
              return 'Mật khẩu phải có ít nhất 12 ký tự.';
            if (error.constraints?.maxLength && error.property === 'password')
              return 'Mật khẩu không được quá 128 ký tự.';
            return (labels[error.property] || 'Thông tin') + ' chưa hợp lệ. Vui lòng kiểm tra lại.';
          }),
        ),
    }),
  );
  app.useGlobalFilters(new ApiErrors());
  if (docs) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Sakura Platform API')
        .setDescription(
          'Tài khoản, phân quyền, danh mục sản phẩm dùng chung; khách hàng, chăm sóc, bàn giao và đơn hàng. Có nhập Sapo bằng CSV và tra cứu đơn lịch sử. Messenger/VNPost chưa được bật.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: false },
    });
  }
  app.enableShutdownHooks();
}
