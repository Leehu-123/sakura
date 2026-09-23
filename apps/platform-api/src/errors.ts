import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@sakura/database';
@Catch()
export class ApiErrors implements ExceptionFilter {
  private readonly logger = new Logger('API');
  catch(error: unknown, host: ArgumentsHost) {
    let status = 500;
    let message: string | string[] = 'Có lỗi hệ thống. Vui lòng thử lại.';
    if (error instanceof HttpException) {
      status = error.getStatus();
      const response = error.getResponse();
      message =
        typeof response === 'string'
          ? response
          : (response as { message: string | string[] }).message;
      if (status === 429) message = 'Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.';
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        status = 409;
        message = 'Thông tin này đã tồn tại.';
      }
      if (error.code === 'P2003') {
        status = 400;
        message = 'Thông tin liên kết không hợp lệ.';
      }
      if (error.code === 'P2025') {
        status = 404;
        message = 'Không tìm thấy dữ liệu.';
      }
      if (error.code === 'P2034') {
        status = 409;
        message = 'Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.';
      }
    }
    if (status === 500)
      this.logger.error('Lỗi nội bộ: ' + (error instanceof Error ? error.name : 'UnknownError'));
    host.switchToHttp().getResponse().status(status).json({ statusCode: status, message });
  }
}
