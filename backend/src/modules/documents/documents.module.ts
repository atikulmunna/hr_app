import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentsController } from './documents.controller';

// Documents and compliance (T-3.4). Audit and notification services are global,
// and employees are read directly, so no module imports are needed.
@Module({
  controllers: [DocumentsController],
  providers: [DocumentService],
})
export class DocumentsModule {}
